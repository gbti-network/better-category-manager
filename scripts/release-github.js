var dotenv = require('dotenv');
var Octokit = require('@octokit/rest').Octokit;
var fs = require('fs-extra');
var path = require('path');
var execSync = require('child_process').execSync;

// Initialize dotenv with path to scripts directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration
const config = {
    owner: process.env.GITHUB_OWNER || 'gbti-network',
    repo: process.env.GITHUB_REPO || 'better-category-manager',
    token: process.env.GITHUB_TOKEN,
    pluginFile: path.resolve(__dirname, '../better-category-manager.php')
};

// Validate GitHub configuration
if (!config.token) {
    throw new Error('GITHUB_TOKEN is not set in .env file');
}
if (!config.owner) {
    throw new Error('GITHUB_OWNER is not set in .env file');
}
if (!config.repo) {
    throw new Error('GITHUB_REPO is not set in .env file');
}

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

/**
 * Execute git command and handle errors
 */
function gitExec(command, options) {
    try {
        return execSync(command, options || { stdio: 'inherit' });
    } catch (error) {
        throw new Error('Git command failed: ' + command + '\n' + error.message);
    }
}

/**
 * Check if there are any changes to commit
 */
function hasChanges() {
    try {
        const status = gitExec('git status --porcelain');
        return status.toString().trim().length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * Handle git branch operations for commit only (no release)
 */
function handleGitCommit(callback) {
    console.log('\n🔄 Committing to develop branch...');

    try {
        // Make sure we're on develop branch
        gitExec('git checkout develop');
        
        // Stage all files, including new ones
        gitExec('git add -A');
        
        // Commit changes
        gitExec('git commit -m "Prepare release"');
        gitExec('git push origin develop');

        console.log('✓ Commit completed');
        
        if (callback) callback(null);
    } catch (error) {
        if (callback) callback(error);
    }
}

/**
 * Handle git branch operations for release
 */
function handleGitRelease(callback) {
    console.log('\n🔄 Managing git branches for release...');

    try {
        // First commit and push to develop if there are changes
        console.log('Pushing changes to develop branch...');
        
        // Make sure we're on develop branch
        gitExec('git checkout develop');
        
        // Only commit if there are changes
        if (hasChanges()) {
            // Stage all files, including new ones
            gitExec('git add -A');
            
            // Commit changes
            gitExec('git commit -m "Prepare release"');
            gitExec('git push origin develop');
        }

        // Switch to master
        console.log('Switching to master branch...');
        gitExec('git checkout master');

        // Pull latest master just in case
        console.log('Pulling latest master...');
        gitExec('git pull origin master');

        // Merge develop into master
        console.log('Merging develop into master...');
        gitExec('git merge develop');

        // Push to master
        console.log('Pushing to master...');
        gitExec('git push origin master');

        // Switch back to develop
        console.log('Switching back to develop branch...');
        gitExec('git checkout develop');

        console.log('✓ Release branch management completed');
        
        if (callback) callback(null);
    } catch (error) {
        // If anything fails, try to get back to develop branch
        try {
            gitExec('git checkout develop');
        } catch (checkoutError) {
            // Ignore checkout error
        }
        if (callback) callback(error);
    }
}

/**
 * Handle git branch operations based on action type
 */
function handleGitBranches(callback, isRelease = false) {
    if (isRelease) {
        handleGitRelease(callback);
    } else {
        handleGitCommit(callback);
    }
}

/**
 * Check if repository exists and is accessible
 * @returns {Promise<boolean>}
 */
async function checkRepository() {
    try {
        await octokit.repos.get({
            owner: config.owner,
            repo: config.repo
        });
        return true;
    } catch (error) {
        if (error.status === 404) {
            return false;
        }
        throw error;
    }
}

/**
 * Initialize repository if it doesn't exist
 * @returns {Promise<void>}
 */
async function initializeRepository() {
    try {
        const exists = await checkRepository();
        if (!exists) {
            console.log('Repository does not exist. Creating...');
            await octokit.repos.createInOrg({
                org: config.owner,
                name: config.repo,
                description: 'A WordPress plugin for improved category management',
                private: false,
                auto_init: true
            });
            console.log('Repository created successfully');
        }
    } catch (error) {
        console.error('Failed to initialize repository:', error);
        throw error;
    }
}

/**
 * Create a new release on GitHub
 */
async function createGithubRelease(zipFile, callback) {
    console.log('\n🚀 Creating GitHub release...');

    // Get current version
    var version;
    try {
        const content = fs.readFileSync(config.pluginFile, 'utf8');
        const versionMatch = content.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
        version = versionMatch ? versionMatch[1] : 'unknown';
    } catch (error) {
        if (callback) callback(new Error('Failed to read version: ' + error.message));
        return;
    }

    // Handle git branches first
    handleGitBranches(async function(err) {
        if (err) {
            if (callback) callback(err);
            return;
        }

        // Initialize repository if needed
        await initializeRepository();

        // Create GitHub release
        try {
            const release = await octokit.repos.createRelease({
                owner: config.owner,
                repo: config.repo,
                tag_name: 'v' + version,
                name: 'Version ' + version,
                body: 'Release of version ' + version,
                draft: false,
                prerelease: false,
                target_commitish: 'master' // Create release from master branch
            });

            // Upload release asset if zip file provided
            if (zipFile && fs.existsSync(zipFile)) {
                const zipContent = await fs.promises.readFile(zipFile);
                const zipFileName = path.basename(zipFile);
                await octokit.repos.uploadReleaseAsset({
                    owner: config.owner,
                    repo: config.repo,
                    release_id: release.data.id,
                    name: zipFileName,
                    data: zipContent,
                    headers: {
                        'content-type': 'application/zip',
                        'content-length': zipContent.length
                    }
                });
            }

            console.log('✓ GitHub release created successfully');
            if (callback) callback(null);
        } catch (error) {
            if (callback) callback(new Error('Failed to create GitHub release: ' + error.message));
        }
    }, true);
}

/**
 * Test GitHub access and operations
 */
function testGitHubAccess(callback) {
    console.log('\n🔍 Testing GitHub configuration...');
    console.log('Testing with:');
    console.log('  - Owner:', config.owner);
    console.log('  - Repo:', config.repo);

    // First validate configuration
    if (!config.token) {
        var error = new Error('GitHub token not found. Please check your .env file.');
        if (callback) callback(error);
        return;
    }

    // Test GitHub token and repository access
    octokit.repos.get({
        owner: config.owner,
        repo: config.repo
    }).then(function(response) {
        console.log('\nTesting repository access...');
        console.log('  ✓ Repository access confirmed:', response.data.full_name);
        
        // Test branch access
        console.log('\nTesting branch access...');
        return octokit.repos.listBranches({
            owner: config.owner,
            repo: config.repo
        });
    }).then(function(response) {
        console.log('  ✓ Branch access confirmed. Found', response.data.length, 'branches');
        
        // Test release creation permissions
        console.log('\nTesting release access...');
        return octokit.repos.listReleases({
            owner: config.owner,
            repo: config.repo
        });
    }).then(function(response) {
        console.log('  ✓ Release access confirmed. Found', response.data.length, 'releases');
        console.log('\n✅ All GitHub tests passed successfully!');
        if (callback) callback(null);
    }).catch(function(error) {
        console.error('\n❌ GitHub test failed:');
        if (error.status === 404) {
            console.error('  - Repository not found:', config.owner + '/' + config.repo);
        } else if (error.status === 401) {
            console.error('  - Invalid GitHub token. Please check your GITHUB_TOKEN in .env');
        } else if (error.status === 403) {
            console.error('  - Permission denied. Your token may not have the required permissions.');
        } else {
            console.error('  -', error.message);
        }
        if (callback) callback(error);
    });
}

module.exports = {
    handleGitBranches: handleGitBranches,
    createGitHubRelease: async function(version, changelog, zipPath) {
        try {
            console.log('Creating GitHub release...');

            // Validate zip path
            if (!zipPath) {
                throw new Error('No zip file path provided for GitHub release');
            }

            // Check if zip file exists
            try {
                await fs.promises.access(zipPath, fs.constants.F_OK);
            } catch (error) {
                throw new Error(`Zip file not found at path: ${zipPath}`);
            }

            // Initialize repository if needed
            await initializeRepository();
            
            // Check if tag already exists
            try {
                const tagExists = await octokit.repos.getReleaseByTag({
                    owner: config.owner,
                    repo: config.repo,
                    tag: `v${version}`
                });
                
                console.log(`Release with tag v${version} already exists. Skipping GitHub release creation.`);
                return;
            } catch (error) {
                // Tag doesn't exist, continue with release creation
                if (error.status !== 404) {
                    throw error;
                }
            }

            // Create the release
            const release = await octokit.repos.createRelease({
                owner: config.owner,
                repo: config.repo,
                tag_name: `v${version}`,
                name: `Version ${version}`,
                body: changelog,
                draft: false,
                prerelease: false,
                target_commitish: 'master' // Create release from master branch
            });

            // Read the zip file
            const zipContent = await fs.promises.readFile(zipPath);
            const zipFileName = path.basename(zipPath);

            // Upload the zip file as an asset
            await octokit.repos.uploadReleaseAsset({
                owner: config.owner,
                repo: config.repo,
                release_id: release.data.id,
                name: zipFileName,
                data: zipContent,
                headers: {
                    'content-type': 'application/zip',
                    'content-length': zipContent.length
                }
            });

            console.log(`🎉 Successfully created GitHub release v${version} with zip file!`);
        } catch (error) {
            console.error('Failed to create GitHub release:', error);
            throw error;
        }
    },
    testGitHubAccess: testGitHubAccess
};
