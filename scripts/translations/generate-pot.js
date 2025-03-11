const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Plugin root directory (2 levels up from scripts/translations)
const pluginRoot = path.resolve(__dirname, '../../');
const languagesDir = path.join(pluginRoot, 'languages');

function generatePOT() {
    console.log('Generating POT file...');
    
    try {
        // Ensure languages directory exists
        if (!fs.existsSync(languagesDir)) {
            fs.mkdirSync(languagesDir, { recursive: true });
        }

        // Run theBetter Category Manager Translation Scanner
        execSync('node translations/scan-translations.js', {
            cwd: path.join(pluginRoot, 'scripts'),
            stdio: 'inherit'
        });

        console.log('✅ POT file generated successfully!');
        return true;
    } catch (error) {
        console.error('❌ Failed to generate POT file:', error.message);
        return false;
    }
}

// If running directly (not required as a module)
if (require.main === module) {
    generatePOT();
}

module.exports = generatePOT;
