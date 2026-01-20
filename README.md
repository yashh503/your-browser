# YarvixWeb Browser

A private, fast, and customizable web browser built with Electron.

## Features

- Tabbed Browsing - Multiple tabs with fast switching
- Theme System - Dark/Light modes with 6 accent color options (Purple, Blue, Cyan, Emerald, Rose, Orange)
- Privacy Focused - Screen capture detection, content protection
- Customizable Homepage - Quick links, search engine selection, clock display
- Bookmarks & History - Save and manage your favorite pages
- Keyboard Shortcuts - Full keyboard navigation support
- Download Manager - Built-in download tracking

---

## Building for macOS (Personal Use - No Code Signing)

This guide explains how to build YarvixWeb for your personal Mac without any certificates, signing, or notarization.

### Prerequisites

1. **Node.js** (v18 or later)
   ```bash
   # Check if installed
   node --version

   # Install via Homebrew if needed
   brew install node
   ```

2. **npm** (comes with Node.js)
   ```bash
   npm --version
   ```

### Step 1: Install Dependencies

```bash
# Navigate to project directory
cd /path/to/your-browser

# Install all dependencies
npm install
```

### Step 2: Build the App

```bash
# Build for macOS (unsigned) - RECOMMENDED
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

This command:
- Sets `CSC_IDENTITY_AUTO_DISCOVERY=false` to prevent automatic certificate lookup
- Builds unsigned DMG and ZIP files for both Intel and Apple Silicon

**Alternative: Build only for your Mac's architecture**

```bash
# Apple Silicon (M1/M2/M3) only
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64

# Intel Mac only
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --x64
```

### Step 3: Find Your Built App

After building, your app will be in the `dist` folder:

```
dist/
├── YarvixWeb-1.0.0-arm64.dmg      # DMG installer (Apple Silicon)
├── YarvixWeb-1.0.0-x64.dmg        # DMG installer (Intel)
├── YarvixWeb-1.0.0-arm64-mac.zip  # ZIP archive (Apple Silicon)
├── YarvixWeb-1.0.0-x64-mac.zip    # ZIP archive (Intel)
└── mac-arm64/                      # Unpacked app folder
    └── YarvixWeb.app
```

### Step 4: Install & Run the App

**Option A: Using the DMG**
1. Open `dist/YarvixWeb-1.0.0-arm64.dmg` (or x64 for Intel Mac)
2. Drag YarvixWeb to Applications
3. First time opening: Right-click the app > "Open" > Click "Open" in the dialog

**Option B: Direct from build folder**
1. Navigate to `dist/mac-arm64/` (or `mac-x64/` for Intel)
2. Double-click `YarvixWeb.app`
3. If blocked: Right-click > "Open" > "Open"

**Option C: Using Terminal**
```bash
# Open directly from dist folder
open dist/mac-arm64/YarvixWeb.app

# Or if moved to Applications
open /Applications/YarvixWeb.app
```

---

## Handling "App is damaged" or Gatekeeper Warnings

Since the app is unsigned, macOS may show security warnings. Here's how to handle them:

### Method 1: Right-Click Open (Recommended)
1. Right-click (or Control+click) on `YarvixWeb.app`
2. Select "Open" from the context menu
3. Click "Open" in the dialog that appears

### Method 2: System Settings
1. Go to **System Settings** > **Privacy & Security**
2. Scroll down to find the blocked app message
3. Click "Open Anyway"

### Method 3: Remove Quarantine Flag (Terminal)
```bash
# Remove quarantine attribute from the app
xattr -cr /Applications/YarvixWeb.app

# Or if running from dist folder
xattr -cr dist/mac-arm64/YarvixWeb.app
```

### Method 4: Disable Gatekeeper Temporarily (Not Recommended)
```bash
# Disable Gatekeeper (requires admin password)
sudo spctl --master-disable

# After installing, re-enable it
sudo spctl --master-enable
```

---

## Quick Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run build:mac` | Build for macOS (all architectures) |
| `npm run pack` | Build unpacked directory (fastest, for testing) |
| `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac` | Build without certificate lookup |

**Single architecture builds:**
```bash
# Apple Silicon only
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64

# Intel only
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --x64

# Unpacked app only (fastest for testing)
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
```

---

## Development

### Run in Development Mode
```bash
npm start
```

### Project Structure
```
your-browser/
├── main.js           # Electron main process
├── renderer.js       # Browser UI logic
├── index.html        # Main browser window
├── homepage.html     # New tab page
├── style.css         # Browser styles
├── package.json      # Project config
├── build/            # Build resources (icons)
└── dist/             # Built applications
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+T` | New Tab |
| `Cmd+W` | Close Tab |
| `Cmd+Shift+T` | Reopen Closed Tab |
| `Cmd+L` | Focus URL Bar |
| `Cmd+R` | Refresh Page |
| `Cmd+D` | Bookmark Page |
| `Cmd+F` | Find in Page |
| `Cmd+Tab` | Next Tab |
| `Cmd+Shift+Tab` | Previous Tab |
| `Cmd+1-9` | Switch to Tab 1-9 |
| `Cmd+N` | New Window |

---

## Troubleshooting

### Build Fails with Signing Errors
Make sure to use the environment variable:
```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

### "Cannot be opened because the developer cannot be verified"
Use the terminal command:
```bash
xattr -cr /path/to/YarvixWeb.app
```

### App Crashes on Launch
1. Delete the app's data folder:
   ```bash
   rm -rf ~/Library/Application\ Support/YarvixWeb
   ```
2. Rebuild the app
3. Try again

### Icons Not Showing
Make sure you have icon files in the `build` folder:
- `build/icon.icns` (macOS)
- `build/icon.png` (source, 1024x1024)

Generate icons from PNG:
```bash
npm run generate-icons
```

---

## Important Notes

- This build is for **personal use only** on your own Mac
- The app is **not signed** and **not notarized** - it won't pass Gatekeeper checks automatically
- Do **not distribute** unsigned apps to others
- For distribution, you need an Apple Developer account ($99/year) for proper signing

---

## License

Private project by Yash Vyas.
