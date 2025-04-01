# Advanced Category Manager

A powerful WordPress plugin for advanced category management with AI-powered features and comprehensive logging capabilities.

## Features

- Advanced category management interface
- Bulk term editing and organization
- Import/Export functionality
- Debug logging system with dashboard widget
- GitHub integration for updates
- OpenAI integration for smart term suggestions

## Installation

1. Download the latest release zip file
2. Upload to your WordPress site through the plugins page
3. Activate the plugin
4. Configure through the WordPress admin panel

## Development

### Requirements

- PHP 7.4+
- WordPress 5.8+
- Node.js 14+ (for build tools)
- npm 6+ (for package management)

### Environment Setup

1. Clone the repository
```bash
git clone git@github.com:gbti-network/better-category-manager.git
```

2. Copy environment files
```bash
cd better-category-manager
cp scripts/.env.example scripts/.env
```

3. Configure environment variables in `scripts/.env`:
```
GITHUB_TOKEN=your_github_token
GITHUB_OWNER=your_github_username
```

4. Install dependencies
```bash
npm install
cd scripts && npm install
```

### Development Workflow

1. Create a feature branch from `develop`
```bash
git checkout -b feature/your-feature-name develop
```

2. Make your changes and commit them using our commit script:
```bash
npm run commit
```
This will prompt you for a commit message and handle the git workflow automatically.

3. Create a pull request to `develop` branch

### Available Scripts

From the root directory:

- `npm run build` - Build assets for production
- `npm run commit` - Interactive commit to develop branch
- `npm run release` - Create a new release (prompts for version type)
- `npm run translate` - Update translations

### Release Process

1. Ensure you're on the `develop` branch
2. Run the release script:
```bash
npm run release
```
3. Choose version increment type (patch, minor, or major)
4. The script will:
   - Update version numbers
   - Build assets
   - Create a git tag
   - Push to GitHub
   - Create a GitHub release

### Logging System

The plugin includes a comprehensive logging system with:
- Dashboard widget for quick log viewing
- Full-page log viewer with filtering
- Log level support (debug, info, warning, error)
- Dark mode support
- Real-time log updates via AJAX

## License

GPL-2.0-or-later