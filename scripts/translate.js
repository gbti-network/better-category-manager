/**
 *Better Category Manager Translation System - Main Script
 * 
 * Orchestrates the translation workflow:
 * 1. Generates POT file and tracks string changes
 * 2. Prompts user for translation mode
 * 3. Generates translations
 * 4. Compiles MO files (optional)
 * 5. Generates report
 */

const generatePOT = require('./translations/generate-pot');
const generateTranslations = require('./translations/generate-translations');
const compileMO = require('./translations/compile-mo');
const scanTranslations = require('./translations/scan-translations');
const translationState = require('./translations/translation-state');
const generateReport = require('./translations/generate-report');
const readline = require('readline');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Prompt helper function
async function prompt(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim());
            rl.close();
        });
    });
}

// Configuration management
function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    const defaultConfig = {
        languages: {
            es_ES: { enabled: true, name: 'Spanish', code: 'es' },
            de_DE: { enabled: true, name: 'German', code: 'de' }
        }
    };

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return {
            ...defaultConfig,
            ...config,
            openai_api_key: process.env.OPENAI_API_KEY || config.openai_api_key
        };
    } catch (error) {
        console.warn('Warning: Could not load configuration. Using defaults.');
        return {
            ...defaultConfig,
            openai_api_key: process.env.OPENAI_API_KEY
        };
    }
}

// Main translation update function
async function updateTranslations(options = {}) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    try {
        console.log('🌍 Starting translation update process...\n');
        
        // Initialize translation state
        await translationState.initialize();
        
        // Load configuration
        const config = loadConfig();
        
        // Step 1: Generate POT file and analyze changes
        console.log('Step 1: Generating POT file and analyzing changes');
        console.log('---------------------------------------------');
        
        const scanResults = await scanTranslations();
        const changes = await translationState.compareStrings(scanResults.strings);
        
        // Display changes
        console.log('\nString Analysis:');
        console.log(`Total strings: ${Object.keys(scanResults.strings).length}`);
        console.log(`New strings: ${changes.new.length}`);
        console.log(`Modified strings: ${changes.modified.length}`);
        console.log(`Removed strings: ${changes.removed.length}`);

        let shouldTranslate = false;
        let translateAll = false;
        const generatedMoFiles = [];
        let translatedStrings = [];

        // Determine if we should translate based on changes and user input
        if (options.nonInteractive) {
            // In non-interactive mode, only translate if there are changes
            shouldTranslate = changes.new.length > 0 || changes.modified.length > 0;
            translateAll = false;
            console.log('\nNon-interactive mode - will translate only new and modified strings.');
        } else if (options.force) {
            // Force flag always translates all strings
            shouldTranslate = true;
            translateAll = true;
            console.log('\nForce flag detected - will translate all strings.');
        } else if (changes.new.length > 0 || changes.modified.length > 0) {
            // There are changes - ask about translation mode
            console.log('\nTranslation Mode:');
            const mode = await new Promise((resolve) => {
                rl.question(
                    'Would you like to translate:\n' +
                    '1. All strings (full translation)\n' +
                    '2. Only new and modified strings (incremental)\n' +
                    'Enter choice (1/2): ',
                    (answer) => resolve(answer.toLowerCase().trim())
                );
            });
            
            shouldTranslate = true;
            translateAll = mode === '1';
        } else {
            // No changes - ask if user wants to translate anyway
            const answer = await new Promise((resolve) => {
                rl.question('\nNo new or modified strings found. Would you like to translate all strings anyway? (y/n): ',
                    (answer) => resolve(answer.toLowerCase().trim())
                );
            });
            shouldTranslate = answer === 'y';
            translateAll = true;
        }
        
        // Step 2: Update translations if needed
        let translatedStringsCount = 0;
        if (shouldTranslate) {
            console.log('\nStep 2: Updating translations');
            console.log('---------------------------');
            
            const stringsToTranslate = translateAll 
                ? scanResults.strings
                : Object.fromEntries(
                    [...changes.new, ...changes.modified]
                        .map(key => [key, scanResults.strings[key]])
                );
            
            translatedStringsCount = Object.keys(stringsToTranslate).length;
            translatedStrings = Object.entries(stringsToTranslate).map(([key, value]) => `${key}: ${value}`);
            
            for (const locale of Object.keys(config.languages)) {
                const lang = config.languages[locale];
                if (!lang.enabled) continue;
                
                try {
                    console.log(`\nProcessing ${lang.name} (${locale})...`);
                    await generateTranslations({
                        locale,
                        strings: stringsToTranslate,
                        config,
                        apiKey: config.openai_api_key
                    });
                } catch (error) {
                    console.error(`❌ Error updating translations for ${locale}:`, error.message);
                }
            }
        } else {
            console.log('\nSkipping translations as no changes were detected.');
        }
        
        // Step 3: Ask about MO compilation
        if (!options.noMo && !options.nonInteractive) {
            const compileMoFiles = await new Promise((resolve) => {
                rl.question('\nWould you like to compile MO files now? (y/n): ',
                    (answer) => resolve(answer.toLowerCase().trim())
                );
            });
            
            if (compileMoFiles === 'y') {
                console.log('\nStep 3: Compiling MO files');
                console.log('------------------------');
                
                for (const locale of Object.keys(config.languages)) {
                    const lang = config.languages[locale];
                    if (!lang.enabled) continue;
                    
                    try {
                        await compileMO(locale);
                        generatedMoFiles.push(`${locale}.mo`);
                        console.log(`✓ Compiled MO file for ${lang.name}`);
                    } catch (error) {
                        console.error(`❌ Error compiling MO file for ${locale}:`, error.message);
                    }
                }
            }
        }

        // Step 4: Generate Report
        try {
            await generateReport({
                pluginName: 'Radle Lite',
                totalStrings: Object.keys(scanResults.strings).length,
                newStrings: translatedStringsCount,
                removedStrings: changes.removed.length,
                generatedMoFiles: generatedMoFiles,
                translatedStrings: translatedStrings,
                removedStringsList: changes.removed.map(key => key),
                allStrings: Object.entries(scanResults.strings).map(([key, value]) => `${key}: ${value}`)
            });
        } catch (error) {
            console.error('\n⚠️ Error generating report:', error.message);
        }
        
        console.log('\n✅ Translation update completed successfully!');
    } catch (error) {
        console.error('\n❌ Error during translation update:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Command line interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        force: args.includes('--force'),
        noMo: args.includes('--no-mo'),
        nonInteractive: args.includes('--non-interactive')
    };
    
    updateTranslations(options).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = updateTranslations;
