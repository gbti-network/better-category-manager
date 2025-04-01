# GitHub CLI Integration Guide

This guide explains how to integrate automated GitHub commit and release workflows into your project using Node.js scripts. These scripts will help you:

1. Commit changes to GitHub through the command line
2. Create and push new releases to GitHub using the command line

## Prerequisites

Before using these scripts, ensure you have:

- [Node.js](https://nodejs.org/) installed (v14 or newer)
- [Git](https://git-scm.com/) installed and configured
- A GitHub account with a repository for your project
- Basic familiarity with command line operations

## Setup Instructions

### 1. Create Required Directory Structure

First, create a `.scripts` directory in your project's root folder.

### 2. Install Required Dependencies

Navigate to the `.scripts` directory and initialize a new Node.js project:

```powershell
Set-Location -Path "path\to\your\project\.scripts"
npm init -y
npm install dotenv fs-extra inquirer @octokit/rest child_process path readline
```

### 3. Create Environment Configuration

Create a `.env` file in the `.scripts` directory with your GitHub credentials:

```powershell
New-Item -Path ".env" -ItemType File
```

Add the following content to the `.env` file:

```
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_OWNER=your_github_username_or_organization
GITHUB_REPO=your_repository_name
```

To create a GitHub personal access token:
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a new token with `repo` scope permissions
3. Copy the token and paste it in your `.env` file

### 4. Setup Root Package.json for Easy Script Access

Create or update a `package.json` file in your project's root directory to make the scripts easily accessible:

```powershell
Set-Location -Path "path\to\your\project"
```

If you don't already have a package.json file, create one:

```powershell
npm init -y
```

Then edit the package.json to add script commands:

```json
{
  "name": "your-project-name",
  "version": "1.0.0",
  "description": "Your project description",
  "scripts": {
    "commit": "node .scripts/commit.js",
    "release": "node .scripts/release.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-username/your-repo.git"
  },
  "author": "Your Name",
  "license": "Your License"
}
```

With this setup, you can run the scripts using npm:

```powershell
npm run commit
npm run release
```

### 5. Update .gitignore

Make sure to add the `.env` file to your `.gitignore` to prevent accidentally committing your GitHub credentials:

```powershell
Set-Location -Path "path\to\your\project"
```

If you don't have a .gitignore file, create one:

```powershell
New-Item -Path ".gitignore" -ItemType File
```

Add the following to your .gitignore file:

```
# Environment variables
.env
.scripts/.env

# Node modules
node_modules
.scripts/node_modules

# Backup files
.backup/
```

This ensures your sensitive credentials and unnecessary files don't get committed to your repository.

### 6. Add the Scripts

Create the following script files in your `.scripts` directory:

#### commit.js

This script handles committing changes to your GitHub repository:

```javascript
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

            console.log('Successfully committed to develop branch!');
        } catch (error) {
            console.error('Error during commit process:', error.message);
            process.exit(1);
        }

        rl.close();
    });
}

// Run the commit process
commitToDevelop();
```

#### release.js

This script handles creating new releases on GitHub:

```javascript
require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const readline = require('readline');
const { Octokit } = require('@octokit/rest');

// Get the root directory (parent of scripts)
const rootDir = path.resolve(__dirname, '..');

// Configuration
const config = {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    token: process.env.GITHUB_TOKEN
};

// Initialize Octokit
const octokit = new Octokit({
    auth: config.token
});

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
 * Validate environment
 */
function validateEnvironment() {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }
    if (!process.env.GITHUB_OWNER) {
        throw new Error('GITHUB_OWNER environment variable is required');
    }
    if (!process.env.GITHUB_REPO) {
        throw new Error('GITHUB_REPO environment variable is required');
    }
}

/**
 * Create a GitHub release
 * @param {string} version Release version
 * @param {string} releaseNotes Release notes
 * @returns {Promise<void>}
 */
async function createGitHubRelease(version, releaseNotes) {
    console.log('\nCreating GitHub release...');
    
    try {
        const release = await octokit.repos.createRelease({
            owner: config.owner,
            repo: config.repo,
            tag_name: `v${version}`,
            name: `Version ${version}`,
            body: releaseNotes,
            draft: false,
            prerelease: false
        });
        
        console.log(`GitHub release created: ${release.data.html_url}`);
    } catch (error) {
        console.error('Failed to create GitHub release:', error.message);
        throw error;
    }
}

/**
 * Main release function
 */
async function release() {
    try {
        validateEnvironment();
        
        // Prompt for version and release notes
        const { version } = await inquirer.prompt([{
            type: 'input',
            name: 'version',
            message: 'Enter the version number for this release (e.g., 1.0.0):',
            validate: input => /^\d+\.\d+\.\d+$/.test(input) ? true : 'Please enter a valid semver version (e.g., 1.0.0)'
        }]);
        
        const { releaseNotes } = await inquirer.prompt([{
            type: 'editor',
            name: 'releaseNotes',
            message: 'Enter the release notes (an editor will open):',
            default: `Version ${version}\n\nChanges in this release:\n- `
        }]);
        
        try {
            // Commit any pending changes
            const hasChanges = execGitCommand('git status --porcelain').length > 0;
            if (hasChanges) {
                console.log('\nCommitting pending changes...');
                execGitCommand('git add .');
                execGitCommand(`git commit -m "Prepare for release ${version}"`);
                execGitCommand('git push origin develop');
            }

            // Merge develop into master
            console.log('\nMerging develop into master...');
            execGitCommand('git checkout master');
            execGitCommand('git pull origin master');
            execGitCommand('git merge develop');
            execGitCommand('git push origin master');
            
            // Create tag
            console.log('\nCreating tag...');
            execGitCommand(`git tag -a v${version} -m "Version ${version}"`);
            execGitCommand('git push origin --tags');
            
            // Create GitHub release
            await createGitHubRelease(version, releaseNotes);
            
            // Switch back to develop
            execGitCommand('git checkout develop');
            
            console.log(`\n🎉 Successfully released version ${version}!`);
        } catch (error) {
            console.error('Error during release:', error);
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
```

## Using the Scripts

### Committing Changes to GitHub

To commit changes to your GitHub repository:

```powershell
Set-Location -Path "path\to\your\project"
npm run commit
```

This will:
1. Prompt you for a commit message
2. Ensure the develop branch exists
3. Switch to the develop branch
4. Pull the latest changes
5. Stage and commit your changes
6. Push to the develop branch on GitHub

### Creating a New Release

To create a new release:

```powershell
Set-Location -Path "path\to\your\project"
npm run release
```

This will:
1. Prompt you to enter a version number
2. Open an editor for you to enter release notes
3. Commit any pending changes
4. Merge the develop branch into master
5. Create a new tag for the release
6. Create a GitHub release with your notes
7. Switch back to the develop branch

## Customization

You can customize these scripts to fit your specific workflow:

1. Modify the Git workflow (branch names, commit message formats)
2. Adjust the release process to include additional steps
3. Change the prompts or default values
4. Add additional validation or error handling

## Troubleshooting

If you encounter issues:

1. Check that your `.env` file contains valid GitHub credentials
2. Ensure your GitHub token has sufficient permissions
3. Verify that Git is properly configured on your system
4. Check for any error messages in the console output

## Additional Resources

- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Node.js Documentation](https://nodejs.org/en/docs/)
