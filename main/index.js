const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { encryptDirectory, decryptDirectory, getChromePath } = require('./vault');

let mainWindow;
const activeProfiles = new Map(); // profileId -> { tempDir, password }

const DATA_DIR = path.join(app.getPath('userData'), 'Vaults');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function loadSettings() {
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'VaultBrowser',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null); // Remove top menu bar

  if (process.env.NODE_ENV === 'development') {
    const url = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let isQuitting = false;

app.on('before-quit', async (event) => {
  if (activeProfiles.size > 0 && !isQuitting) {
    event.preventDefault();
    console.log('App is quitting, encrypting active profiles...');
    
    // Lock all active profiles before quitting
    for (const [profileId, data] of activeProfiles.entries()) {
      const vaultPath = path.join(DATA_DIR, `${profileId}.vault`);
      try {
        console.log(`Locking ${profileId} before quit...`);
        // we await the encryption so the process doesn't exit prematurely
        await encryptDirectory(data.tempDir, vaultPath, data.password);
        fs.rmSync(data.tempDir, { recursive: true, force: true });
        activeProfiles.delete(profileId);
      } catch (err) {
        console.error(`Failed to lock ${profileId} before quit:`, err);
      }
    }
    
    isQuitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-profiles', async () => {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs.readdirSync(DATA_DIR);
  return files
    .filter(f => f.endsWith('.vault'))
    .map(f => f.replace('.vault', ''));
});

ipcMain.handle('get-available-browsers', () => {
  const { getAvailableBrowsers } = require('./vault');
  return getAvailableBrowsers();
});

ipcMain.handle('get-profile-settings', (event, profileName) => {
  const settings = loadSettings();
  return settings[profileName] || {};
});

ipcMain.handle('save-profile-settings', (event, profileName, profileSettings) => {
  const settings = loadSettings();
  settings[profileName] = { ...settings[profileName], ...profileSettings };
  saveSettings(settings);
  return true;
});

ipcMain.handle('create-profile', async (event, name, password) => {
  const vaultPath = path.join(DATA_DIR, `${name}.vault`);
  if (!fs.existsSync(vaultPath)) {
    const tempEmptyDir = path.join(app.getPath('temp'), `empty_${Date.now()}`);
    fs.mkdirSync(tempEmptyDir, { recursive: true });
    await encryptDirectory(tempEmptyDir, vaultPath, password);
    fs.rmSync(tempEmptyDir, { recursive: true, force: true });
  }
  return true;
});

const { dialog } = require('electron');
ipcMain.handle('import-profile', async (event, name, password) => {
  const vaultPath = path.join(DATA_DIR, `${name}.vault`);
  if (fs.existsSync(vaultPath)) return { success: false, error: 'Profile already exists' };

  const defaultChromePath = process.env.LOCALAPPDATA 
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : app.getPath('home');

  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Existing Chrome Profile Folder',
    defaultPath: defaultChromePath,
    properties: ['openDirectory']
  });

  if (canceled || filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const sourceDir = filePaths[0];
  try {
    await encryptDirectory(sourceDir, vaultPath, password, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('progress-update', { type: 'import', percent });
      }
    });
    return { success: true };
  } catch (err) {
    console.error('Import error:', err);
    let errorMessage = err.message;
    if (errorMessage.includes('EBUSY')) {
      errorMessage = 'Files are locked by another process. Please completely close the browser you are trying to import (and check the system tray) before importing.';
    }
    return { success: false, error: errorMessage };
  }
});

ipcMain.handle('launch-profile', async (event, profileId, password) => {
  try {
    const vaultPath = path.join(DATA_DIR, `${profileId}.vault`);
    let tempDir;

    if (activeProfiles.has(profileId)) {
      tempDir = activeProfiles.get(profileId).tempDir;
      // verify tempDir exists just in case
      if (!fs.existsSync(tempDir)) {
        activeProfiles.delete(profileId);
        throw new Error('Temporary directory missing. Please lock and unlock again.');
      }
      // Skip decryption, it's already unpacked
    } else {
      tempDir = path.join(app.getPath('temp'), `vault_decrypted_${profileId}_${Date.now()}`);
      
      // Decrypt (Phase 2)
      await decryptDirectory(vaultPath, tempDir, password, (percent) => {
        if (mainWindow) {
          mainWindow.webContents.send('progress-update', { type: 'decrypt', percent, profileId });
        }
      });
      activeProfiles.set(profileId, { tempDir, password });
    }

    // Force Session Restore (Phase 2.5)
    const defaultDir = path.join(tempDir, 'Default');
    const prefsPath = path.join(defaultDir, 'Preferences');
    if (fs.existsSync(prefsPath)) {
      try {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        if (!prefs.session) prefs.session = {};
        prefs.session.restore_on_startup = 1;
        fs.writeFileSync(prefsPath, JSON.stringify(prefs));
      } catch (err) {
        console.error('Failed to modify Chrome Preferences for session restore:', err);
      }
    }

    // Launch Chrome (Phase 3)
    const settings = loadSettings();
    const preferredPath = settings[profileId]?.browserPath;
    
    const { getChromePath } = require('./vault');
    const chromePath = getChromePath(preferredPath);
    
    if (!chromePath) {
      throw new Error('Supported browser executable not found on the system.');
    }

    const chromeProcess = spawn(chromePath, [`--user-data-dir=${tempDir}`, '--restore-last-session']);

    // Lifecycle & Cleanup (Phase 4)
    chromeProcess.on('close', async () => {
      console.log(`Chrome closed for profile ${profileId}. Keeping unlocked.`);
    });

    return true; // Indicate launch success
  } catch (error) {
    console.error('Launch error:', error);
    return false; // Decryption failed or something else
  }
});

ipcMain.handle('lock-profile', async (event, profileId) => {
  if (!activeProfiles.has(profileId)) return false;

  const { tempDir, password } = activeProfiles.get(profileId);
  const vaultPath = path.join(DATA_DIR, `${profileId}.vault`);

  try {
    await encryptDirectory(tempDir, vaultPath, password, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('progress-update', { type: 'encrypt', percent, profileId });
      }
    });
    console.log(`Re-encryption successful. Wiping temp directory...`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    activeProfiles.delete(profileId);
    return true;
  } catch (err) {
    console.error(`Failed to lock profile ${profileId}:`, err);
    return false;
  }
});

ipcMain.handle('get-active-profiles', () => {
  return Array.from(activeProfiles.keys());
});

ipcMain.handle('check-orphaned-profiles', () => {
  const tempDir = app.getPath('temp');
  if (!fs.existsSync(tempDir)) return [];
  
  const files = fs.readdirSync(tempDir);
  const orphanedMap = new Map();
  
  for (const file of files) {
    if (file.startsWith('vault_decrypted_')) {
      const parts = file.split('_');
      if (parts.length >= 4) {
        const timestamp = parseInt(parts.pop(), 10);
        parts.shift(); // remove vault
        parts.shift(); // remove decrypted
        const profileId = parts.join('_');
        
        const existing = orphanedMap.get(profileId);
        if (!existing || timestamp > existing.timestamp) {
          if (existing) {
            // Delete the older duplicate automatically
            try { fs.rmSync(existing.path, { recursive: true, force: true }); } catch (e) {}
          }
          orphanedMap.set(profileId, {
            folderName: file,
            profileId: profileId,
            path: path.join(tempDir, file),
            timestamp: timestamp
          });
        } else {
          // This one is older than the existing one, delete it
          try { fs.rmSync(path.join(tempDir, file), { recursive: true, force: true }); } catch (e) {}
        }
      }
    }
  }
  return Array.from(orphanedMap.values());
});

ipcMain.handle('resolve-orphaned-profile', async (event, profileId, folderPath, action, password) => {
  if (action === 'delete') {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return { success: true };
  } else if (action === 'recover') {
    const vaultPath = path.join(DATA_DIR, `${profileId}.vault`);
    try {
      await encryptDirectory(folderPath, vaultPath, password, (percent) => {
        if (mainWindow) {
          mainWindow.webContents.send('progress-update', { type: 'encrypt', percent, profileId });
        }
      });
      fs.rmSync(folderPath, { recursive: true, force: true });
      return { success: true };
    } catch (err) {
      console.error('Failed to recover orphaned profile:', err);
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Invalid action' };
});

ipcMain.handle('delete-profile', async (event, name) => {
  const vaultPath = path.join(DATA_DIR, `${name}.vault`);
  if (fs.existsSync(vaultPath)) {
    fs.rmSync(vaultPath, { force: true });
    
    // Also remove from settings
    const settings = loadSettings();
    if (settings[name]) {
      delete settings[name];
      saveSettings(settings);
    }
    
    return true;
  }
  return false;
});

ipcMain.handle('rename-profile', async (event, oldName, newName) => {
  const oldPath = path.join(DATA_DIR, `${oldName}.vault`);
  const newPath = path.join(DATA_DIR, `${newName}.vault`);
  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) return false;
  
  fs.renameSync(oldPath, newPath);
  
  // Also rename in settings
  const settings = loadSettings();
  if (settings[oldName]) {
    settings[newName] = settings[oldName];
    delete settings[oldName];
    saveSettings(settings);
  }
  
  return true;
});

ipcMain.handle('change-password', async (event, name, oldPassword, newPassword) => {
  const vaultPath = path.join(DATA_DIR, `${name}.vault`);
  if (!fs.existsSync(vaultPath)) return false;

  const tempDir = path.join(app.getPath('temp'), `vault_rekey_${name}_${Date.now()}`);
  
  try {
    // 1. Decrypt with old password
    await decryptDirectory(vaultPath, tempDir, oldPassword);
    
    // 2. Re-encrypt with new password (overwrites the vault)
    await encryptDirectory(tempDir, vaultPath, newPassword);
    
    // 3. Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error('Password change error:', err);
    // Cleanup if decrypt failed
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    return false;
  }
});
