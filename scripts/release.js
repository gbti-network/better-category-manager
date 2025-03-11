require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const readline = require('readline');
const build = require('./build');
const { createGitHubRelease } = require('./release-github');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    pluginFile: path.join(rootDir, 'better-category-manager.php'),
    packageFile: path.join(rootDir, 'package.json'),
    changelogFile: path.join(rootDir, '.product', 'changelog.md'),
    backupDir: path.join(rootDir, '.backup')
};

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Execute a git command and return its output
 * @param {string} command The command to execute
 * @returns {string} Command output
 */
function execGitCommand(command) {
    try {
        return execSync(command, { cwd: rootDir, encoding: 'utf8' });
    } catch (error) {
        console.error(`Git command failed: ${command}`);
        throw error;
    }
}

/**
 * Get current version from package.json
 * @returns {string} Current version
 */
function getCurrentVersion() {
    const pkg = require(config.packageFile);
    return pkg.version;
}

/**
 * Prompt for version type
 * @returns {Promise<string>} Version type (patch/minor/major)
 */
async function promptVersionType() {
    const { type } = await inquirer.prompt([{
        type: 'list',
        name: 'type',
        message: 'What type of release is this?',
        choices: ['patch', 'minor', 'major']
    }]);
    return type;
}

/**
 * Calculate new version based on type
 * @param {string} currentVersion Current version
 * @param {string} type Version type
 * @returns {string} New version
 */
function calculateNewVersion(currentVersion, type) {
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error('Invalid version type');
    }
}

/**
 * Validate environment
 */
function validateEnvironment() {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }
}

/**
 * Get the changelog entry for a specific version
 * @param {string} version Version to find changelog for
 * @returns {Promise<string>} Changelog entry
 */
async function getChangelogEntry(version) {
    const changelog = await fs.readFile(config.changelogFile, 'utf8');
    const versionHeader = `## ${version}`;
    const lines = changelog.split('\n');
    let entry = '';
    let isInVersion = false;

    for (const line of lines) {
        if (line.startsWith('## ')) {
            if (line.includes(version)) {
                isInVersion = true;
                continue;
            } else if (isInVersion) {
                break;
            }
        }
        if (isInVersion && line.trim()) {
            entry += line + '\n';
        }
    }

    return entry.trim();
}

/**
 * Update version in a file
 * @param {string} filePath Path to file
 * @param {string} oldVersion Old version
 * @param {string} newVersion New version
 * @returns {Promise<void>}
 */
async function updateVersion(filePath, oldVersion, newVersion) {
    let content = await fs.readFile(filePath, 'utf8');
    
    if (path.basename(filePath) === 'better-category-manager.php') {
        // Update version in plugin header
        content = content.replace(
            /Version:\s*[\d.]+/,
            `Version: ${newVersion}`
        );
        
        // Update version constant if it exists
        if (content.includes('BCM_VERSION')) {
            content = content.replace(
                /define\(\s*['"]BCM_VERSION['"]\s*,\s*['"][\d.]+['"]\s*\)/,
                `define('BCM_VERSION', '${newVersion}')`
            );
        }
    } else if (path.basename(filePath) === 'package.json') {
        // Parse JSON to avoid regex on JSON content
        const packageJson = JSON.parse(content);
        packageJson.version = newVersion;
        content = JSON.stringify(packageJson, null, 2) + '\n';
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`Updated version in ${path.basename(filePath)} to ${newVersion}`);
}

/**
 * Backup files before making changes
 * @returns {Promise<void>}
 */
async function backupFiles() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backupDir, timestamp);
    
    await fs.ensureDir(backupPath);
    
    for (const file of [config.pluginFile, config.packageFile]) {
        await fs.copy(file, path.join(backupPath, path.basename(file)));
    }
}

/**
 * Restore files from backup
 * @returns {Promise<void>}
 */
async function restoreFromBackup() {
    const backups = await fs.readdir(config.backupDir);
    if (backups.length === 0) return;
    
    const latestBackup = backups.sort().pop();
    const backupPath = path.join(config.backupDir, latestBackup);
    
    for (const file of [config.pluginFile, config.packageFile]) {
        await fs.copy(
            path.join(backupPath, path.basename(file)),
            file
        );
    }
}

/**
 * Main release function
 */
async function release() {
    try {
        validateEnvironment();

        const currentVersion = getCurrentVersion();
        console.log(`Current version: ${currentVersion}`);
        
        // Get version increment type
        const type = await promptVersionType();
        
        // Calculate new version
        const newVersion = calculateNewVersion(currentVersion, type);
        console.log(`New version will be: ${newVersion}`);
        
        // Check for changelog entry
        const changelogEntry = await getChangelogEntry(newVersion);
        if (!changelogEntry) {
            throw new Error(`No changelog entry found for version ${newVersion}`);
        }
        
        // Backup files
        await backupFiles();
        
        try {
            // Update versions
            await updateVersion(config.pluginFile, currentVersion, newVersion);
            await updateVersion(config.packageFile, currentVersion, newVersion);
            
            // Commit version changes
            execGitCommand('git add .');
            execGitCommand(`git commit -m "chore: bump version to ${newVersion}"`);
            execGitCommand('git push origin develop');

            // Merge develop into master
            console.log('\nMerging develop into master...');
            execGitCommand('git checkout master');
            execGitCommand('git pull origin master');
            execGitCommand('git merge develop');
            execGitCommand('git push origin master');
            execGitCommand('git checkout develop');
            
            // Build the plugin
            console.log('\nBuilding plugin...');
            const zipPath = await build();
            
            // Create GitHub release
            await createGitHubRelease(newVersion, changelogEntry, zipPath);
            
            console.log(`\n🎉 Successfully released version ${newVersion}!`);
        } catch (error) {
            console.error('Error during release:', error);
            console.log('\nRolling back changes...');
            await restoreFromBackup();
            throw error;
        }
    } catch (error) {
        console.error('\n❌ Release failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run the release process
release();
