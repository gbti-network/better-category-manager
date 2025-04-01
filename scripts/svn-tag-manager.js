require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    svnUrl: 'https://plugins.svn.wordpress.org/better-category-manager/',
    svnDir: path.join(rootDir, 'svn'),
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
 * Initialize SVN directory structure
 */
function initializeSvnStructure() {
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
 * Check if SVN repository is checked out
 * @returns {boolean} True if SVN repository is checked out
 */
function isSvnRepoCheckedOut() {
    return fs.existsSync(path.join(config.svnDir, '.svn'));
}

/**
 * Checkout or update SVN repository
 */
async function checkoutSvnRepo() {
    console.log('\n🔄 Checking out WordPress SVN repository...');
    
    // Initialize SVN directory structure
    initializeSvnStructure();
    
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
 * Delete a tag from SVN
 * @param {string} version Version tag to delete
 */
async function deleteTag(version) {
    try {
        // First checkout/update the SVN repository
        await checkoutSvnRepo();
        
        // Check if the tag exists
        const svnTagDir = path.join(config.svnDir, 'tags', version);
        if (!fs.existsSync(svnTagDir)) {
            console.log(`\n⚠️ Tag ${version} does not exist in SVN repository.`);
            return;
        }
        
        // Confirm tag deletion
        const { confirmDelete } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirmDelete',
            message: `Are you sure you want to delete tag ${version} from SVN? This cannot be undone.`,
            default: false
        }]);
        
        if (!confirmDelete) {
            console.log('\nTag deletion cancelled.');
            return;
        }
        
        // Get SVN credentials
        let username = process.env.SVN_USERNAME;
        let password = process.env.SVN_PASSWORD;
        
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
        
        // Delete the tag
        console.log(`\n🗑️ Deleting tag ${version} from SVN...`);
        
        try {
            // Use svn delete command
            execCommand(`svn delete ${svnTagDir} --force`, { cwd: config.svnDir });
            
            // Commit the deletion
            const commitMessage = `Delete tag ${version}`;
            execCommand(`svn commit -m "${commitMessage}" --username ${username} --password ${password}`, { 
                cwd: config.svnDir 
            });
            
            console.log(`\n✅ Successfully deleted tag ${version} from SVN!`);
        } catch (error) {
            console.error(`\n❌ Failed to delete tag: ${error.message}`);
            throw error;
        }
    } catch (error) {
        console.error('\n❌ Tag deletion failed:', error.message);
        throw error;
    }
}

/**
 * List all tags in SVN
 */
async function listTags() {
    try {
        // First checkout/update the SVN repository
        await checkoutSvnRepo();
        
        // Get list of tags
        const tagsDir = path.join(config.svnDir, 'tags');
        if (!fs.existsSync(tagsDir)) {
            console.log('\n⚠️ No tags directory found in SVN repository.');
            return;
        }
        
        // Check if the tags directory is empty
        const items = fs.readdirSync(tagsDir);
        if (items.length === 0) {
            console.log('\n⚠️ No tags found in SVN repository.');
            return;
        }
        
        // Filter for directories only
        const tags = items.filter(item => {
            const itemPath = path.join(tagsDir, item);
            return fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory();
        });
        
        if (tags.length === 0) {
            console.log('\n⚠️ No valid tag directories found in SVN repository.');
            return;
        }
        
        console.log('\n📋 SVN Tags:');
        tags.forEach(tag => console.log(`  - ${tag}`));
    } catch (error) {
        console.error('\n❌ Failed to list tags:', error.message);
        throw error;
    }
}

/**
 * Main function
 */
async function main() {
    try {
        // Ask what action to perform
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'List all tags', value: 'list' },
                { name: 'Delete a tag', value: 'delete' }
            ]
        }]);
        
        if (action === 'list') {
            await listTags();
        } else if (action === 'delete') {
            // Ask which tag to delete
            const { version } = await inquirer.prompt([{
                type: 'input',
                name: 'version',
                message: 'Enter the version tag to delete (e.g., 1.0.1):',
                validate: input => input ? true : 'Version is required'
            }]);
            
            await deleteTag(version);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the main function if this script is executed directly
if (require.main === module) {
    main();
}

// Export functions for use in other scripts
module.exports = {
    deleteTag,
    listTags
};
