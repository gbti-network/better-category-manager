/**
 * Fix Translation Files
 * 
 * This script fixes existing translation files by removing extra quotation marks
 * that might have been added during the translation process.
 */

const fs = require('fs');
const path = require('path');

class TranslationFixer {
    constructor(languagesDir) {
        this.languagesDir = languagesDir;
    }

    fixTranslationFile(locale) {
        console.log(`Fixing translation file for ${locale}...`);
        
        const poFile = path.join(this.languagesDir, `better-category-manager-${locale}.po`);
        
        if (!fs.existsSync(poFile)) {
            console.error(`Translation file not found: ${poFile}`);
            return false;
        }
        
        try {
            // Read the file content
            let content = fs.readFileSync(poFile, 'utf8');
            
            // Fix the header format if needed
            content = this.fixHeaderFormat(content);
            
            // Fix translation strings with extra quotes
            content = this.fixTranslationStrings(content);
            
            // Write the fixed content back to the file
            fs.writeFileSync(poFile, content, 'utf8');
            
            console.log(`Successfully fixed translation file: ${poFile}`);
            return true;
        } catch (error) {
            console.error(`Error fixing translation file ${poFile}:`, error.message);
            return false;
        }
    }
    
    fixHeaderFormat(content) {
        // Fix any issues with the header format
        return content.replace(/"X-Domain: better-category-manager\\n"\\n\\n/, '"X-Domain: better-category-manager\\n"\n\n');
    }
    
    fixTranslationStrings(content) {
        // Find all msgstr entries and clean them
        return content.replace(/msgstr "(.*?)"/gs, (match, p1) => {
            // Remove extra quotes at the beginning and end of the translation
            let cleaned = p1;
            
            // Check if the string starts and ends with quotes
            if (cleaned.startsWith('\\"') && cleaned.endsWith('\\"')) {
                cleaned = cleaned.substring(2, cleaned.length - 2);
            }
            
            // Return the fixed msgstr
            return `msgstr "${cleaned}"`;
        });
    }
    
    fixAllTranslations() {
        // Get all PO files in the languages directory
        const files = fs.readdirSync(this.languagesDir)
            .filter(file => file.endsWith('.po') && file.startsWith('better-category-manager-'));
            
        console.log(`Found ${files.length} translation files to fix.`);
        
        // Extract locales from filenames
        const locales = files.map(file => {
            const match = file.match(/better-category-manager-(.+)\.po$/);
            return match ? match[1] : null;
        }).filter(locale => locale !== null);
        
        // Fix each translation file
        let fixedCount = 0;
        for (const locale of locales) {
            if (this.fixTranslationFile(locale)) {
                fixedCount++;
            }
        }
        
        console.log(`Fixed ${fixedCount} out of ${locales.length} translation files.`);
    }
}

// Run the script
const languagesDir = path.join(__dirname, '../../languages');
const fixer = new TranslationFixer(languagesDir);

// Check if a specific locale was provided as an argument
const locale = process.argv[2];
if (locale) {
    fixer.fixTranslationFile(locale);
} else {
    fixer.fixAllTranslations();
}
