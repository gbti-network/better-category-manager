/**
 * Translation State Manager
 * 
 * Manages the state of translations, tracking string changes and translation progress.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TranslationState {
    constructor() {
        this.stateFile = path.join(__dirname, '../.data/translation-state.json');
        this.state = null;
    }

    async initialize() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                this.state = JSON.parse(data);
            } else {
                this.state = this.getDefaultState();
                await this.saveState();
            }
        } catch (error) {
            console.warn('Warning: Could not load translation state:', error.message);
            this.state = this.getDefaultState();
        }
    }

    getDefaultState() {
        return {
            strings: {},
            history: [],
            lastUpdate: null,
            version: '1.0.7.1'
        };
    }

    async saveState() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.stateFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error('Error saving translation state:', error.message);
        }
    }

    generateStringHash(content) {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Remove strings from PO files that are no longer in the POT file
     * @param {Array<string>} removedStrings List of string keys to remove
     */
    async cleanupPoFiles(removedStrings) {
        if (!removedStrings.length) return;

        const languagesDir = path.join(__dirname, '../../languages');
        const poFiles = fs.readdirSync(languagesDir).filter(file => file.endsWith('.po'));

        for (const poFile of poFiles) {
            const poPath = path.join(languagesDir, poFile);
            try {
                let content = fs.readFileSync(poPath, 'utf8');
                let modified = false;

                for (const key of removedStrings) {
                    // Look for msgid with the exact string
                    const msgidPattern = new RegExp(`msgid "${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]*?msgstr.*?(?=\\n\\n|$)`, 'g');
                    if (msgidPattern.test(content)) {
                        content = content.replace(msgidPattern, '');
                        modified = true;
                    }
                }

                if (modified) {
                    // Clean up any double newlines created by removals
                    content = content.replace(/\n{3,}/g, '\n\n');
                    fs.writeFileSync(poPath, content);
                    console.log(`✓ Removed obsolete strings from ${poFile}`);
                }
            } catch (error) {
                console.error(`Error cleaning up ${poFile}:`, error.message);
            }
        }
    }

    async compareStrings(newStrings) {
        const changes = {
            new: [],
            modified: [],
            unchanged: [],
            removed: []
        };

        // Check for new and modified strings
        for (const [key, content] of Object.entries(newStrings)) {
            const newHash = this.generateStringHash(content);
            
            if (!this.state.strings[key]) {
                changes.new.push(key);
            } else if (this.state.strings[key].hash !== newHash) {
                changes.modified.push(key);
            } else {
                changes.unchanged.push(key);
            }
        }

        // Check for removed strings
        for (const key of Object.keys(this.state.strings)) {
            if (!newStrings[key]) {
                changes.removed.push(key);
            }
        }

        // Remove deleted strings from state
        for (const key of changes.removed) {
            delete this.state.strings[key];
        }

        // Clean up PO files
        await this.cleanupPoFiles(changes.removed);

        // Update state with new strings
        for (const [key, content] of Object.entries(newStrings)) {
            this.state.strings[key] = {
                hash: this.generateStringHash(content),
                lastModified: new Date().toISOString()
            };
        }

        // Record history
        this.state.history.push({
            timestamp: new Date().toISOString(),
            changes: {
                added: changes.new.length,
                modified: changes.modified.length,
                removed: changes.removed.length
            }
        });

        // Limit history to last 100 entries
        if (this.state.history.length > 100) {
            this.state.history = this.state.history.slice(-100);
        }

        this.state.lastUpdate = new Date().toISOString();
        await this.saveState();

        return changes;
    }
}

module.exports = new TranslationState();
