#Better Category Manager Lite Build Scripts

This directory contains the build and deployment scripts for theBetter Category Manager Lite WordPress plugin. These scripts handle version management, building, and releasing to both GitHub and WordPress.org SVN repository.

## Prerequisites

Before using these scripts, ensure you have:

1. Node.js installed (v14 or higher recommended)
2. Git installed and configured
3. SVN client installed
4. A `.env` file in the scripts directory with the following variables:
   ```
   GITHUB_TOKEN=your_github_token
   GITHUB_OWNER=gbti-network
   GITHUB_REPO=better-category-manager
   ```

## Available Scripts

### build.js
The main build script that orchestrates the entire build and release process.

**Usage:**
```bash
node build.js
```

**Features:**
- Generates build files
- Updates version numbers
- Handles version rollback on failure
- Provides six options:
  1. Generate Build Files Only
  2. Build and Commit to GitHub
  3. Build and Make New Release to GitHub
  4. Build and Make New Release to SVN
  5. Build and Make New Release to GitHub & SVN
  6. Test All Systems (Dry Run)

**Version Types:**
- Major (x.0.0) - Breaking changes
- Minor (0.x.0) - New features
- Patch (0.0.x) - Bug fixes

### release.js
Handles GitHub-specific operations including branch management and releases.

**Features:**
- Manages git branches (develop/master workflow)
- Creates GitHub releases
- Uploads release assets
- Handles branch synchronization

**Branch Workflow:**
1. Commits and pushes to develop
2. Switches to master
3. Merges develop into master
4. Creates release from master
5. Returns to develop

### release-svn.js
Manages WordPress.org SVN repository operations.

**Features:**
- Prepares SVN directory structure (trunk/assets/tags)
- Copies build files to appropriate directories
- Handles WordPress.org assets
- Creates SVN tags for releases
- Commits changes to WordPress.org

**Directory Structure:**
```
svn/
├── trunk/      # Latest version of the plugin
├── assets/     # WordPress.org assets (banner, icon, screenshots)
└── tags/       # Tagged releases
```

### deploy.js
Handles the actual build process and file preparation.

**Features:**
- Cleans build directory
- Copies necessary files
- Excludes development files
- Creates distribution ZIP file

## Common Workflows

### Regular Development
1. Make changes in develop branch
2. Test changes locally
3. Commit and push to develop

### Making a Release
1. Run `node build.js`
2. Choose release type:
   - "Build and Make New Release to GitHub" for GitHub only
   - "Build and Make New Release to SVN" for WordPress.org only
   - "Build and Make New Release to GitHub & SVN" for both platforms
3. Select version type (major/minor/patch)
4. Confirm version update
5. Wait for completion

### Combined GitHub & WordPress.org Release
1. Run `node build.js`
2. Choose "Build and Make New Release to GitHub & SVN"
3. Select version type
4. Confirm version update
5. Script will:
   - Create GitHub release first
   - If successful, proceed with SVN release
   - Roll back changes if either step fails

## Testing the System
1. Run `node build.js`
2. Choose "Test All Systems (Dry Run)"
3. The script will test:
   - GitHub Configuration:
     - Token validity
     - Repository access
     - Branch operations
     - Release creation permissions
   - SVN Configuration:
     - Credentials validation
     - Directory structure
     - Tag creation permissions
4. No actual commits or releases will be made
5. Detailed test results will be displayed

This test mode is useful for:
- Verifying credentials before actual releases
- Checking system permissions
- Validating repository access
- Ensuring SVN structure is correct

## Error Handling

The scripts include comprehensive error handling:

- Version number rollback if release fails
- Automatic branch restoration on failure
- File backups before modifications
- Detailed error logging

## Directory Structure

```
scripts/
├── .env                # Environment variables
├── build.js           # Main build script
├── release.js         # GitHub release management
├── release-svn.js     # WordPress.org SVN management
├── deploy.js          # Build process
└── readme.md          # This documentation
```

## Best Practices

1. Always work in the develop branch
2. Test builds locally before releasing
3. Keep environment variables secure
4. Review changes before confirming version updates
5. Maintain proper version numbering (semver)
6. Keep WordPress.org assets updated
7. Use combined release option for consistency across platforms

## Troubleshooting

### Version Rollback
If a release fails, the scripts will automatically:
1. Restore original version numbers
2. Return to the develop branch
3. Log the error details

### Manual Recovery
If automatic rollback fails:
1. Use git reflog to find the last good state
2. Reset to that state: `git reset --hard HEAD@{n}`
3. Force push if necessary (with caution)

## Support

For issues or questions:
1. Check the error logs
2. Review the WordPress.org SVN status
3. Check GitHub release status
4. Contact plugin maintainers