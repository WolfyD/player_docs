# PlayerDocs

**Version 1.2.0**

A powerful desktop application for managing D&D worlds and campaigns, built with Electron, React, and TypeScript.

 - Full disclosure, AI was used in the creation of the app and the writing of this readme. What can I say... I'm lazy at times.

## What is PlayerDocs?

PlayerDocs is a comprehensive note taking tool designed specifically for tabletop roleplaying game (TTRPG) enthusiasts. While built with TTRPGs in mind, it's versatile enough to document and organize any complex interconnected information.

The application provides a hierarchical, linkable documentation system that allows you to create rich, interconnected worlds with characters, locations, lore, and more. Everything is connected through an intuitive linking system that makes it easy to navigate between related concepts and maintain consistency across your campaign materials.

## Key Features

### Core Functionality

**Hierarchical Organization**
- Create nested objects (places, people, lore, etc.) in a tree structure
- Navigate easily between parent and child objects
- Organize your world logically with unlimited depth

**Smart Linking System**
- Link any text to other objects in your world
- Support for multiple objects linked to the same word
- Visual indicators for linked content with hover previews
- Right click any word to create or edit links

**Rich Text Editing**
- ContentEditable editor with full formatting support
- Tab support for structured content
- Auto save functionality
- Lock/unlock objects to prevent accidental edits

**Image Management**
- Add images to any object with drag and drop or file selection
- Support for both local files and URLs
- Automatic thumbnail generation
- Set default images for objects
- Full screen image viewing

### Advanced Features

**Command Palette**
- Quick search and navigation (Ctrl+K)
- Command execution system
- Fuzzy search for objects and tags
- Keyboard shortcuts for all major functions

**Export Capabilities**
- Export to HTML with custom styling
- Export to PDF with professional formatting
- Export to Share format for collaboration
- Backup and restore functionality

**Customization**
- Multiple color themes (Dracula, Solarized, GitHub, Night Owl, Monokai, Parchment, and more)
- Custom color palette support
- Font family, size, weight, and color customization
- Custom font file support
- Configurable keyboard shortcuts
- Adjustable hover card debounce timing

**Navigation & Shortcuts**
- Quick object creation and navigation
- Simple and easy system to link and traverse objects
- Context menus for all major actions

**Data Management**
- SQLite database for reliable data storage
- Automatic cleanup of missing images and broken links
- Comprehensive backup system
- Settings persistence across sessions

## Setup and Building

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/player_docs.git
cd player_docs/game_docs
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

### Building for Production

To build the application for distribution:

```bash
npm run build
```

This will:
- Compile TypeScript
- Build the React frontend
- Package the Electron application
- Create an installer for Windows

The built application will be available in the `dist` folder, and the installer will be created in the project root.

### Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview the built application
- `npm test` - Run test suite
- `npm run rebuild:native` - Rebuild native dependencies

### Project Structure

```
game_docs/
├── src/                    # React frontend source
│   ├── components/         # React components
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── electron/              # Electron main process
│   ├── main/              # Main process code
│   └── preload/           # Preload scripts
├── db/                    # Database schema
└── build/                 # Build assets and icons
```

## Contributing and Support

I welcome contributions, bug reports, and feature requests! PlayerDocs is an ongoing project that benefits greatly from community input.

### How to Contribute

**Bug Reports**
- Please include steps to reproduce the issue
- Specify your operating system and application version
- Include any error messages or console output

I welcome any form of input. Please send feature requests and bug reports to the email below or do it here on GitHub. 

Thanks!




### Contact

- **GitHub Issues**: Use the Issues tab for bug reports and feature requests
- **Email**: bugreports.wolfpaw@gmail.com for direct communication
- **Discussions**: Use GitHub Discussions for general questions and community chat



## License

This project is licensed under the MIT License. See the LICENSE file for details.