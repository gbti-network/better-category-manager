const dotenv = require('dotenv');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

// Initialize dotenv
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration
const config = {
    pluginSlug: 'better-category-manager',
    sourceDir: path.resolve(__dirname, '..'),
    buildDir: path.resolve(__dirname, '../build'),
    distDir: path.resolve(__dirname, '../dist'),
    mainFile: path.resolve(__dirname, '../better-category-manager.php'),
    excludePatterns: [
        '.git',                     // Git directory
        '.git/**',                  // Git files
        '.idea',                    // IDE directory
        '.idea/**',                 // IDE files
        '.snapshots',               // Snapshots directory
        '.snapshots/**',            // Snapshot files
        '.data',                    // Data directory
        '.data/**',                // Data files
        'package.json',            // Package files
        'package-lock.json',
        'composer.json',
        'composer.lock',
        'debug.log',               // Debug log
        '.gitignore',              // Git ignore file
        '.scripts',                 // Scripts directory
        'scripts',                 // Scripts directory
        'scripts/**',              // Script files
        'node_modules',            // Node modules
        'node_modules/**',         // Node module files
        'tests',                   // Tests directory
        'tests/**',                // Test files
        'build',                   // Build directory
        'build/**',                // Build files
        'dist',                    // Dist directory
        'dist/**',                 // Dist files
        '**/*.map',                // Source maps
        '**/*.log',                // Log files
        '.env',                    // Environment files
        '.env.*',
        '.backup',                 // Backup directory
        '.backup/**',              // Backup files
        '.product/assets'              // Product files
    ]
};

/**
 * Check if a file should be excluded from the build
 * @param {string} filepath File path to check
 * @returns {boolean} True if file should be excluded
 */
function shouldExclude(filepath) {
    const relativePath = path.relative(config.sourceDir, filepath);
    
    // Always exclude the build and dist directories
    if (filepath.startsWith(config.buildDir) || filepath.startsWith(config.distDir)) {
        return true;
    }
    
    return config.excludePatterns.some(pattern => {
        // Handle patterns with wildcards
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(relativePath);
        }
        
        // Handle direct matches and directory matches
        return relativePath === pattern || 
               relativePath.startsWith(pattern + path.sep) ||
               relativePath.startsWith(pattern + '/');
    });
}

/**
 * Create a zip file of the build directory
 * @returns {Promise<string>} Path to the created zip file
 */
async function createZip() {
    // Ensure dist directory exists
    await fs.ensureDir(config.distDir);
    
    const zipPath = path.join(config.distDir, `${config.pluginSlug}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
        output.on('close', () => resolve(zipPath));
        archive.on('error', reject);
        
        archive.pipe(output);
        archive.directory(config.buildDir, false);
        archive.finalize();
    });
}

/**
 * Copy plugin files to build directory
 * @returns {Promise<void>}
 */
async function copyFiles() {
    console.log('Copying files to build directory...');
    
    // Clean and recreate build directory
    await fs.emptyDir(config.buildDir);
    
    // Get all files and directories in source
    const items = await fs.readdir(config.sourceDir, { withFileTypes: true });
    
    // Copy each item that's not excluded
    for (const item of items) {
        const sourcePath = path.join(config.sourceDir, item.name);
        const destPath = path.join(config.buildDir, item.name);
        
        // Skip if the item should be excluded
        if (shouldExclude(sourcePath)) {
            continue;
        }
        
        try {
            if (item.isDirectory()) {
                // For directories, copy recursively but filter out excluded files
                await fs.copy(sourcePath, destPath, {
                    filter: src => !shouldExclude(src)
                });
            } else {
                // For files, just copy directly
                await fs.copy(sourcePath, destPath);
            }
        } catch (error) {
            console.error(`Error copying ${sourcePath}:`, error);
            throw error;
        }
    }
}

/**
 * Main build function
 * @returns {Promise<string>} Path to the created zip file
 */
async function build() {
    try {
        await copyFiles();
        const zipPath = await createZip();
        console.log(`Build completed successfully! Zip created at: ${zipPath}`);
        return zipPath;
    } catch (error) {
        console.error('Build failed:', error);
        throw error;
    }
}

// Export the build function
module.exports = build;

// Run if called directly
if (require.main === module) {
    build().catch(console.error);
}
