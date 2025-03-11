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
    content = content.replace(
        /Version:\s*([0-9]+\.[0-9]+\.[0-9]+)/,
        `Version: ${newVersion}`
    );
    await fs.writeFile(pluginFile, content, 'utf8');
    console.log(`✓ Updated version in plugin file to ${newVersion}`);
}

/**
 * Update version across all files
 */
async function updateVersions(type = 'patch') {
    try {
        console.log('\n📦 Updating version numbers...');
        
        // Read current version from main package.json
        const pkg = await fs.readJson(mainPackageJson);
        const currentVersion = pkg.version;
        
        // Calculate new version
        const newVersion = semver.inc(currentVersion, type);
        if (!newVersion) {
            throw new Error('Invalid version increment type');
        }

        // Update all files
        await updatePackageVersion(mainPackageJson, newVersion);
        await updatePackageVersion(scriptsPackageJson, newVersion);
        await updatePluginVersion(newVersion);

        console.log(`\n✅ Successfully updated all versions from ${currentVersion} to ${newVersion}`);
        return newVersion;
    } catch (error) {
        console.error('\n❌ Error updating versions:', error.message);
        throw error;
    }
}

/**
 * Get current version from main package.json
 */
async function getCurrentVersion() {
    const pkg = await fs.readJson(mainPackageJson);
    return pkg.version;
}

module.exports = {
    updateVersions,
    getCurrentVersion
};
