require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const readline = require('readline');
const build = require('./build');
const { createGitHubRelease } = require('./release-github');
const svnRelease = require('./release-svn');
const versionManager = require('./version');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    pluginFile: path.join(rootDir, 'better-category-manager.php'),
    packageFile: path.join(rootDir, 'package.json'),
    changelogFile: path.join(rootDir, '.product', 'changelog.md'),
    backupDir: path.join(rootDir, '.backup'),
    readmeFile: path.join(rootDir, 'readme.txt')
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
 * @returns {Promise<string>} Current version
 */
async function getCurrentVersion() {
    return versionManager.getCurrentVersion();
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
 * Update version in readme.txt file
 * @param {string} newVersion New version
 * @returns {Promise<void>}
 */
async function updateReadmeVersion(newVersion) {
    if (fs.existsSync(config.readmeFile)) {
        try {
            let content = await fs.readFile(config.readmeFile, 'utf8');
            content = content.replace(
                /Stable tag:\s*[\d.]+/,
                `Stable tag: ${newVersion}`
            );
            await fs.writeFile(config.readmeFile, content, 'utf8');
            console.log(`Updated version in readme.txt to ${newVersion}`);
        } catch (error) {
            console.warn(`Warning: Could not update readme.txt: ${error.message}`);
        }
    }
}

/**
 * Backup files before making changes
 * @returns {Promise<void>}
 */
async function backupFiles() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(config.backupDir, timestamp);
    
    await fs.ensureDir(backupPath);
    
    for (const file of [config.pluginFile, config.packageFile, config.readmeFile]) {
        if (fs.existsSync(file)) {
            await fs.copy(file, path.join(backupPath, path.basename(file)));
        }
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
    
    for (const file of [config.pluginFile, config.packageFile, config.readmeFile]) {
        const backupFile = path.join(backupPath, path.basename(file));
        if (fs.existsSync(backupFile)) {
            await fs.copy(backupFile, file);
        }
    }
}

/**
 * Main release function
 */
async function release() {
    try {
        validateEnvironment();

        const currentVersion = await getCurrentVersion();
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
        
        // Add confirmation step before proceeding
        const { confirmVersion } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmVersion',
            message: `Are you sure you want to proceed with version ${newVersion}?`,
            default: false
        }]);
        
        if (!confirmVersion) {
            console.log('Release process cancelled by user.');
            process.exit(0);
        }
        
        // Ask which platforms to release to
        const { platforms } = await inquirer.prompt([{
            type: 'checkbox',
            name: 'platforms',
            message: 'Select platforms to release to:',
            choices: [
                { name: 'GitHub', value: 'github', checked: true },
                { name: 'WordPress.org SVN', value: 'svn', checked: true },
                { name: 'Both (GitHub & WordPress.org SVN)', value: 'both', checked: false }
            ],
            validate: (answer) => {
                if (answer.length < 1) {
                    return 'You must choose at least one platform';
                }
                return true;
            }
        }]);
        
        // Process the 'both' option if selected
        let selectedPlatforms = [...platforms];
        if (platforms.includes('both')) {
            // Remove 'both' and ensure both 'github' and 'svn' are included
            selectedPlatforms = selectedPlatforms.filter(p => p !== 'both');
            if (!selectedPlatforms.includes('github')) selectedPlatforms.push('github');
            if (!selectedPlatforms.includes('svn')) selectedPlatforms.push('svn');
        }
        
        // Add confirmation step before proceeding with the release
        const { confirmRelease } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmRelease',
            message: `Ready to release version ${newVersion} to ${selectedPlatforms.join(', ')}?`,
            default: false
        }]);
        
        if (!confirmRelease) {
            console.log('Release process cancelled by user.');
            process.exit(0);
        }
        
        // Backup files
        await backupFiles();
        
        try {
            // Update versions using the version manager
            await versionManager.updateVersions(type);
            
            // Also update readme.txt if it exists
            await updateReadmeVersion(newVersion);
            
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
            
            // Promisify the build function since it uses callbacks
            const buildPromise = () => {
                return new Promise((resolve, reject) => {
                    build((err, zipPath) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(zipPath);
                    });
                });
            };
            
            // Get the zip path from the build process
            let zipPath = await buildPromise();
            
            if (!zipPath) {
                console.log('Warning: No zip file was created during build process.');
                
                // Try to find the zip file manually based on version
                const distDir = path.join(rootDir, 'dist');
                const zipFileName = `better-category-manager-${newVersion}.zip`;
                const manualZipPath = path.join(distDir, zipFileName);
                
                if (fs.existsSync(manualZipPath)) {
                    console.log(`Found zip file manually: ${manualZipPath}`);
                    zipPath = manualZipPath;
                } else {
                    console.warn('Could not find zip file for release. GitHub release may fail.');
                }
            }
            
            // Create GitHub release if selected
            if (selectedPlatforms.includes('github')) {
                console.log('\nCreating GitHub release...');
                await createGitHubRelease(newVersion, changelogEntry, zipPath);
                console.log('✅ GitHub release completed successfully');
            }
            
            // Create SVN release if selected
            if (selectedPlatforms.includes('svn')) {
                console.log('\nCreating WordPress.org SVN release...');
                await svnRelease(newVersion);
                console.log('✅ WordPress.org SVN release completed successfully');
            }
            
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
