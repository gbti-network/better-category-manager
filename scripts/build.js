const dotenv = require('dotenv');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const semver = require('semver');
const release = require('./release');
const os = require('os');

// Initialize dotenv
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    sourceDir: path.resolve(__dirname, '..'),
    buildDir: path.resolve(__dirname, '../build'),
    distDir: path.resolve(__dirname, '../dist'),
    mainFile: path.resolve(__dirname, '../better-category-manager.php'),
    readmeFile: path.resolve(__dirname, '../readme.txt'),
    svnDir: path.resolve(__dirname, '../svn'),
    maxOldBuilds: 3, // Maximum number of old builds to keep
    exclude: [
        // Git and SVN
        '.git',
        '.git/**',
        '.svn',
        '.svn/**',
        'svn',
        'svn/**',
        // Development files
        'node_modules',
        'node_modules/**',
        'scripts',
        'scripts/**',
        '.scripts',
        '.scripts/**',
        // Project files
        '.product',
        '.product/**',
        '.snapshots',
        '.snapshots/**',
        '.data',
        '.data/**',
        '.backup',
        '.backup/**',
        // Environment and config files
        '.env',
        '.env.*',
        'package.json',
        'package-lock.json',
        'composer.json',
        'composer.lock',
        '.gitignore',
        '.svnignore',
        // Build and dist
        'build',
        'build/**',
        'dist',
        'dist/**',
        // Debug files
        'debug.log',
        '**/*.map',
        '**/*.log',
        // Documentation
        'readme.md',
        'README.md',
        // Translation source files
        'languages/**/*.po'
    ]
};

/**
 * Read current version from plugin file
 */
function getCurrentVersion() {
    const content = fs.readFileSync(config.mainFile, 'utf8');
    const match = content.match(/Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
    return match ? match[1] : null;
}

/**
 * Backup files before making changes
 */
function backupFiles() {
    console.log('\n Backing up files...');
    try {
        fileBackups = {
            mainFile: fs.readFileSync(config.mainFile, 'utf8'),
            readmeFile: fs.existsSync(config.readmeFile) ? fs.readFileSync(config.readmeFile, 'utf8') : null
        };
        console.log(' Files backed up successfully');
    } catch (error) {
        throw new Error('Failed to backup files: ' + error.message);
    }
}

/**
 * Restore files from backup
 */
function rollbackFiles() {
    console.log('\n Rolling back file changes...');
    try {
        if (fileBackups.mainFile) {
            fs.writeFileSync(config.mainFile, fileBackups.mainFile);
        }
        if (fileBackups.readmeFile) {
            fs.writeFileSync(config.readmeFile, fileBackups.readmeFile);
        }
        console.log(' Files rolled back successfully');
    } catch (error) {
        console.error(' Failed to rollback files:', error.message);
    }
}

/**
 * Update version in files
 */
function updateVersions(newVersion) {
    try {
        // Backup files before making changes
        backupFiles();

        // Update main plugin file header
        let content = fs.readFileSync(config.mainFile, 'utf8');
        content = content.replace(
            /(Version:\s*)([0-9]+\.[0-9]+\.[0-9]+)/,
            '$1' + newVersion
        );
        
        // Update PHP constant if it exists
        if (content.includes('BCATM_VERSION')) {
            content = content.replace(
                /(define\s*\(\s*['"]BCATM_VERSION['"]\s*,\s*['"])([0-9]+\.[0-9]+\.[0-9]+)(['"])/,
                '$1' + newVersion + '$3'
            );
        }
        fs.writeFileSync(config.mainFile, content);

        // Update readme.txt if it exists
        if (fs.existsSync(config.readmeFile)) {
            content = fs.readFileSync(config.readmeFile, 'utf8');
            content = content.replace(
                /(Stable tag:\s*)([0-9]+\.[0-9]+\.[0-9]+)/,
                '$1' + newVersion
            );
            fs.writeFileSync(config.readmeFile, content);
        }
        
        console.log(` Updated version to ${newVersion}`);
    } catch (error) {
        // If anything fails during version update, rollback
        rollbackFiles();
        throw error;
    }
}

/**
 * Calculate new version based on current version and release type
 */
function calculateNewVersion(currentVersion, releaseType) {
    return semver.inc(currentVersion, releaseType);
}

/**
 * Check if a file should be excluded from the build
 * @param {string} filepath File path to check
 * @returns {boolean} True if file should be excluded
 */
function shouldExclude(filepath) {
    const relativePath = path.relative(config.sourceDir, filepath).replace(/\\/g, '/');
    
    // Always exclude the build and dist directories
    if (filepath.startsWith(config.buildDir) || filepath.startsWith(config.distDir)) {
        return true;
    }
    
    // Special check for .po files in languages directory
    if (relativePath.startsWith('languages/') && relativePath.endsWith('.po')) {
        return true;
    }
    
    return config.exclude.some(pattern => {
        // Handle patterns with wildcards
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(relativePath);
        }
        
        // Handle direct matches and directory matches
        return relativePath === pattern || 
               relativePath.startsWith(pattern + '/');
    });
}

/**
 * Copy plugin files to build directory
 */
function copyFiles(callback, silent) {
    if (!silent) console.log('\nCopying plugin files...');
    try {
        // Clean build directory first
        fs.emptyDirSync(config.buildDir);
        console.log(' ✓ Cleaned build directory');

        // Create plugin directory in build
        const targetDir = path.join(config.buildDir, config.pluginSlug);
        fs.ensureDirSync(targetDir);

        // Walk through the source directory
        function processDirectory(currentPath) {
            const items = fs.readdirSync(currentPath);
            
            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const relativePath = path.relative(config.sourceDir, fullPath);
                
                // Skip if path should be excluded
                if (shouldExclude(relativePath)) {
                    if (!silent) console.log('  ✓ Skipping:', relativePath);
                    continue;
                }

                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    // Create directory in target
                    const targetPath = path.join(targetDir, relativePath);
                    fs.ensureDirSync(targetPath);
                    if (!silent) console.log('  ✓ Created directory:', relativePath);
                    
                    // Process subdirectory
                    processDirectory(fullPath);
                } else {
                    // Copy file
                    const targetPath = path.join(targetDir, relativePath);
                    fs.copySync(fullPath, targetPath);
                    if (!silent) console.log('  ✓ Copied:', relativePath);
                }
            }
        }

        // Start processing from source directory
        processDirectory(config.sourceDir);

        // Preserve SVN assets directory
        const svnAssetsDir = path.join(config.svnDir, 'assets');
        if (fs.existsSync(svnAssetsDir)) {
            console.log(' Preserving SVN assets directory...');
            const assetsBackupDir = path.join(os.tmpdir(), `${config.pluginSlug}_assets_backup`);
            fs.copySync(svnAssetsDir, assetsBackupDir);
        }

        if (!silent) console.log('\n✓ All files copied successfully');
        if (callback) callback(null);
    } catch (error) {
        if (callback) callback(error);
    }
}

/**
 * Restore SVN assets if they were backed up
 */
function restoreSvnAssets(silent) {
    const assetsBackupDir = path.join(os.tmpdir(), `${config.pluginSlug}_assets_backup`);
    const svnAssetsDir = path.join(config.svnDir, 'assets');
    
    if (fs.existsSync(assetsBackupDir)) {
        if (!silent) console.log(' Restoring SVN assets...');
        fs.ensureDirSync(svnAssetsDir);
        fs.copySync(assetsBackupDir, svnAssetsDir);
        fs.removeSync(assetsBackupDir);
        if (!silent) console.log(' ✓ SVN assets restored');
    }
}

/**
 * Create zip files of the build directory
 * @returns {Promise<string>} Path to the created zip file
 */
function createZip() {
    return new Promise((resolve, reject) => {
        // Ensure dist directory exists
        fs.ensureDirSync(config.distDir);
        
        // Get current version
        const version = getCurrentVersion();
        if (!version) {
            return reject(new Error('Could not determine current version'));
        }
        
        // Create zip file name with version
        const zipFileName = `${config.pluginSlug}-${version}.zip`;
        const zipFilePath = path.join(config.distDir, zipFileName);
        
        // Create a file to stream archive data to
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });
        
        // Listen for all archive data to be written
        output.on('close', function() {
            console.log(` ✓ Created zip file: ${zipFileName} (${archive.pointer()} bytes)`);
            resolve(zipFilePath);
        });
        
        // Good practice to catch warnings
        archive.on('warning', function(err) {
            if (err.code === 'ENOENT') {
                console.warn(' Warning:', err);
            } else {
                reject(err);
            }
        });
        
        // Good practice to catch errors
        archive.on('error', function(err) {
            reject(err);
        });
        
        // Pipe archive data to the file
        archive.pipe(output);
        
        // Add the entire build directory to the archive
        archive.directory(path.join(config.buildDir, config.pluginSlug), config.pluginSlug);
        
        // Finalize the archive
        archive.finalize();
    });
}

/**
 * Deploy the plugin
 * @param {Function} callback Callback function
 */
function deploy(callback) {
    console.log('\nCreating distribution package...');
    
    createZip()
        .then(zipPath => {
            console.log(' ✓ Distribution package created successfully');
            if (callback) callback(null, zipPath);
        })
        .catch(error => {
            console.error(' Error creating distribution package:', error);
            if (callback) callback(error);
        });
}

/**
 * Clean old builds from the dist directory, keeping only the most recent ones
 */
function cleanOldBuilds() {
    console.log('\nCleaning old builds...');
    
    try {
        // Ensure dist directory exists
        fs.ensureDirSync(config.distDir);
        
        // Get all zip files in the dist directory
        const files = fs.readdirSync(config.distDir)
            .filter(file => file.endsWith('.zip'))
            .map(file => ({
                name: file,
                path: path.join(config.distDir, file),
                time: fs.statSync(path.join(config.distDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by time, newest first
        
        console.log(` Found ${files.length} zip files in dist directory`);
        
        // Keep only the most recent builds
        if (files.length > config.maxOldBuilds) {
            const filesToDelete = files.slice(config.maxOldBuilds);
            console.log(` Removing ${filesToDelete.length} old builds...`);
            
            for (const file of filesToDelete) {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`  ✓ Deleted ${file.name}`);
                } catch (error) {
                    console.error(`  ✗ Error deleting ${file.name}: ${error.message}`);
                }
            }
        } else {
            console.log(` Only ${files.length} zip files found, no cleanup needed (keeping up to ${config.maxOldBuilds})`);
        }
    } catch (error) {
        console.error(' Error cleaning old builds:', error);
    }
}

/**
 * Clean all previous builds from the dist directory
 */
function cleanAllBuilds() {
    console.log('\nCleaning all previous builds...');
    
    try {
        // Clean build directory
        if (fs.existsSync(config.buildDir)) {
            fs.emptyDirSync(config.buildDir);
            console.log(' ✓ Build directory cleaned');
        } else {
            fs.ensureDirSync(config.buildDir);
            console.log(' ✓ Build directory created');
        }
        
        // Clean dist directory
        if (fs.existsSync(config.distDir)) {
            fs.emptyDirSync(config.distDir);
            console.log(' ✓ Dist directory cleaned');
        } else {
            fs.ensureDirSync(config.distDir);
            console.log(' ✓ Dist directory created');
        }
    } catch (error) {
        console.error(' Error cleaning builds:', error);
        throw error;
    }
}

function rollbackOnError(error, newVersion, currentVersion) {
    if (newVersion !== currentVersion) {
        console.error('\n Release failed, rolling back version changes...');
        rollbackFiles();
        console.log(' Version rolled back to', currentVersion);
    }
    console.error('\n Error:', error.message);
}

/**
 * Main build function
 * @param {Function} callback Callback function to be called when build is complete
 * @param {Object} options Build options
 * @returns {Promise<string>} Promise that resolves with the zip path if no callback is provided
 */
function build(callback, options = {}) {
    // Default options
    options = Object.assign({
        isTest: false,
        skipPrompts: false,
        silent: false
    }, options);
    
    // Check if this is a test run by examining command line arguments
    // This needs to be done here to ensure we catch all test runs
    const args = process.argv.slice(2);
    if (args.includes('--test')) {
        options.isTest = true;
        options.skipPrompts = true;
    }
    
    // Get current version
    var currentVersion = getCurrentVersion();
    console.log('Current version: ' + currentVersion);
    
    // If called from release script, we want to skip prompts and just build
    if (require.main !== module || options.skipPrompts) {
        // Create a promise if no callback is provided
        if (!callback) {
            return new Promise((resolve, reject) => {
                // Copy files and then create zip
                copyFiles(function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // Create zip file
                    createZip()
                        .then(zipPath => {
                            console.log(`\n✅ Build completed successfully! Zip file created at: ${zipPath}`);
                            resolve(zipPath);
                        })
                        .catch(reject);
                }, options.silent);
            });
        } else {
            // Use callback approach
            copyFiles(function(err) {
                if (err) {
                    callback(err);
                    return;
                }
                
                // Create zip file
                createZip()
                    .then(zipPath => {
                        console.log(`\n✅ Build completed successfully! Zip file created at: ${zipPath}`);
                        callback(null, zipPath);
                    })
                    .catch(err => callback(err));
            }, options.silent);
            return;
        }
    }
    
    // Skip prompts for test runs
    if (options.isTest || options.skipPrompts) {
        // For tests, just proceed with the current version
        copyFiles(function(err) {
            if (err) {
                console.error('Build failed:', err.message);
                if (callback) callback(err);
                return;
            }
            
            if (callback) callback(null);
        }, options.silent);
        return;
    }
    
    // First, prompt for version type if needed
    async function runPrompts() {
        try {
            // First prompt - ask for version type
            const { type } = await inquirer.prompt([{
                type: 'list',
                name: 'type',
                message: 'What type of release is this?',
                choices: [
                    { name: 'patch', value: 'patch' },
                    { name: 'minor', value: 'minor' },
                    { name: 'major', value: 'major' }
                ],
                loop: false,
                pageSize: 10,
                default: null
            }]);
            
            // Calculate new version
            const newVersion = calculateNewVersion(currentVersion, type);
            
            // Confirm version update
            const { confirmVersion } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirmVersion',
                message: `Current version is ${currentVersion}. Update to ${newVersion}?`,
                default: true
            }]);
            
            if (!confirmVersion) {
                console.log('\nBuild process cancelled by user');
                if (callback) callback(null);
                return;
            }
            
            // Second prompt - ask what action to take
            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    { name: '1. Generate Build Files Only', value: 'build' },
                    { name: '2. Build and Commit to GitHub', value: 'commit' },
                    { name: '3. Build and Make New Release to GitHub', value: 'release' },
                    { name: '4. Build and Make New Release to SVN', value: 'svn' },
                    { name: '5. Build and Make New Release to GitHub & SVN', value: 'both' },
                    { name: '6. Test All Systems (Dry Run)', value: 'test' }
                ],
                loop: false,
                pageSize: 10,
                default: null
            }]);
            
            // Confirm action
            const { confirmAction } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirmAction',
                message: `Are you sure you want to ${action}?`,
                default: true
            }]);
            
            if (!confirmAction) {
                console.log('\nBuild process cancelled by user');
                if (callback) callback(null);
                return;
            }
            
            // Update version in files if needed
            if (['release', 'svn', 'both'].includes(action)) {
                try {
                    // Update version in files
                    await updateVersions(newVersion);
                } catch (error) {
                    console.error('Error updating version:', error);
                    rollbackFiles();
                    if (callback) callback(error);
                    return;
                }
            }
            
            // Handle the build process
            handleBuild(action, newVersion);
            
        } catch (error) {
            console.error('Error during prompts:', error);
            if (callback) callback(error);
        }
    }
    
    function handleBuild(action, newVersion) {
        copyFiles(function(err) {
            if (err) throw err;

            deploy(function(err, zipFile) {
                if (err) throw err;

                // Handle different actions
                switch (action) {
                    case 'commit':
                        release.handleGitBranches(function(err) {
                            if (err) {
                                rollbackOnError(err, newVersion, currentVersion);
                            } else {
                                console.log('\n Build process completed successfully!');
                            }
                        }, false);
                        break;
                    case 'release':
                        release.handleGitBranches(function(err) {
                            if (err) {
                                rollbackOnError(err, newVersion, currentVersion);
                                return;
                            }
                            release.createGitHubRelease(newVersion, zipFile, function(err) {
                                if (err) {
                                    rollbackOnError(err, newVersion, currentVersion);
                                } else {
                                    console.log('\n Build process completed successfully!');
                                }
                            });
                        }, true);
                        break;
                    case 'svn':
                        const svnRelease = require('./release-svn');
                        svnRelease(newVersion)
                            .then(() => {
                                console.log('\n Build process completed successfully!');
                            })
                            .catch(err => {
                                rollbackOnError(err, newVersion, currentVersion);
                            });
                        break;
                    case 'both':
                        release.handleGitBranches(function(err) {
                            if (err) {
                                rollbackOnError(err, newVersion, currentVersion);
                                return;
                            }
                            release.createGitHubRelease(newVersion, zipFile, function(err) {
                                if (err) {
                                    rollbackOnError(err, newVersion, currentVersion);
                                    return;
                                }
                                
                                const svnRelease = require('./release-svn');
                                svnRelease(newVersion)
                                    .then(() => {
                                        console.log('\n Build process completed successfully!');
                                    })
                                    .catch(err => {
                                        rollbackOnError(err, newVersion, currentVersion);
                                    });
                            });
                        }, true);
                        break;
                    case 'test':
                        testAllSystems(function(err) {
                            if (err) {
                                console.error('\n❌ System tests failed:', err);
                            } else {
                                console.log('\n✅ All system tests completed successfully!');
                            }
                        });
                        break;
                    default:
                        console.log('\n Build process completed successfully!');
                }
            });
        });
    }

    // Start the prompt sequence
    runPrompts().catch(function(err) {
        if (callback) callback(err);
    });
}

/**
 * Test version incrementing functionality
 */
function testVersionIncrementing(callback) {
    console.log('\n📋 Testing version incrementing functionality:');
    
    try {
        // Get current version from package.json
        const packageJson = require(path.join(config.sourceDir, 'package.json'));
        const currentVersion = packageJson.version;
        console.log(` Current version: ${currentVersion}`);
        
        // Test patch increment
        const patchVersion = semver.inc(currentVersion, 'patch');
        console.log(` ✅ Patch increment: ${currentVersion} → ${patchVersion}`);
        
        // Test minor increment
        const minorVersion = semver.inc(currentVersion, 'minor');
        console.log(` ✅ Minor increment: ${currentVersion} → ${minorVersion}`);
        
        // Test major increment
        const majorVersion = semver.inc(currentVersion, 'major');
        console.log(` ✅ Major increment: ${currentVersion} → ${majorVersion}`);
        
        // Test version updating in files
        console.log(' Testing version updating in files...');
        
        // Create temporary copies of files to test version updating
        const mainFilePath = config.mainFile;
        const mainFileContent = fs.readFileSync(mainFilePath, 'utf8');
        const tempMainFile = path.join(os.tmpdir(), 'temp-main-file.php');
        fs.writeFileSync(tempMainFile, mainFileContent);
        
        const packageJsonPath = path.join(config.sourceDir, 'package.json');
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const tempPackageJson = path.join(os.tmpdir(), 'temp-package.json');
        fs.writeFileSync(tempPackageJson, packageJsonContent);
        
        // Test updating version in main plugin file
        const mainFileUpdated = updateVersionInFile(tempMainFile, currentVersion, patchVersion);
        if (mainFileUpdated) {
            console.log(` ✅ Main plugin file version update: ${currentVersion} → ${patchVersion}`);
        } else {
            console.log(` ❌ Failed to update version in main plugin file`);
        }
        
        // Test updating version in package.json
        const packageJsonUpdated = updateVersionInFile(tempPackageJson, currentVersion, patchVersion);
        if (packageJsonUpdated) {
            console.log(` ✅ package.json version update: ${currentVersion} → ${patchVersion}`);
        } else {
            console.log(` ❌ Failed to update version in package.json`);
        }
        
        // Clean up temporary files
        try {
            fs.unlinkSync(tempMainFile);
            fs.unlinkSync(tempPackageJson);
        } catch (e) {
            console.log(` ⚠️ Warning: Could not clean up temporary files: ${e.message}`);
        }
        
        console.log('\n✅ Version incrementing test completed successfully');
        if (callback) callback(null);
    } catch (error) {
        console.log(`\n❌ Version incrementing test failed: ${error.message}`);
        if (callback) callback(error);
    }
}

/**
 * Update version in a file
 * @param {string} filePath - Path to the file
 * @param {string} oldVersion - Old version
 * @param {string} newVersion - New version
 * @returns {boolean} - Whether the update was successful
 */
function updateVersionInFile(filePath, oldVersion, newVersion) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Different patterns for different file types
        if (filePath.endsWith('.php')) {
            // For PHP files, look for Version: X.X.X in the plugin header
            const versionPattern = new RegExp(`(Version:\\s*)${escapeRegExp(oldVersion)}`, 'g');
            content = content.replace(versionPattern, `$1${newVersion}`);
            
            // Also look for define statements like define('PLUGIN_VERSION', 'X.X.X');
            const definePattern = new RegExp(`(define\\s*\\(\\s*['"]\\w+_VERSION['"]\\s*,\\s*['"])${escapeRegExp(oldVersion)}(['"]\\s*\\)\\s*;)`, 'g');
            content = content.replace(definePattern, `$1${newVersion}$2`);
        } else if (filePath.endsWith('.json')) {
            // For JSON files, parse and update the version field
            const json = JSON.parse(content);
            if (json.version) {
                json.version = newVersion;
                content = JSON.stringify(json, null, 2);
            }
        }
        
        fs.writeFileSync(filePath, content);
        return true;
    } catch (error) {
        console.error(`Error updating version in ${filePath}: ${error.message}`);
        return false;
    }
}

/**
 * Escape special characters in a string for use in a regular expression
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test all systems
 */
function testAllSystems(callback, options = {}) {
    console.log('\n🧪 Testing all systems...');
    
    // Test environment variables
    console.log('\n📋 Checking environment variables:');
    const requiredVars = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'];
    const svnVars = ['SVN_USERNAME', 'SVN_PASSWORD'];
    const missingVars = [];
    const missingSvnVars = [];
    
    requiredVars.forEach(varName => {
        if (!process.env[varName]) {
            missingVars.push(varName);
            console.log(`❌ ${varName}: Missing`);
        } else {
            console.log(`✅ ${varName}: Available`);
        }
    });
    
    // Check SVN variables separately
    svnVars.forEach(varName => {
        if (!process.env[varName]) {
            missingSvnVars.push(varName);
            console.log(`❌ ${varName}: Missing (required for SVN releases)`);
        } else {
            console.log(`✅ ${varName}: Available`);
        }
    });
    
    if (missingVars.length > 0) {
        console.warn(`\n⚠️ Warning: Missing ${missingVars.length} required environment variables.`);
        console.warn('These will be needed for actual releases.');
    } else {
        console.log('\n✅ All required GitHub variables are set.');
    }
    
    if (missingSvnVars.length > 0) {
        console.warn(`\n⚠️ Warning: Missing ${missingSvnVars.length} SVN environment variables.`);
        console.warn('These will be needed for SVN releases.');
    } else {
        console.log('✅ All required SVN variables are set.');
    }
    
    // Test file system access
    console.log('\n📋 Checking file system access:');
    const criticalPaths = [
        { path: config.sourceDir, name: 'Source directory' },
        { path: config.buildDir, name: 'Build directory' },
        { path: config.distDir, name: 'Distribution directory' },
        { path: config.mainFile, name: 'Main plugin file' }
    ];
    
    let hasFileSystemErrors = false;
    criticalPaths.forEach(item => {
        try {
            if (item.path.endsWith('.php')) {
                // For files, check if they exist
                if (fs.existsSync(item.path)) {
                    console.log(`✅ ${item.name}: Accessible`);
                } else {
                    console.log(`❌ ${item.name}: Not found`);
                    hasFileSystemErrors = true;
                }
            } else {
                // For directories, ensure they exist and are writable
                fs.ensureDirSync(item.path);
                // Test write access by creating and removing a test file
                const testFile = path.join(item.path, '.write-test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                console.log(`✅ ${item.name}: Accessible and writable`);
            }
        } catch (error) {
            console.log(`❌ ${item.name}: Error - ${error.message}`);
            hasFileSystemErrors = true;
        }
    });
    
    if (hasFileSystemErrors) {
        if (callback) callback(new Error('File system access test failed'));
        return;
    }
    
    // Test git repository
    console.log('\n📋 Testing Git repository:');
    try {
        const gitOutput = require('child_process').execSync('git status', { 
            cwd: config.sourceDir,
            encoding: 'utf8'
        });
        console.log(`✅ Git repository: Valid`);
    } catch (error) {
        console.log(`❌ Git repository: Error - ${error.message}`);
        if (callback) callback(new Error('Git repository test failed'));
        return;
    }
    
    // Test version incrementing if requested
    if (options.testVersions) {
        testVersionIncrementing(function(err) {
            if (err) {
                if (callback) callback(err);
                return;
            }
            
            // Continue with other tests
            continueWithTests();
        });
    } else {
        // Continue with other tests
        continueWithTests();
    }
    
    function continueWithTests() {
        // Test GitHub release process (dry run)
        if (options.testGitHub) {
            console.log('\n📋 Testing GitHub release process (dry run):');
            try {
                const { Octokit } = require('@octokit/rest');
                const octokit = new Octokit({
                    auth: process.env.GITHUB_TOKEN
                });
                
                // Test GitHub API connection
                console.log(' Testing GitHub API connection...');
                octokit.rest.users.getAuthenticated()
                    .then(response => {
                        console.log(` ✅ GitHub API connection successful (authenticated as ${response.data.login})`);
                        
                        // Test repository access
                        console.log(' Testing repository access...');
                        return octokit.rest.repos.get({
                            owner: process.env.GITHUB_OWNER,
                            repo: process.env.GITHUB_REPO
                        });
                    })
                    .then(response => {
                        console.log(` ✅ Repository access successful (${response.data.full_name})`);
                        
                        // Test tag listing
                        console.log(' Testing tag listing...');
                        return octokit.rest.repos.listTags({
                            owner: process.env.GITHUB_OWNER,
                            repo: process.env.GITHUB_REPO,
                            per_page: 1
                        });
                    })
                    .then(response => {
                        console.log(` ✅ Tag listing successful (${response.data.length} tags found)`);
                        console.log('\n✅ GitHub release process test completed successfully');
                        
                        if (options.testSVN) {
                            testSVNRelease(callback);
                        } else if (callback) {
                            callback(null);
                        }
                    })
                    .catch(error => {
                        console.log(` ❌ GitHub API error: ${error.message}`);
                        if (callback) callback(new Error('GitHub release test failed'));
                    });
            } catch (error) {
                console.log(` ❌ GitHub test error: ${error.message}`);
                if (callback) callback(new Error('GitHub release test failed'));
            }
        } 
        // Test SVN release process (dry run)
        else if (options.testSVN) {
            testSVNRelease(callback);
        }
        // All basic tests passed
        else if (callback) {
            callback(null);
        }
    }
}

/**
 * Test SVN release process (dry run)
 */
function testSVNRelease(callback) {
    console.log('\n📋 Testing SVN release process (dry run):');
    
    // Check if SVN is installed
    try {
        console.log(' Testing SVN installation...');
        const svnVersion = require('child_process').execSync('svn --version --quiet', { 
            encoding: 'utf8'
        }).trim();
        console.log(` ✅ SVN installed (version ${svnVersion})`);
        
        // Check WordPress.org SVN repository
        console.log(' Testing WordPress.org SVN repository access...');
        
        // Try to list the trunk directory without authentication
        // This should work for public read access
        try {
            require('child_process').execSync(
                'svn ls https://plugins.svn.wordpress.org/better-category-manager/trunk --non-interactive', 
                { encoding: 'utf8' }
            );
            console.log(' ✅ WordPress.org SVN repository accessible');
            
            // Check if SVN credentials are set in environment variables
            console.log(' Testing SVN credentials...');
            const svnUsername = process.env.SVN_USERNAME;
            const svnPassword = process.env.SVN_PASSWORD;
            
            if (!svnUsername || !svnPassword) {
                console.log(' ❌ SVN credentials not found in environment variables');
                console.log(' ⚠️ SVN_USERNAME and SVN_PASSWORD must be set in your .env file');
                console.log(' ⚠️ Without these credentials, SVN commits will fail');
            } else {
                // Test authentication with WordPress.org
                try {
                    // Create a temporary file with credentials for testing
                    const tempAuthFile = path.join(os.tmpdir(), 'svn-auth-test');
                    fs.writeFileSync(tempAuthFile, `${svnUsername}\n${svnPassword}`);
                    
                    // Try to authenticate with WordPress.org
                    // Using --non-interactive and --no-auth-cache to ensure it uses our provided credentials
                    require('child_process').execSync(
                        `svn info https://plugins.svn.wordpress.org/ --username ${svnUsername} --password ${svnPassword} --non-interactive --no-auth-cache`, 
                        { encoding: 'utf8' }
                    );
                    
                    // Clean up temp file
                    fs.unlinkSync(tempAuthFile);
                    
                    console.log(' ✅ SVN credentials verified successfully');
                } catch (authError) {
                    console.log(` ❌ SVN authentication failed: ${authError.message}`);
                    console.log(' ⚠️ Please check your SVN_USERNAME and SVN_PASSWORD in the .env file');
                }
            }
            
            console.log('\n✅ SVN release process test completed');
            
            if (callback) callback(null);
        } catch (error) {
            console.log(` ❌ SVN repository access error: ${error.message}`);
            console.log(' ⚠️ Note: This may be due to the repository not existing yet or network issues');
            
            if (callback) callback(new Error('SVN repository access test failed'));
        }
    } catch (error) {
        console.log(` ❌ SVN not installed or not in PATH: ${error.message}`);
        console.log(' ⚠️ Please install SVN command line tools to use SVN release functionality');
        
        if (callback) callback(new Error('SVN installation test failed'));
    }
}

// Run if called directly
if (require.main === module) {
    // Check for command line arguments
    var args = process.argv.slice(2);
    
    // First, check if this is a version test to handle it specially
    if (args.includes('--test') && args.includes('--versions')) {
        console.log('\n Starting version incrementing test...');
        const currentVersion = getCurrentVersion();
        console.log(`Current version: ${currentVersion}`);
        
        console.log('Building test package...');
        var silent = true;
        copyFiles(function(err) {
            if (err) {
                console.error('\n Build test failed:', err.message);
                process.exit(1);
            }
            console.log(' Build package created');
            
            testVersionIncrementing(function(err) {
                if (err) {
                    console.error('\n Version test failed:', err.message);
                    process.exit(1);
                } else {
                    console.log('\n All version tests completed successfully!');
                    process.exit(0);
                }
            });
        }, silent);
    }
    // Handle other command line arguments
    else if (args.length > 0) {
        var action = args[0].replace('--', '');
        
        // Don't auto-select release type in any case
        if (['release', 'svn', 'both'].includes(action)) {
            build({
                action: action
            });
        } 
        else if (action === 'build-only') {
            console.log('\n Building distribution files only...');
            build(function(err, zipPath) {
                if (err) {
                    console.error(' Build failed:', err.message);
                    process.exit(1);
                } else {
                    console.log(' Build completed successfully!');
                    console.log(` Zip file created: ${zipPath}`);
                    process.exit(0);
                }
            }, { skipRelease: true, skipVersionPrompt: true });
        }
        else {
            switch (action) {
                case 'test':
                    console.log('\n Starting system test (dry run)...');
                    
                    // Check for additional test options
                    const testGitHub = args.includes('--github');
                    const testSVN = args.includes('--svn');
                    
                    // Get current version directly
                    const currentVersion = getCurrentVersion();
                    console.log(`Current version: ${currentVersion}`);
                    
                    if (!testGitHub && !testSVN) {
                        // If no specific test is requested, show test options menu
                        inquirer.prompt([
                            {
                                type: 'list',
                                name: 'testType',
                                message: 'What would you like to test?',
                                choices: [
                                    { name: '1. Basic System Test', value: 'basic' },
                                    { name: '2. GitHub Release Process (Dry Run)', value: 'github' },
                                    { name: '3. SVN Release Process (Dry Run)', value: 'svn' },
                                    { name: '4. Version Incrementing', value: 'versions' },
                                    { name: '5. Complete Release Process (Dry Run)', value: 'all' }
                                ],
                                loop: false,
                                pageSize: 10,
                                default: null
                            }
                        ]).then(answers => {
                            const testOptions = {
                                testGitHub: ['github', 'all'].includes(answers.testType),
                                testSVN: ['svn', 'all'].includes(answers.testType),
                                testVersions: ['versions', 'all'].includes(answers.testType)
                            };
                            
                            console.log('Building test package...');
                            build(function(err) {
                                if (err) {
                                    console.error('\n Build test failed:', err.message);
                                    process.exit(1);
                                }
                                console.log(' Build package created');
                                
                                testAllSystems(function(err) {
                                    if (err) {
                                        console.error('\n System test failed:', err.message);
                                        process.exit(1);
                                    } else {
                                        console.log('\n All system tests completed successfully!');
                                        process.exit(0);
                                    }
                                }, testOptions);
                            }, { isTest: true, silent: true });
                        });
                    } else {
                        // Specific test options provided via command line
                        console.log('Building test package...');
                        build(function(err) {
                            if (err) {
                                console.error('\n Build test failed:', err.message);
                                process.exit(1);
                            }
                            console.log(' Build package created');
                            
                            testAllSystems(function(err) {
                                if (err) {
                                    console.error('\n System test failed:', err.message);
                                    process.exit(1);
                                } else {
                                    console.log('\n All system tests completed successfully!');
                                    process.exit(0);
                                }
                            }, { testGitHub, testSVN });
                        }, { isTest: true, silent: true });
                    }
                    break;
                case 'release':
                case 'svn':
                case 'both':
                    // Start the build process with the specified action
                    build(function(err) {
                        if (err) {
                            console.error(' Build failed:', err.message);
                            process.exit(1);
                        }
                        process.exit(0);
                    });
                    break;
                default:
                    console.error(' Unknown command:', action);
                    process.exit(1);
            }
        }
    } else {
        // No arguments, show interactive menu
        build(function(err) {
            if (err) {
                console.error(' Build failed:', err.message);
                process.exit(1);
            }
            process.exit(0);
        });
    }
}

// Export the build function
module.exports = build;
