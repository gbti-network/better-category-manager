const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');

/**
 * Cleanup utility for translation files
 * - Removes temporary POT files
 * - Backs up translation state
 * - Maintains clean directory structure
 */
class TranslationCleanup {
    constructor(languagesDir) {
        this.languagesDir = languagesDir;
        this.stateFile = path.join(languagesDir, '.translation-state.json');
        this.tempFiles = [];
    }

    /**
     * Backup translation state before cleanup
     */
    backupState() {
        if (fs.existsSync(this.stateFile)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(
                this.languagesDir,
                `.translation-state.${timestamp}.backup.json`
            );
            fs.copyFileSync(this.stateFile, backupFile);
            console.log(`State backed up to ${backupFile}`);
        }
    }

    /**
     * Remove temporary POT files
     */
    cleanupTempFiles() {
        const tempFiles = glob.sync(path.join(this.languagesDir, 'temp-*.pot'));
        tempFiles.forEach(file => {
            fs.unlinkSync(file);
            console.log(`Removed temporary file: ${file}`);
        });
    }

    /**
     * Clean up old backup files, keeping only the last 5
     */
    cleanupOldBackups() {
        const backups = glob.sync(
            path.join(this.languagesDir, '.translation-state.*.backup.json')
        );
        
        if (backups.length > 5) {
            backups
                .sort()
                .slice(0, backups.length - 5)
                .forEach(file => {
                    fs.unlinkSync(file);
                    console.log(`Removed old backup: ${file}`);
                });
        }
    }

    addTempFile(filePath) {
        this.tempFiles.push(filePath);
    }

    async perform() {
        console.log('Cleaning up temporary files...');
        
        try {
            // Clean up any registered temporary files
            for (const file of this.tempFiles) {
                try {
                    await fs.unlink(file);
                    console.log(`Removed temporary file: ${file}`);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        console.warn(`Warning: Could not remove temporary file ${file}:`, error.message);
                    }
                }
            }

            // Clear the temporary files list
            this.tempFiles = [];
            
            console.log('Cleanup completed successfully.');
            return true;
        } catch (error) {
            console.error('Error during cleanup:', error);
            return false;
        }
    }

    /**
     * Run the complete cleanup process
     */
    async run() {
        console.log('Starting translation cleanup...');
        this.backupState();
        this.cleanupTempFiles();
        this.cleanupOldBackups();
        await this.perform();
        console.log('Cleanup completed successfully.');
    }
}

// Run cleanup if called directly
if (require.main === module) {
    const languagesDir = path.resolve(__dirname, '../../languages');
    const cleanup = new TranslationCleanup(languagesDir);
    cleanup.run();
}

module.exports = TranslationCleanup;
