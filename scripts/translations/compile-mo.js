/**
 * MO File Compiler
 * 
 * Pure JavaScript implementation of MO file compilation.
 * Based on the GNU gettext MO file format specification:
 * https://www.gnu.org/software/gettext/manual/html_node/MO-Files.html
 */

const fs = require('fs');
const path = require('path');

class MOCompiler {
    constructor(locale) {
        this.locale = locale;
        this.pluginRoot = path.resolve(__dirname, '../..');
        this.languagesDir = path.join(this.pluginRoot, 'languages');
        this.MAGIC = 0x950412de; // Magic number for little-endian
        this.MO_HEADER_FIELDS = [
            'Project-Id-Version',
            'Report-Msgid-Bugs-To',
            'POT-Creation-Date',
            'PO-Revision-Date',
            'Last-Translator',
            'Language-Team',
            'Language',
            'MIME-Version',
            'Content-Type',
            'Content-Transfer-Encoding',
            'X-Generator',
            'X-Domain'
        ];
    }

    async compile() {
        const poFile = path.join(this.languagesDir, `better-category-manager-${this.locale}.po`);
        const moFile = path.join(this.languagesDir, `better-category-manager-${this.locale}.mo`);

        if (!fs.existsSync(poFile)) {
            throw new Error(`PO file not found: ${poFile}`);
        }

        try {
            // Create a backup of the PO file
            const backupFile = `${poFile}.backup`;
            fs.copyFileSync(poFile, backupFile);

            // Read and parse PO file
            const poContent = fs.readFileSync(poFile, 'utf8');
            const translations = this.parsePOFile(poContent);

            // Generate MO file content
            const moContent = this.generateMOContent(translations);

            // Write MO file
            fs.writeFileSync(moFile, moContent);

            // Verify the MO file was created
            if (!fs.existsSync(moFile)) {
                throw new Error('MO file was not created');
            }

            // Clean up backup
            fs.unlinkSync(backupFile);
            console.log(`✓ Generated MO file: ${moFile}`);

            return moFile;
        } catch (error) {
            // Attempt to restore from backup if compilation failed
            const backupFile = `${poFile}.backup`;
            if (fs.existsSync(backupFile)) {
                fs.copyFileSync(backupFile, poFile);
                fs.unlinkSync(backupFile);
            }
            throw error;
        }
    }

    parsePOFile(content) {
        const entries = [];
        let currentEntry = { msgid: '', msgstr: '', comments: [] };
        let isHeader = true;

        // Split content into lines and process each line
        const lines = content.split(/\r?\n/);
        
        for (let line of lines) {
            line = line.trim();
            
            if (line === '') {
                if (currentEntry.msgid || currentEntry.msgstr) {
                    entries.push({ ...currentEntry });
                    currentEntry = { msgid: '', msgstr: '', comments: [] };
                }
                continue;
            }

            if (line.startsWith('#')) {
                currentEntry.comments.push(line);
            } else if (line.startsWith('msgid "')) {
                currentEntry.msgid = this.extractString(line);
                isHeader = currentEntry.msgid === '';
            } else if (line.startsWith('msgstr "')) {
                currentEntry.msgstr = this.extractString(line);
            } else if (line.startsWith('"') && line.endsWith('"')) {
                // Handle multi-line strings
                const str = this.extractString(line);
                if (currentEntry.msgstr !== '') {
                    currentEntry.msgstr += str;
                } else {
                    currentEntry.msgid += str;
                }
            }
        }

        // Add the last entry if not empty
        if (currentEntry.msgid || currentEntry.msgstr) {
            entries.push(currentEntry);
        }

        return entries;
    }

    extractString(line) {
        const match = line.match(/"(.*?)(?<!\\)"/);
        if (!match) return '';
        return this.unescapeString(match[1]);
    }

    unescapeString(str) {
        return str
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
    }

    generateMOContent(translations) {
        // Create a buffer to hold the MO file content
        const stringPairs = translations.map(t => ({
            msgid: Buffer.from(t.msgid),
            msgstr: Buffer.from(t.msgstr)
        }));

        const n = stringPairs.length;
        const headerSize = 28; // Size of MO file header
        
        // Calculate offsets
        let offset = headerSize + 16 * n; // Start of string table
        
        // Create arrays for the string table
        const originalStrings = [];
        const translatedStrings = [];
        
        // Build string tables and calculate offsets
        for (const pair of stringPairs) {
            // Original string
            originalStrings.push({
                length: pair.msgid.length,
                offset: offset
            });
            offset += pair.msgid.length + 1; // +1 for null terminator
            
            // Translated string
            translatedStrings.push({
                length: pair.msgstr.length,
                offset: offset
            });
            offset += pair.msgstr.length + 1; // +1 for null terminator
        }

        // Create the final buffer
        const buffer = Buffer.alloc(offset);
        
        // Write header
        buffer.writeUInt32LE(this.MAGIC, 0); // Magic number
        buffer.writeUInt32LE(0, 4); // File format revision
        buffer.writeUInt32LE(n, 8); // Number of strings
        buffer.writeUInt32LE(headerSize, 12); // Offset of original strings table
        buffer.writeUInt32LE(headerSize + 8 * n, 16); // Offset of translated strings table
        buffer.writeUInt32LE(0, 20); // Size of hashing table
        buffer.writeUInt32LE(headerSize + 16 * n, 24); // Offset of hashing table
        
        // Write string tables
        let currentOffset = headerSize;
        
        // Write original strings table
        for (let i = 0; i < n; i++) {
            buffer.writeUInt32LE(originalStrings[i].length, currentOffset);
            buffer.writeUInt32LE(originalStrings[i].offset, currentOffset + 4);
            currentOffset += 8;
        }
        
        // Write translated strings table
        for (let i = 0; i < n; i++) {
            buffer.writeUInt32LE(translatedStrings[i].length, currentOffset);
            buffer.writeUInt32LE(translatedStrings[i].offset, currentOffset + 4);
            currentOffset += 8;
        }
        
        // Write actual strings
        for (let i = 0; i < n; i++) {
            stringPairs[i].msgid.copy(buffer, originalStrings[i].offset);
            buffer.writeUInt8(0, originalStrings[i].offset + stringPairs[i].msgid.length);
            
            stringPairs[i].msgstr.copy(buffer, translatedStrings[i].offset);
            buffer.writeUInt8(0, translatedStrings[i].offset + stringPairs[i].msgstr.length);
        }
        
        return buffer;
    }
}

async function compileMO(locale) {
    try {
        const compiler = new MOCompiler(locale);
        return await compiler.compile();
    } catch (error) {
        console.error('Error compiling MO file:', error.message);
        throw error;
    }
}

module.exports = compileMO;
