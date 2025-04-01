require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    svnUrl: 'https://plugins.svn.wordpress.org/better-category-manager/',
    svnDir: path.join(rootDir, 'svn'),
};

// The tag to delete
const tagToDelete = '1.0.1';

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
            console.log('Deleting existing SVN repository...');
            fs.removeSync(config.svnDir);
            console.log('Checking out fresh SVN repository...');
            fs.ensureDirSync(path.dirname(config.svnDir));
            execCommand(`svn checkout ${config.svnUrl} ${config.svnDir}`);
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
 */
async function deleteTag() {
    try {
        // First checkout/update the SVN repository
        await checkoutSvnRepo();
        
        // Check if the tag exists
        const svnTagDir = path.join(config.svnDir, 'tags', tagToDelete);
        if (!fs.existsSync(svnTagDir)) {
            console.log(`\n⚠️ Tag ${tagToDelete} does not exist in SVN repository.`);
            return;
        }
        
        console.log(`\n🗑️ Deleting tag ${tagToDelete} from SVN...`);
        
        // Get SVN credentials
        let username = process.env.SVN_USERNAME;
        let password = process.env.SVN_PASSWORD;
        
        if (!username || !password) {
            console.error('SVN credentials not found in environment variables.');
            console.error('Please set SVN_USERNAME and SVN_PASSWORD in your .env file.');
            process.exit(1);
        }
        
        try {
            // Use svn delete command
            console.log(`Removing tag ${tagToDelete}...`);
            execCommand(`svn delete ${svnTagDir} --force`, { cwd: config.svnDir });
            
            // Commit the deletion
            console.log('Committing changes...');
            const commitMessage = `Delete tag ${tagToDelete}`;
            execCommand(`svn commit -m "${commitMessage}" --username ${username} --password ${password}`, { 
                cwd: config.svnDir 
            });
            
            console.log(`\n✅ Successfully deleted tag ${tagToDelete} from SVN!`);
        } catch (error) {
            console.error(`\n❌ Failed to delete tag: ${error.message}`);
            
            // Try a more aggressive approach if the standard one fails
            console.log('Trying alternative approach...');
            try {
                // Remove the directory manually
                fs.removeSync(svnTagDir);
                
                // Update SVN to sync the deletion
                execCommand('svn update', { cwd: config.svnDir });
                
                // Try to commit again
                console.log('Committing changes...');
                const commitMessage = `Delete tag ${tagToDelete} (manual removal)`;
                execCommand(`svn commit -m "${commitMessage}" --username ${username} --password ${password}`, { 
                    cwd: config.svnDir 
                });
                
                console.log(`\n✅ Successfully deleted tag ${tagToDelete} from SVN using alternative method!`);
            } catch (removeError) {
                console.error(`\n❌ Failed to manually remove tag: ${removeError.message}`);
                console.error('Could not delete the tag. Please try to delete it manually.');
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('\n❌ Tag deletion failed:', error.message);
        process.exit(1);
    }
}

// Run the delete tag function
deleteTag();
