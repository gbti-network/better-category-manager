/**
 * Translation Generator
 * 
 * Generates translations for PO files using OpenAI's GPT API.
 * Handles both new translations and updates to existing ones.
 */

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

class TranslationGenerator {
    constructor(config) {
        this.config = config;
        this.openai = new OpenAI({
            apiKey: config.apiKey
        });
        this.failedStrings = {};
    }

    async translateString(text, targetLanguage, locale) {
        try {
            // Get language-specific context if available
            const langConfig = this.config.languages[locale];
            const context = langConfig.translationContext || {};
            const formality = context.formalityLevel || 'formal';
            const specialInstructions = context.specialInstructions || '';
            
            // Build system prompt with context
            const systemPrompt = `You are a professional translator specializing in WordPress plugin localization. 
Translate text accurately while preserving its meaning and technical context. 
Use ${formality} tone for ${targetLanguage}.
${specialInstructions}
Do not add quotation marks around your translations. Provide only the raw translated text.`;

            const prompt = `Translate the following text to ${targetLanguage}. Provide ONLY the direct translation without any quotation marks, explanations, or additional formatting:
${text}`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 500
            });

            // Clean the response by removing any quotation marks at the beginning and end
            let translation = response.choices[0].message.content.trim();
            
            // Remove surrounding quotes if present (both double and single quotes)
            translation = translation.replace(/^["'](.*)["']$/s, '$1');
            
            // Remove any additional quotation marks that might be present
            translation = translation.replace(/^"|"$/g, '');
            
            return translation;
        } catch (error) {
            console.error(`Error translating string: "${text}"`, error.message);
            // Track failed strings for later resumption
            if (error.message.includes('429')) {
                this.failedStrings[text] = true;
            }
            throw error;
        }
    }

    async translateBatch(strings, targetLanguage, locale, resumeMode = false) {
        const translations = {};
        let completed = 0;
        const total = Object.keys(strings).length;
        let rateLimitHit = false;
        
        // Create a log file path for tracking failed translations
        const logDir = path.join(__dirname, '../.data');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const failedLogPath = path.join(logDir, `failed-translations-${locale}.json`);

        // Load previously failed translations if in resume mode
        let previouslyFailedStrings = {};
        if (resumeMode && fs.existsSync(failedLogPath)) {
            try {
                previouslyFailedStrings = JSON.parse(fs.readFileSync(failedLogPath, 'utf8'));
                console.log(`Loaded ${Object.keys(previouslyFailedStrings).length} previously failed translations to resume`);
            } catch (error) {
                console.error('Error loading failed translations log:', error.message);
                previouslyFailedStrings = {};
            }
        }

        // Combine current strings with previously failed ones if in resume mode
        const stringsToTranslate = resumeMode ? { ...strings, ...previouslyFailedStrings } : strings;

        for (const [msgid, content] of Object.entries(stringsToTranslate)) {
            try {
                process.stdout.write(`\rTranslating string ${++completed}/${total}...`);
                translations[msgid] = await this.translateString(content, targetLanguage, locale);
                
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`\nFailed to translate: "${msgid}"`, error.message);
                
                if (error.message.includes('429')) {
                    rateLimitHit = true;
                    this.failedStrings[msgid] = content;
                }
                
                // Keep existing translation if available, otherwise empty string
                translations[msgid] = '';
            }
        }
        
        // Save failed translations to a log file for later resumption
        if (Object.keys(this.failedStrings).length > 0) {
            fs.writeFileSync(failedLogPath, JSON.stringify(this.failedStrings, null, 2));
            console.log(`\n⚠️ Rate limit hit. ${Object.keys(this.failedStrings).length} translations failed and saved to ${failedLogPath}`);
            console.log(`You can resume these translations later with the --resume option.`);
        } else if (resumeMode && fs.existsSync(failedLogPath)) {
            // If we're in resume mode and all translations succeeded, remove the log file
            fs.unlinkSync(failedLogPath);
            console.log(`\n✅ All previously failed translations completed successfully!`);
        }
        
        console.log('\n');
        return { translations, rateLimitHit };
    }

    generatePOContent(translations, locale) {
        const now = new Date().toISOString();
        const header = `# Translation ofBetter Category Manager in ${this.config.languages[locale].name}
# This file is distributed under the same license as theBetter Category Manager plugin.
msgid ""
msgstr ""
"Project-Id-Version:Better Category Manager 1.0.7.1\\n"
"Report-Msgid-Bugs-To: https://wordpress.org/support/plugin/better-category-manager\\n"
"POT-Creation-Date: ${now}\\n"
"PO-Revision-Date: ${now}\\n"
"Last-Translator:Better Category Manager Translation System <opportunities@gbti.network>\\n"
"Language-Team: ${this.config.languages[locale].name} <${locale}@li.org>\\n"
"Language: ${locale}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"
"X-Generator:Better Category Manager Translation Generator 1.0\\n"
"X-Domain: better-category-manager\\n"\\n\\n`;

        const entries = Object.entries(translations)
            .map(([msgid, msgstr]) => {
                // Properly escape the strings
                const escapedMsgid = this.escapeString(msgid);
                const escapedMsgstr = this.escapeString(msgstr);
                return `msgid "${escapedMsgid}"\nmsgstr "${escapedMsgstr}"\n\n`;
            })
            .join('');

        return header + entries;
    }

    escapeString(str) {
        // First, clean any extraneous quotes that might have been added by the translation
        let cleanedStr = str.trim();
        
        // Remove surrounding quotes if present
        cleanedStr = cleanedStr.replace(/^["'](.*)["']$/s, '$1');
        
        // Now escape the string properly for PO file format
        return cleanedStr
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    unescapeString(str) {
        return str
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
    }

    async mergeWithExisting(newTranslations, locale) {
        const poFile = path.join(__dirname, '../../languages', `better-category-manager-${locale}.po`);
        let existingTranslations = {};

        if (fs.existsSync(poFile)) {
            const content = fs.readFileSync(poFile, 'utf8');
            const entries = content.matchAll(/msgid "(.*?)"\nmsgstr "(.*?)"\n/g);
            
            for (const [, msgid, msgstr] of entries) {
                if (msgid && msgstr) {
                    existingTranslations[this.unescapeString(msgid)] = this.unescapeString(msgstr);
                }
            }
        }

        return {
            ...existingTranslations,
            ...newTranslations
        };
    }

    async findEmptyTranslations(locale) {
        const poFile = path.join(__dirname, '../../languages', `better-category-manager-${locale}.po`);
        const emptyTranslations = {};

        if (fs.existsSync(poFile)) {
            const content = fs.readFileSync(poFile, 'utf8');
            const entries = content.matchAll(/msgid "(.*?)"\nmsgstr "(.*?)"\n/g);
            
            for (const [, msgid, msgstr] of entries) {
                if (msgid && (!msgstr || msgstr.trim() === '')) {
                    emptyTranslations[this.unescapeString(msgid)] = this.unescapeString(msgid);
                }
            }
        }

        return emptyTranslations;
    }

    async generateTranslations(strings, locale, resumeMode = false) {
        console.log(`Generating translations for ${this.config.languages[locale].name}...`);

        let stringsToTranslate = strings;
        
        // If in resume mode, check for empty translations in existing PO file
        if (resumeMode) {
            const emptyTranslations = await this.findEmptyTranslations(locale);
            const failedLogPath = path.join(__dirname, '../.data', `failed-translations-${locale}.json`);
            
            // Load previously failed translations if available
            if (fs.existsSync(failedLogPath)) {
                try {
                    const failedStrings = JSON.parse(fs.readFileSync(failedLogPath, 'utf8'));
                    console.log(`Found ${Object.keys(failedStrings).length} previously failed translations to resume`);
                    stringsToTranslate = failedStrings;
                } catch (error) {
                    console.error('Error loading failed translations log:', error.message);
                    // If we can't load the failed log, use empty translations
                    stringsToTranslate = emptyTranslations;
                }
            } else {
                // If no failed log exists, use empty translations
                console.log(`Found ${Object.keys(emptyTranslations).length} empty translations to complete`);
                stringsToTranslate = emptyTranslations;
            }
            
            if (Object.keys(stringsToTranslate).length === 0) {
                console.log(`No translations to resume for ${locale}. Skipping...`);
                return null;
            }
        }

        // Translate strings
        const { translations, rateLimitHit } = await this.translateBatch(
            stringsToTranslate, 
            this.config.languages[locale].name, 
            locale,
            resumeMode
        );

        // Merge with existing translations
        const mergedTranslations = await this.mergeWithExisting(translations, locale);

        // Generate PO file content
        const poContent = this.generatePOContent(mergedTranslations, locale);

        // Write PO file
        const poFile = path.join(__dirname, '../../languages', `better-category-manager-${locale}.po`);
        const poDir = path.dirname(poFile);

        if (!fs.existsSync(poDir)) {
            fs.mkdirSync(poDir, { recursive: true });
        }

        fs.writeFileSync(poFile, poContent);
        console.log(`✓ Generated PO file: ${poFile}`);

        return { poFile, rateLimitHit };
    }
}

async function generateTranslations({ locale, strings, config, apiKey, resumeMode = false }) {
    try {
        const generator = new TranslationGenerator({
            ...config,
            languages: config.languages,
            apiKey
        });

        return await generator.generateTranslations(strings, locale, resumeMode);
    } catch (error) {
        console.error('Error generating translations:', error);
        throw error;
    }
}

module.exports = generateTranslations;
