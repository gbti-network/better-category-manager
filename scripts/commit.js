require('dotenv').config();
const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Get the root directory of the project
const rootDir = path.resolve(__dirname, '..');

// Function to execute git commands
function execGitCommand(command) {
    try {
        // If command contains push or pull, add token for authentication
        if (command.includes('push') || command.includes('pull')) {
            const tokenUrl = command.replace(
                'git@github.com:',
                `https://${process.env.GITHUB_TOKEN}@github.com/`
            );
            return execSync(tokenUrl, { 
                cwd: rootDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf-8'
            });
        }
        
        return execSync(command, { 
            cwd: rootDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf-8'
        });
    } catch (error) {
        console.error(`Error executing command: ${command}`);
        console.error(error.message);
        process.exit(1);
    }
}

// Function to validate environment
function validateEnvironment() {
    const requiredVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing.join(', '));
        console.error('Please check your .env file');
        process.exit(1);
    }
}

// Function to ensure develop branch exists
function ensureDevelopBranch() {
    try {
        // Check if develop branch exists locally
        const branches = execGitCommand('git branch --list develop');
        
        if (!branches.includes('develop')) {
            // Check if develop exists on remote
            const remoteBranches = execGitCommand('git ls-remote --heads origin develop');
            
            if (remoteBranches.includes('develop')) {
                // Checkout develop from remote
                console.log('Checking out develop branch from remote...');
                execGitCommand('git checkout -b develop origin/develop');
            } else {
                // Create new develop branch
                console.log('Creating new develop branch...');
                execGitCommand('git checkout -b develop');
                execGitCommand('git push -u origin develop');
            }
        }
    } catch (error) {
        console.error('Error ensuring develop branch:', error.message);
        process.exit(1);
    }
}

// Main function to handle commit process
function commitToDevelop() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Enter your commit message: ', (message) => {
        if (!message) {
            console.error('Error: Commit message is required');
            rl.close();
            process.exit(1);
        }

        // Validate environment variables
        validateEnvironment();

        try {
            // Get current branch
            const currentBranch = execGitCommand('git rev-parse --abbrev-ref HEAD').trim();
            
            // Store any uncommitted changes
            const hasChanges = execGitCommand('git status --porcelain').length > 0;
            if (hasChanges) {
                console.log('Stashing current changes...');
                execGitCommand('git stash');
            }

            // Ensure develop branch exists
            ensureDevelopBranch();

            // Switch to develop branch
            if (currentBranch !== 'develop') {
                console.log('Switching to develop branch...');
                execGitCommand('git checkout develop');
            }

            // Pull latest changes
            console.log('Pulling latest changes from develop...');
            execGitCommand('git pull origin develop');

            // Apply stashed changes if any
            if (hasChanges) {
                console.log('Applying stashed changes...');
                execGitCommand('git stash pop');
                
                // Check for conflicts
                const status = execGitCommand('git status --porcelain');
                if (status.includes('UU ')) {
                    console.error('Merge conflicts detected. Please resolve them manually.');
                    process.exit(1);
                }
            }

            // Stage all changes
            console.log('Staging changes...');
            execGitCommand('git add .');

            // Set git config for commit
            execGitCommand(`git config user.name "${process.env.GITHUB_OWNER}"`);
            execGitCommand(`git config user.email "${process.env.GITHUB_OWNER}@users.noreply.github.com"`);

            // Commit changes
            console.log('Committing changes...');
            execGitCommand(`git commit -m "${message}"`);

            // Push to remote
            console.log('Pushing to remote...');
            execGitCommand('git push origin develop');

            // Switch back to original branch if different
            if (currentBranch !== 'develop') {
                console.log(`Switching back to ${currentBranch}...`);
                execGitCommand(`git checkout ${currentBranch}`);
            }

            console.log('Successfully committed to develop branch! ');
        } catch (error) {
            console.error('Error during commit process:', error.message);
            process.exit(1);
        }

        rl.close();
    });
}

// Run the commit process
commitToDevelop();
