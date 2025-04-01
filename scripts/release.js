require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const readline = require('readline');
const semver = require('semver');
const build = require('./build');
const { createGitHubRelease } = require('./release-github');
const svnRelease = require('./release-svn');
const versionManager = require('./version');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    rootDir: rootDir,
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
 * Check if all version references are consistent
 * @param {string} version Version to check
 * @returns {Promise<string>} Version if consistent or fixed
 */
async function checkVersionConsistency(version) {
    console.log('\n🔍 Checking version consistency across all files...');
    const inconsistencies = [];

    // Check package.json
    const packageJson = await fs.readJson(config.packageFile);
    if (packageJson.version !== version) {
        inconsistencies.push(`package.json: ${packageJson.version} (expected: ${version})`);
    }

    // Check scripts/package.json if it exists
    const scriptsPackageFile = path.join(config.rootDir, 'scripts', 'package.json');
    if (await fs.pathExists(scriptsPackageFile)) {
        const scriptsPackageJson = await fs.readJson(scriptsPackageFile);
        if (scriptsPackageJson.version !== version) {
            inconsistencies.push(`scripts/package.json: ${scriptsPackageJson.version} (expected: ${version})`);
        }
    }

    // Check readme.txt
    const readmeContent = await fs.readFile(config.readmeFile, 'utf8');
    const stableTagMatch = readmeContent.match(/Stable tag:\s*([\d.]+)/);
    if (stableTagMatch && stableTagMatch[1] !== version) {
        inconsistencies.push(`readme.txt (Stable tag): ${stableTagMatch[1]} (expected: ${version})`);
    }

    // Check plugin file header
    const pluginContent = await fs.readFile(config.pluginFile, 'utf8');
    const pluginVersionMatch = pluginContent.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
    if (pluginVersionMatch && pluginVersionMatch[1] !== version) {
        inconsistencies.push(`Plugin header: ${pluginVersionMatch[1]} (expected: ${version})`);
    }

    // Check BCATM_VERSION constant
    const bcatmVersionMatch = pluginContent.match(/define\('BCATM_VERSION',\s*'([0-9]+\.[0-9]+\.[0-9]+)'\);/);
    if (bcatmVersionMatch && bcatmVersionMatch[1] !== version) {
        inconsistencies.push(`BCATM_VERSION constant: ${bcatmVersionMatch[1]} (expected: ${version})`);
    }

    if (inconsistencies.length > 0) {
        console.error('\n⚠️ Version inconsistencies detected:');
        inconsistencies.forEach(issue => console.error(`  - ${issue}`));
        
        const { fixInconsistencies } = await inquirer.prompt([{
            type: 'confirm',
            name: 'fixInconsistencies',
            message: 'Would you like to fix these inconsistencies before proceeding?',
            default: true
        }]);
        
        if (fixInconsistencies) {
            console.log('\n🔧 Fixing version inconsistencies...');
            
            // Check which version to use (prompt user)
            const versionChoices = [...new Set([
                version,
                ...inconsistencies.map(issue => {
                    const match = issue.match(/: ([0-9]+\.[0-9]+\.[0-9]+) \(expected:/);
                    return match ? match[1] : null;
                }).filter(Boolean)
            ])];
            
            const { targetVersion } = await inquirer.prompt([{
                type: 'list',
                name: 'targetVersion',
                message: 'Which version should be used across all files?',
                choices: versionChoices,
                default: version
            }]);
            
            // Update all versions to the selected version
            await versionManager.updateVersions('none', targetVersion);
            console.log('✅ All versions have been synchronized to', targetVersion);
            
            // Update the current version to the synchronized version
            return targetVersion;
        } else {
            throw new Error('Version inconsistencies must be fixed before proceeding with the release');
        }
    } else {
        console.log('✅ All version references are consistent');
        return version;
    }
}

/**
 * Prompt for version type
 * @returns {Promise<string>} Version type (patch/minor/major)
 */
async function promptVersionType() {
    const { versionType } = await inquirer.prompt([
        {
            type: 'list',
            name: 'versionType',
            message: 'What type of version update is this?',
            choices: [
                { name: 'Patch (bug fixes)', value: 'patch' },
                { name: 'Minor (new features, backwards compatible)', value: 'minor' },
                { name: 'Major (breaking changes)', value: 'major' }
            ]
        }
    ]);
    
    return versionType;
}

/**
 * Calculate new version based on type
 * @param {string} currentVersion Current version
 * @param {string} type Version type
 * @returns {string} New version
 */
function calculateNewVersion(currentVersion, type) {
    return semver.inc(currentVersion, type);
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
 * @param {string} releaseType - Type of release (github, svn, both, or undefined for interactive)
 * @returns {Promise<void>}
 */
async function release(releaseType) {
    try {
        // Validate environment
        validateEnvironment();

        // Check if we're in a git repository
        try {
            execGitCommand('git rev-parse --is-inside-work-tree');
        } catch (error) {
            console.error('❌ Not in a git repository. Please run this script from a git repository.');
            process.exit(1);
        }

        // Get current version
        const currentVersion = await getCurrentVersion();
        console.log(`\n🔄 Synchronizing all version references to ${currentVersion}...`);
        
        // Check version consistency
        const consistentVersion = await checkVersionConsistency(currentVersion);
        
        // Determine release type if not provided
        let selectedReleaseType = releaseType;
        if (!selectedReleaseType) {
            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'releaseType',
                    message: 'What type of release would you like to perform?',
                    choices: [
                        { name: 'Release to GitHub only', value: 'github' },
                        { name: 'Release to WordPress.org SVN only', value: 'svn' },
                        { name: 'Release to both GitHub and WordPress.org SVN', value: 'both' }
                    ]
                }
            ]);
            selectedReleaseType = answers.releaseType;
        }

        // Prompt for version type
        const versionType = await promptVersionType();
        
        // Calculate new version
        const newVersion = calculateNewVersion(consistentVersion, versionType);
        
        // Confirm version
        const { confirmVersion } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmVersion',
                message: `Are you sure you want to release version ${newVersion}?`,
                default: false
            }
        ]);
        
        if (!confirmVersion) {
            console.log('Release cancelled.');
            process.exit(0);
        }
        
        // Backup files
        await backupFiles();
        
        try {
            // Update version in all files
            await versionManager.updateVersions(versionType, newVersion);
            
            // Get changelog entry
            const changelog = await getChangelogEntry(newVersion);
            
            if (!changelog) {
                console.error(`❌ No changelog entry found for version ${newVersion}. Please add one to .product/changelog.md`);
                await restoreFromBackup();
                process.exit(1);
            }
            
            // Update readme.txt with new version and changelog
            await updateReadmeVersion(newVersion);
            
            // Build the plugin
            console.log('\n🔨 Building plugin...');
            await new Promise((resolve, reject) => {
                build((err, zipPath) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`✅ Build successful. Zip file created: ${zipPath}`);
                        resolve(zipPath);
                    }
                }, { skipRelease: true, skipVersionPrompt: true });
            });
            
            // Only perform Git operations if GitHub release is involved
            if (selectedReleaseType === 'github' || selectedReleaseType === 'both') {
                // Commit changes
                console.log('\n📝 Committing version changes...');
                execGitCommand(`git add -A`);
                execGitCommand(`git commit -m "Bump version to ${newVersion}"`);
                
                // Create tag
                console.log(`\n🏷️ Creating tag v${newVersion}...`);
                execGitCommand(`git tag -a v${newVersion} -m "Version ${newVersion}"`);
                
                // Push changes
                console.log('\n🚀 Pushing changes to remote...');
                execGitCommand('git push');
                execGitCommand(`git push origin v${newVersion}`);
                
                // Perform GitHub release
                console.log('\n🚀 Creating GitHub release...');
                await createGitHubRelease(newVersion, changelog);
            }
            
            // Perform SVN release if requested
            if (selectedReleaseType === 'svn' || selectedReleaseType === 'both') {
                console.log('\n🚀 Creating SVN release...');
                await svnRelease(newVersion);
            }
            
            console.log(`\n✅ Release ${newVersion} completed successfully!`);
        } catch (error) {
            console.error(`\n❌ Release failed: ${error.message}`);
            await restoreFromBackup();
            process.exit(1);
        }
    } catch (error) {
        console.error(`\n❌ Release failed: ${error.message}`);
        process.exit(1);
    }
}

// Run the release process if called directly
if (require.main === module) {
    // Check for command line arguments
    const args = process.argv.slice(2);
    let releaseType;
    
    if (args.includes('--github')) {
        releaseType = 'github';
    } else if (args.includes('--svn')) {
        releaseType = 'svn';
    } else if (args.includes('--both')) {
        releaseType = 'both';
    }
    
    release(releaseType);
}

// Export the release function
module.exports = {
    release
};
