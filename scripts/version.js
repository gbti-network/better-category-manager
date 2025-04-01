const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');

// Paths to package.json files
const mainPackageJson = path.resolve(__dirname, '../package.json');
const scriptsPackageJson = path.resolve(__dirname, './package.json');
const pluginFile = path.resolve(__dirname, '../better-category-manager.php');

/**
 * Update version in a package.json file
 */
async function updatePackageVersion(filePath, newVersion) {
    const pkg = await fs.readJson(filePath);
    pkg.version = newVersion;
    await fs.writeJson(filePath, pkg, { spaces: 2 });
    console.log(`✓ Updated version in ${path.basename(filePath)} to ${newVersion}`);
}

/**
 * Update version in the main plugin file
 */
async function updatePluginVersion(newVersion) {
    let content = await fs.readFile(pluginFile, 'utf8');
    
    // Update version in plugin header
    content = content.replace(
        /Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/,
        `Version: ${newVersion}`
    );
    
    // Update BCATM_VERSION constant
    content = content.replace(
        /define\('BCATM_VERSION',\s*'([0-9]+\.[0-9]+\.[0-9]+)'\);/,
        `define('BCATM_VERSION', '${newVersion}');`
    );
    
    await fs.writeFile(pluginFile, content, 'utf8');
    console.log(`✓ Updated version in plugin file to ${newVersion}`);
}

/**
 * Update version in README.md file
 */
async function updateReadmeVersion(newVersion) {
    const readmeFile = path.resolve(__dirname, '../README.md');
    
    // Check if README.md exists
    if (await fs.pathExists(readmeFile)) {
        let content = await fs.readFile(readmeFile, 'utf8');
        content = content.replace(
            /## Version: ([0-9]+\.[0-9]+\.[0-9]+)/,
            `## Version: ${newVersion}`
        );
        await fs.writeFile(readmeFile, content, 'utf8');
        console.log(`✓ Updated version in README.md file to ${newVersion}`);
    }
}

/**
 * Update version in readme.txt file
 */
async function updateReadmeTxtVersion(newVersion) {
    const readmeTxtFile = path.resolve(__dirname, '../readme.txt');
    
    // Check if readme.txt exists
    if (await fs.pathExists(readmeTxtFile)) {
        let content = await fs.readFile(readmeTxtFile, 'utf8');
        
        // Update Stable tag
        content = content.replace(
            /Stable tag:\s*([0-9]+\.[0-9]+\.[0-9]+)/,
            `Stable tag: ${newVersion}`
        );
        
        await fs.writeFile(readmeTxtFile, content, 'utf8');
        console.log(`Updated version in readme.txt to ${newVersion}`);
    }
}

/**
 * Update version across all files
 */
async function updateVersions(type = 'patch', specificVersion = null) {
    try {
        console.log('\n📦 Updating version numbers...');
        
        // Read current version from main package.json
        const pkg = await fs.readJson(mainPackageJson);
        const currentVersion = pkg.version;
        
        // Calculate new version or use specific version
        let newVersion;
        if (specificVersion) {
            newVersion = specificVersion;
        } else if (type === 'none') {
            newVersion = currentVersion; // No increment, just sync
        } else {
            newVersion = semver.inc(currentVersion, type);
            if (!newVersion) {
                throw new Error('Invalid version increment type');
            }
        }

        // Update all files
        await updatePackageVersion(mainPackageJson, newVersion);
        await updatePackageVersion(scriptsPackageJson, newVersion);
        await updatePluginVersion(newVersion);
        await updateReadmeVersion(newVersion);
        await updateReadmeTxtVersion(newVersion);
        
        console.log(`\n✅ Successfully updated all versions from ${currentVersion} to ${newVersion}`);
        return newVersion;
    } catch (error) {
        console.error('Error updating versions:', error);
        throw error;
    }
}

/**
 * Get current version from package.json
 * @returns {Promise<string>} Current version
 */
async function getCurrentVersion() {
    try {
        const pkg = await fs.readJson(mainPackageJson);
        return pkg.version;
    } catch (error) {
        console.error('Error getting current version:', error);
        throw error;
    }
}

/**
 * Synchronize versions across all files to match the main package.json
 * @returns {Promise<string>} The synchronized version
 */
async function synchronizeVersions() {
    try {
        // Get the version from main package.json
        const mainVersion = await getCurrentVersion();
        console.log(`\n🔄 Synchronizing all version references to ${mainVersion}...`);
        
        // Update all files to match the main version
        await updatePackageVersion(scriptsPackageJson, mainVersion);
        await updatePluginVersion(mainVersion);
        await updateReadmeVersion(mainVersion);
        await updateReadmeTxtVersion(mainVersion);
        
        console.log(`✅ All version references synchronized to ${mainVersion}`);
        return mainVersion;
    } catch (error) {
        console.error('Error synchronizing versions:', error);
        throw error;
    }
}

module.exports = {
    updateVersions,
    getCurrentVersion,
    synchronizeVersions
};
