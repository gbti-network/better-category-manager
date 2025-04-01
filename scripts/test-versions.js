/**
 * Test Version Incrementing Script
 * 
 * This script runs only the version incrementing tests without showing any interactive prompts
 */

const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');
const os = require('os');

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    sourceDir: path.resolve(__dirname, '..'),
    buildDir: path.resolve(__dirname, '../build'),
    distDir: path.resolve(__dirname, '../dist'),
    mainFile: path.resolve(__dirname, '../better-category-manager.php'),
    readmeFile: path.resolve(__dirname, '../readme.txt'),
    svnDir: path.resolve(__dirname, '../.svn-repo')
};

// Helper functions
function copyFiles(callback, silent = false) {
    // Create build directory if it doesn't exist
    if (!fs.existsSync(config.buildDir)) {
        fs.mkdirSync(config.buildDir, { recursive: true });
    }
    
    // Clean build directory
    fs.emptyDirSync(config.buildDir);
    
    if (!silent) console.log(' ✓ Cleaned build directory');
    
    // Get source files
    const sourceFiles = getSourceFiles(config.sourceDir);
    
    // Copy files to build directory
    for (const file of sourceFiles) {
        const relPath = path.relative(config.sourceDir, file);
        const destPath = path.join(config.buildDir, relPath);
        
        // Create directory if it doesn't exist
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
            if (!silent) console.log(`  ✓ Created directory: ${path.relative(config.buildDir, destDir)}`);
        }
        
        // Copy file
        fs.copyFileSync(file, destPath);
        if (!silent) console.log(`  ✓ Copied: ${relPath}`);
    }
    
    if (!silent) console.log('\n✓ All files copied successfully');
    
    if (callback) callback(null);
}

function getSourceFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const relativePath = path.relative(config.sourceDir, filePath);
        
        // Skip excluded paths
        if (shouldExclude(relativePath)) {
            console.log(`  ✓ Skipping: ${file}`);
            return;
        }
        
        if (fs.statSync(filePath).isDirectory()) {
            getSourceFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

function shouldExclude(filepath) {
    // Always exclude these directories and files
    const excludePatterns = [
        '.git',
        '.svn',
        '.svn-repo',
        'node_modules',
        '.snapshots',
        '.data',
        '.product',
        'build',
        'dist',
        'scripts'
    ];
    
    // Check for basic exclusions
    for (const pattern of excludePatterns) {
        if (filepath === pattern ||
            filepath.startsWith(pattern + '/') ||
            filepath.startsWith(pattern + '\\')) {
            return true;
        }
    }
    
    // Exclude specific file patterns
    if (filepath.endsWith('.log') ||
        filepath.endsWith('.zip') ||
        filepath.endsWith('.po') ||
        filepath === '.gitignore' ||
        filepath === '.svnignore') {
        return true;
    }
    
    return false;
}

function getCurrentVersion() {
    try {
        // Read version from package.json
        const packageJson = require(path.join(config.sourceDir, 'package.json'));
        return packageJson.version;
    } catch (error) {
        console.error('Error getting current version:', error);
        return null;
    }
}

function updateVersionInFile(filePath, oldVersion, newVersion) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Replace version with regex that handles various formats
        const escapedVersion = escapeRegExp(oldVersion);
        const versionRegexes = [
            // Standard version format
            new RegExp(escapedVersion, 'g'),
            // Version with "Version: " prefix
            new RegExp(`(Version:\\s*)(${escapedVersion})`, 'g'),
            // Version with "Stable tag: " prefix
            new RegExp(`(Stable tag:\\s*)(${escapedVersion})`, 'g'),
            // Version with "version=" prefix
            new RegExp(`(version=["'])(${escapedVersion})`, 'g'),
            // Version with " version " surrounded by quotes
            new RegExp(`(['"](\\s*)?version(\\s*)?['"](\\s*)?:\\s*["'])(${escapedVersion})`, 'g')
        ];
        
        let newContent = content;
        
        // Replace all occurrences
        for (const regex of versionRegexes) {
            newContent = newContent.replace(regex, function(match, prefix = '', ver) {
                return prefix + newVersion;
            });
        }
        
        // Write back to file
        fs.writeFileSync(filePath, newContent, 'utf8');
        
        // Check if any changes were made
        return content !== newContent;
    } catch (e) {
        console.error(`Error updating version in ${filePath}:`, e);
        return false;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        console.error('Version test error:', error);
        if (callback) callback(error);
    }
}

// Run the version tests
console.log('Starting version incrementing test...');
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
