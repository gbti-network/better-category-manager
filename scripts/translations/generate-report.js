const fs = require('fs');
const path = require('path');

/**
 * Generates an HTML report of the translation process
 * @param {Object} data Translation statistics and data
 * @param {string} data.pluginName Plugin name
 * @param {number} data.totalStrings Total number of strings
 * @param {number} data.newStrings Number of new strings translated
 * @param {number} data.removedStrings Number of removed strings
 * @param {Array<string>} data.generatedMoFiles List of generated .mo files
 * @param {Array<string>} data.translatedStrings List of translated strings
 * @param {Array<string>} data.removedStringsList List of removed strings
 * @param {Array<string>} data.allStrings List of all strings
 * @returns {Promise<void>}
 */
async function generateReport(data) {
    const reportPath = path.join(__dirname, '../.data/translations-report.html');
    const timestamp = new Date().toLocaleString();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.pluginName} - Translation Report</title>
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
    </style>
</head>
<body>
    <div class="container">
        <h1>${data.pluginName} Translation Dashboard</h1>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-title">Total Strings</div>
                <div class="stat-value">${data.totalStrings}</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-title">New Strings Translated</div>
                <div class="stat-value new">${data.newStrings}</div>
            </div>

            <div class="stat-card">
                <div class="stat-title">Strings Removed</div>
                <div class="stat-value removed">${data.removedStrings}</div>
            </div>
        </div>
        
        <div class="stat-card">
            <div class="stat-title">Generated Language Files</div>
            <ul class="languages-list">
                ${data.generatedMoFiles.map(file => `<li>${file}</li>`).join('')}
            </ul>
        </div>

        <div class="strings-section">
            <h2>Translated Strings</h2>
            <div class="strings-list">
                ${data.translatedStrings.map(str => `<code class="new">${str}</code>`).join('')}
            </div>
        </div>

        <div class="strings-section">
            <h2>Removed Strings</h2>
            <div class="strings-list">
                ${data.removedStringsList.map(str => `<code class="removed">${str}</code>`).join('')}
            </div>
        </div>

        <div class="strings-section">
            <h2>All Strings</h2>
            <div class="strings-list">
                ${data.allStrings.map(str => `<code>${str}</code>`).join('')}
            </div>
        </div>
        
        <div class="timestamp">Generated on: ${timestamp}</div>
    </div>
</body>
</html>`;

    await fs.promises.writeFile(reportPath, html, 'utf8');
    console.log(`✓ Translation report generated at: ${reportPath}`);
}

module.exports = generateReport;
