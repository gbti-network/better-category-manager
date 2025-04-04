require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const build = require('./build');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    svnUrl: 'https://plugins.svn.wordpress.org/better-category-manager/',
    svnDir: path.join(rootDir, 'svn'),
    pluginFile: path.join(rootDir, 'better-category-manager.php'),
    readmeFile: path.join(rootDir, 'readme.txt'),
    buildDir: path.join(rootDir, 'build'),
    svnIgnoreFile: path.join(rootDir, '.svnignore')
};

/**
 * Execute a shell command and return its output
 * @param {string} command The command to execute
 * @param {object} options Command options
 * @returns {string} Command output
 */
function execCommand(command, options = {}) {
    const defaultOptions = { 
        cwd: rootDir, 
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit'
    };
    
    try {
        return execSync(command, { ...defaultOptions, ...options });
    } catch (error) {
        console.error(`Command failed: ${command}`);
        if (options.silent) {
            console.error(error.message);
        }
        throw error;
    }
}

/**
 * Get current version from plugin file
 * @returns {string} Current version
 */
function getCurrentVersion() {
    const pluginData = fs.readFileSync(config.pluginFile, 'utf8');
    const versionMatch = pluginData.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
    
    if (!versionMatch) {
        throw new Error('Could not find version in plugin file');
    }
    
    return versionMatch[1];
}

/**
 * Check if SVN repository is checked out
 * @returns {boolean} True if SVN repository is checked out
 */
function isSvnRepoCheckedOut() {
    return fs.existsSync(path.join(config.svnDir, '.svn'));
}

/**
 * Initialize SVN directory structure
 * @returns {Promise<void>}
 */
async function initializeSvnStructure() {
    // Create the SVN directory if it doesn't exist
    if (!fs.existsSync(config.svnDir)) {
        console.log('Creating SVN directory structure...');
        fs.ensureDirSync(config.svnDir);
        
        // Create the standard SVN directories
        fs.ensureDirSync(path.join(config.svnDir, 'trunk'));
        fs.ensureDirSync(path.join(config.svnDir, 'tags'));
        fs.ensureDirSync(path.join(config.svnDir, 'assets'));
        
        console.log('✅ SVN directory structure created');
    }
}

/**
 * Checkout or update SVN repository
 * @returns {Promise<void>}
 */
async function checkoutSvnRepo() {
    console.log('\n🔄 Checking out WordPress SVN repository...');
    
    // Initialize SVN directory structure
    await initializeSvnStructure();
    
    if (isSvnRepoCheckedOut()) {
        console.log('SVN repository already exists, updating...');
        try {
            // First try to run svn cleanup to fix any locked working copies
            console.log('Running SVN cleanup to fix any locks...');
            execCommand('svn cleanup', { cwd: config.svnDir });
            
            // Then update the repository
            execCommand('svn update', { cwd: config.svnDir });
        } catch (error) {
            console.error('SVN cleanup/update failed:', error.message);
            
            // If cleanup fails, ask user if they want to delete and re-checkout
            const { recreateRepo } = await inquirer.prompt([{
                type: 'confirm',
                name: 'recreateRepo',
                message: 'SVN repository is locked. Would you like to delete and re-checkout the repository?',
                default: true
            }]);
            
            if (recreateRepo) {
                console.log('Deleting existing SVN repository...');
                fs.removeSync(config.svnDir);
                console.log('Checking out fresh SVN repository...');
                fs.ensureDirSync(path.dirname(config.svnDir));
                execCommand(`svn checkout ${config.svnUrl} ${config.svnDir}`);
            } else {
                throw new Error('SVN repository is locked. Please run svn cleanup manually.');
            }
        }
    } else {
        console.log('Checking out SVN repository...');
        fs.ensureDirSync(path.dirname(config.svnDir));
        execCommand(`svn checkout ${config.svnUrl} ${config.svnDir}`);
    }
    
    console.log('✅ SVN repository is ready');
}

/**
 * Clean SVN trunk directory
 * @returns {Promise<void>}
 */
async function cleanSvnTrunk() {
    console.log('\n🧹 Cleaning SVN trunk directory...');
    
    const svnTrunkDir = path.join(config.svnDir, 'trunk');
    
    // Get all files in trunk
    const trunkFiles = await fs.readdir(svnTrunkDir);
    
    // Delete all files except .svn
    for (const file of trunkFiles) {
        if (file === '.svn') continue;
        
        const filePath = path.join(svnTrunkDir, file);
        await fs.remove(filePath);
    }
    
    console.log('✅ SVN trunk directory cleaned');
}

/**
 * Copy build files to SVN trunk
 * @returns {Promise<void>}
 */
async function copyBuildToSvnTrunk() {
    console.log('\n📂 Copying build files to SVN trunk...');
    
    // Ensure build directory exists
    if (!fs.existsSync(config.buildDir)) {
        console.log('Building plugin first...');
        await build();
    }
    
    const svnTrunkDir = path.join(config.svnDir, 'trunk');
    const pluginBuildDir = path.join(config.buildDir, config.pluginSlug);
    
    // Ensure the plugin build directory exists
    if (!fs.existsSync(pluginBuildDir)) {
        throw new Error(`Plugin build directory not found: ${pluginBuildDir}`);
    }
    
    // Copy all files from plugin build directory to SVN trunk
    await fs.copy(pluginBuildDir, svnTrunkDir, {
        filter: (src) => {
            const relativePath = path.relative(pluginBuildDir, src);
            
            // Skip VCS directories and development folders
            return !relativePath.includes('.git') && 
                   !relativePath.includes('.svn') &&
                   !relativePath.includes('.scripts') &&
                   !relativePath.includes('.product') &&
                   !relativePath.includes('svn');
        }
    });
    
    console.log('✅ Build files copied to SVN trunk');
}

/**
 * Create SVN tag
 * @param {string} version Version to tag
 * @returns {Promise<void>}
 */
async function createSvnTag(version) {
    console.log(`\n🏷️ Creating SVN tag for version ${version}...`);
    
    const svnTrunkDir = path.join(config.svnDir, 'trunk');
    const svnTagDir = path.join(config.svnDir, 'tags', version);
    
    // Check if tag already exists
    if (fs.existsSync(svnTagDir)) {
        const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Tag ${version} already exists. Overwrite?`,
            default: false
        }]);
        
        if (!overwrite) {
            console.log('Skipping tag creation');
            return;
        }
        
        try {
            // First run cleanup to fix any locks
            console.log(`Running SVN cleanup before removing tag ${version}...`);
            execCommand('svn cleanup', { cwd: config.svnDir });
            
            // Revert any local changes in the tag directory
            console.log(`Reverting any local changes in tag ${version}...`);
            execCommand(`svn revert -R ${svnTagDir}`, { cwd: config.svnDir });
            
            // Remove existing tag with force flag
            console.log(`Removing existing tag ${version}...`);
            execCommand(`svn rm --force ${svnTagDir}`, { cwd: config.svnDir });
        } catch (error) {
            console.error(`Error removing existing tag: ${error.message}`);
            
            // Try a different approach - delete the directory manually and update
            console.log('Trying alternative approach...');
            try {
                // Remove the directory manually
                fs.removeSync(svnTagDir);
                
                // Update SVN to sync the deletion
                execCommand('svn update', { cwd: config.svnDir });
            } catch (removeError) {
                console.error(`Failed to manually remove tag: ${removeError.message}`);
                throw new Error('Could not remove existing tag. Please delete it manually.');
            }
        }
    }
    
    // Create tag from trunk
    console.log('Creating new tag from trunk...');
    execCommand(`svn cp "${svnTrunkDir}" "${svnTagDir}"`, { cwd: config.svnDir });
    
    console.log(`✅ SVN tag ${version} created`);
}

/**
 * Commit changes to SVN
 * @param {string} version Version being released
 * @returns {Promise<void>}
 */
async function commitSvnChanges(version) {
    console.log('\n📤 Committing changes to WordPress SVN...');
    
    // Add all changes to SVN
    execCommand('svn add . --force', { 
        cwd: config.svnDir,
        silent: true 
    });
    
    // Remove deleted files
    try {
        const svnStatus = execCommand('svn status', { 
            cwd: config.svnDir,
            silent: true 
        }).toString();
        
        const deletedFiles = svnStatus
            .split('\n')
            .filter(line => line.startsWith('!'))
            .map(line => line.substring(1).trim());
        
        if (deletedFiles.length > 0) {
            for (const file of deletedFiles) {
                execCommand(`svn delete "${file}"`, { 
                    cwd: config.svnDir,
                    silent: true 
                });
            }
        }
    } catch (error) {
        console.warn('Warning: Error checking for deleted files', error.message);
    }
    
    // Commit changes
    const commitMessage = `Release ${version}`;
    
    // Get SVN credentials from environment variables
    let username = process.env.SVN_USERNAME;
    let password = process.env.SVN_PASSWORD;
    
    // If credentials are not in environment variables, prompt for them
    if (!username || !password) {
        console.log('SVN credentials not found in environment variables.');
        const credentials = await inquirer.prompt([
            {
                type: 'input',
                name: 'username',
                message: 'Enter your WordPress.org username:',
                validate: input => input ? true : 'Username is required'
            },
            {
                type: 'password',
                name: 'password',
                message: 'Enter your WordPress.org password:',
                validate: input => input ? true : 'Password is required'
            }
        ]);
        
        username = credentials.username;
        password = credentials.password;
    } else {
        console.log(`Using SVN credentials for user: ${username} from environment variables.`);
    }
    
    try {
        execCommand(`svn commit -m "${commitMessage}" --username ${username} --password ${password}`, { 
            cwd: config.svnDir 
        });
        console.log('✅ Changes committed to WordPress SVN');
    } catch (error) {
        console.error('❌ SVN commit failed:', error.message);
        throw error;
    }
}

/**
 * Main SVN release function
 * @param {string} version Version to release
 * @returns {Promise<void>}
 */
async function releaseSvn(version) {
    try {
        console.log(`\n🚀 Starting SVN release process for version ${version}...`);
        
        // Checkout or update SVN repository
        await checkoutSvnRepo();
        
        // Clean SVN trunk
        await cleanSvnTrunk();
        
        // Copy build files to SVN trunk
        await copyBuildToSvnTrunk();
        
        // Create SVN tag
        await createSvnTag(version);
        
        // Commit changes to SVN
        await commitSvnChanges(version);
        
        console.log(`\n🎉 Successfully released version ${version} to WordPress.org SVN!`);
    } catch (error) {
        console.error('\n❌ SVN release failed:', error.message);
        throw error;
    }
}

/**
 * Export the SVN release function
 * @param {string} version Version to release (optional, defaults to current version)
 * @returns {Promise<void>}
 */
async function svnRelease(version) {
    // If no version provided, use current version
    const releaseVersion = version || getCurrentVersion();
    return releaseSvn(releaseVersion);
}

module.exports = svnRelease;

// Run if called directly
if (require.main === module) {
    const version = process.argv[2] || getCurrentVersion();
    svnRelease(version)
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Release failed:', error);
            process.exit(1);
        });
}