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
    }

    async translateString(text, targetLanguage) {
        try {
            const prompt = `Translate the following text to ${targetLanguage}. Provide ONLY the direct translation without any quotation marks, explanations, or additional formatting:
${text}`;

            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are a professional translator. Translate text accurately while preserving its meaning. Do not add quotation marks around your translations. Provide only the raw translated text." },
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
            throw error;
        }
    }

    async translateBatch(strings, targetLanguage) {
        const translations = {};
        let completed = 0;
        const total = Object.keys(strings).length;

        for (const [msgid, content] of Object.entries(strings)) {
            try {
                process.stdout.write(`\rTranslating string ${++completed}/${total}...`);
                translations[msgid] = await this.translateString(content, targetLanguage);
                
                // Add a small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`\nFailed to translate: "${msgid}"`, error.message);
                translations[msgid] = ''; // Empty string for failed translations
            }
        }
        console.log('\n');
        return translations;
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

    async generateTranslations(strings, locale) {
        console.log(`Generating translations for ${this.config.languages[locale].name}...`);

        // Translate strings
        const translations = await this.translateBatch(strings, this.config.languages[locale].name);

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

        return poFile;
    }
}

async function generateTranslations({ locale, strings, config, apiKey }) {
    try {
        const generator = new TranslationGenerator({
            ...config,
            languages: config.languages,
            apiKey
        });

        return await generator.generateTranslations(strings, locale);
    } catch (error) {
        console.error('Error generating translations:', error);
        throw error;
    }
}

module.exports = generateTranslations;
