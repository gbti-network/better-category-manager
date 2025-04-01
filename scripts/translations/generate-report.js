const fs = require('fs');
const path = require('path');

/**
 * Generates an HTML report of the translation process
 * @param {Object} data Translation statistics and data
 * @param {Object} data.changes Changes in strings
 * @param {Array<string>} data.translatedStrings List of translated strings
 * @param {number} data.translatedStringsCount Number of strings translated
 * @param {Array<string>} data.generatedMoFiles List of generated .mo files
 * @param {Object} data.untranslatedByLocale Object containing untranslated strings by locale
 * @param {number} data.totalUntranslated Total number of untranslated strings
 * @returns {Promise<string>} Path to the generated report
 */
async function generateReport(data) {
    // Ensure .data directory exists
    const dataDir = path.join(__dirname, '../.data');
    if (!fs.existsSync(dataDir)) {
        await fs.promises.mkdir(dataDir, { recursive: true });
    }

    const reportPath = path.join(dataDir, 'translations-report.html');
    const timestamp = new Date().toLocaleString();
    const pluginName = 'Advanced Category Manager';

    // Prepare data for the report
    const totalStrings = data.changes ? 
        Object.keys(data.changes.current || {}).length : 
        (data.translatedStringsCount || 0);
    
    const newStrings = data.changes ? data.changes.new.length : 0;
    const modifiedStrings = data.changes ? data.changes.modified.length : 0;
    const removedStrings = data.changes ? data.changes.removed.length : 0;
    
    const translatedStrings = data.translatedStrings || [];
    const generatedMoFiles = data.generatedMoFiles || [];
    
    const untranslatedByLocale = data.untranslatedByLocale || {};
    const totalUntranslated = data.totalUntranslated || 0;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pluginName} - Translation Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1, h2 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 0.5rem;
            margin-bottom: 2rem;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .stat-card.warning {
            border-left-color: #f39c12;
        }
        .stat-title {
            color: #7f8c8d;
            font-size: 0.9rem;
            text-transform: uppercase;
            margin-bottom: 0.5rem;
        }
        .stat-value {
            color: #2c3e50;
            font-size: 1.5rem;
            font-weight: bold;
        }
        .stat-value.warning {
            color: #f39c12;
        }
        .languages-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .languages-list li {
            padding: 0.5rem 0;
            border-bottom: 1px solid #eee;
        }
        .languages-list li:last-child {
            border-bottom: none;
        }
        .strings-section {
            margin-top: 2rem;
            padding: 1rem;
            background: #f8f9fa;
            border-radius: 6px;
        }
        .strings-list {
            background: white;
            padding: 1rem;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #eee;
        }
        .strings-list code {
            display: block;
            padding: 0.5rem;
            margin: 0.25rem 0;
            background: #f8f9fa;
            border-radius: 4px;
            font-family: monospace;
        }
        .timestamp {
            color: #95a5a6;
            font-size: 0.9rem;
            text-align: right;
            margin-top: 2rem;
        }
        .removed {
            color: #e74c3c;
        }
        .new {
            color: #27ae60;
        }
        .warning {
            color: #f39c12;
        }
        .untranslated-details {
            margin-top: 1rem;
        }
        .untranslated-locale {
            margin-bottom: 1rem;
            padding: 1rem;
            background: #fff8e1;
            border-radius: 4px;
            border-left: 4px solid #f39c12;
        }
        .untranslated-locale h3 {
            margin-top: 0;
            color: #f39c12;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${pluginName} Translation Dashboard</h1>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-title">Total Strings</div>
                <div class="stat-value">${totalStrings}</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-title">New Strings</div>
                <div class="stat-value new">${newStrings}</div>
            </div>

            <div class="stat-card">
                <div class="stat-title">Modified Strings</div>
                <div class="stat-value">${modifiedStrings}</div>
            </div>

            <div class="stat-card">
                <div class="stat-title">Removed Strings</div>
                <div class="stat-value removed">${removedStrings}</div>
            </div>
            
            ${totalUntranslated > 0 ? `
            <div class="stat-card warning">
                <div class="stat-title">Untranslated Strings</div>
                <div class="stat-value warning">${totalUntranslated}</div>
            </div>
            ` : ''}
        </div>
        
        ${generatedMoFiles.length > 0 ? `
        <div class="stat-card">
            <div class="stat-title">Generated Language Files</div>
            <ul class="languages-list">
                ${generatedMoFiles.map(file => `<li>${file}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        ${totalUntranslated > 0 ? `
        <div class="strings-section">
            <h2>Untranslated Strings</h2>
            <div class="untranslated-details">
                ${Object.entries(untranslatedByLocale).map(([locale, data]) => `
                    <div class="untranslated-locale">
                        <h3>${data.name} (${locale}): ${data.count} untranslated strings</h3>
                        <div class="strings-list">
                            ${data.strings.slice(0, 20).map(str => `<code class="warning">${str}</code>`).join('')}
                            ${data.strings.length > 20 ? `<p>...and ${data.strings.length - 20} more</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${translatedStrings.length > 0 ? `
        <div class="strings-section">
            <h2>Translated Strings</h2>
            <div class="strings-list">
                ${translatedStrings.slice(0, 50).map(str => `<code class="new">${str}</code>`).join('')}
                ${translatedStrings.length > 50 ? `<p>...and ${translatedStrings.length - 50} more</p>` : ''}
            </div>
        </div>
        ` : ''}

        ${data.changes && data.changes.removed && data.changes.removed.length > 0 ? `
        <div class="strings-section">
            <h2>Removed Strings</h2>
            <div class="strings-list">
                ${data.changes.removed.map(str => `<code class="removed">${str}</code>`).join('')}
            </div>
        </div>
        ` : ''}
        
        <div class="timestamp">Generated on: ${timestamp}</div>
    </div>
</body>
</html>`;

    await fs.promises.writeFile(reportPath, html, 'utf8');
    console.log(`✓ Translation report generated at: ${reportPath}`);
    return reportPath;
}

module.exports = generateReport;
