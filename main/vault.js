const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const { spawn } = require('child_process');
const { Transform } = require('stream');

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          size += getDirSize(fullPath);
        } else {
          size += stats.size;
        }
      } catch (e) {
        // Ignore single file access denied errors
      }
    }
  } catch (e) {
    // Ignore directory access denied errors
  }
  return size;
}

// Utility to derive key from password
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

// Encrypt a directory into a .vault file
async function encryptDirectory(sourceDir, destVaultFile, password, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);
      const key = deriveKey(password, salt);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      let totalSize = getDirSize(sourceDir);
      console.log(`[Vault] encryptDirectory started. Source: ${sourceDir}, Total size: ${totalSize}`);
      let processedSize = 0;
      let lastReportedPercent = -1;

      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          processedSize += chunk.length;
          if (onProgress && totalSize > 0) {
            // tar compression might make output smaller or slightly larger, but input size is a good proxy
            const percent = Math.min(100, Math.round((processedSize / totalSize) * 100));
            if (percent !== lastReportedPercent) {
              lastReportedPercent = percent;
              console.log(`[Vault] Progress: ${percent}% (${processedSize}/${totalSize} bytes)`);
              onProgress(percent);
            }
          } else if (totalSize === 0 && processedSize > 0) {
             // Fallback if totalSize is 0 but we are processing data
             if (lastReportedPercent !== 50) {
               lastReportedPercent = 50;
               console.log(`[Vault] Progress fallback: 50%`);
               onProgress(50);
             }
          }
          callback(null, chunk);
        }
      });

      // Create a tar stream of the source directory (no gzip to keep output size ~ input size for accurate progress and faster speeds)
      const tarStream = tar.c({ cwd: sourceDir }, ['.']);
      
      const outStream = fs.createWriteStream(destVaultFile);
      
      // Write salt and iv to the beginning of the file
      outStream.write(salt);
      outStream.write(iv);

      const { pipeline } = require('stream');
      let isFinished = false;
      pipeline(
        tarStream,
        progressStream,
        cipher,
        outStream,
        (err) => {
          if (isFinished) return;
          isFinished = true;
          if (err) {
            console.error(`[Vault] Pipeline error:`, err);
            if (fs.existsSync(destVaultFile)) {
              try { fs.rmSync(destVaultFile, { force: true }); } catch(e){}
            }
            reject(err);
          } else {
            try {
              const authTag = cipher.getAuthTag();
              fs.appendFileSync(destVaultFile, authTag);
              resolve(true);
            } catch (e) {
              reject(e);
            }
          }
        }
      );
    } catch (err) {
      if (fs.existsSync(destVaultFile)) {
        try { fs.rmSync(destVaultFile, { force: true }); } catch(e){}
      }
      reject(err);
    }
  });
}

// Decrypt a .vault file back into a directory
async function decryptDirectory(sourceVaultFile, destDir, password, onProgress) {
  return new Promise((resolve, reject) => {
    try {
      const fd = fs.openSync(sourceVaultFile, 'r');
      
      const salt = Buffer.alloc(SALT_LENGTH);
      fs.readSync(fd, salt, 0, SALT_LENGTH, 0);
      
      const iv = Buffer.alloc(IV_LENGTH);
      fs.readSync(fd, iv, 0, IV_LENGTH, SALT_LENGTH);

      const authTag = Buffer.alloc(16);
      const fileSize = fs.statSync(sourceVaultFile).size;
      fs.readSync(fd, authTag, 0, 16, fileSize - 16);

      const key = deriveKey(password, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const inStream = fs.createReadStream(sourceVaultFile, {
        start: SALT_LENGTH + IV_LENGTH,
        end: fileSize - 16 - 1
      });

      let processedSize = 0;
      let lastReportedPercent = -1;
      const totalSize = fileSize;

      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          processedSize += chunk.length;
          if (onProgress && totalSize > 0) {
            const percent = Math.min(100, Math.round((processedSize / totalSize) * 100));
            if (percent !== lastReportedPercent) {
              lastReportedPercent = percent;
              onProgress(percent);
            }
          }
          callback(null, chunk);
        }
      });

      // Extract tar stream to destination directory
      fs.mkdirSync(destDir, { recursive: true });
      const tarStream = tar.x({ cwd: destDir });

      const { pipeline } = require('stream');
      let isFinished = false;
      pipeline(
        inStream,
        progressStream,
        decipher,
        tarStream,
        (err) => {
          if (isFinished) return;
          isFinished = true;
          try { fs.closeSync(fd); } catch(e){}
          if (err) {
            reject(new Error('Incorrect password or corrupted vault.'));
          } else {
            resolve(true);
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

const BROWSER_PATHS = [
  { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Google Chrome (x86)', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  { name: 'Brave', path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
  { name: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
];

function getChromePath(preferredPath) {
  // If user selected a specific path and it exists, use it
  if (preferredPath && fs.existsSync(preferredPath)) {
    return preferredPath;
  }
  
  // Also check dynamic paths like Canary which depend on LOCALAPPDATA
  const dynamicPaths = process.env.LOCALAPPDATA ? [
    { name: 'Chrome Canary', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome SxS', 'Application', 'chrome.exe') },
    { name: 'Chromium', path: path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe') }
  ] : [];

  const allPaths = [...BROWSER_PATHS, ...dynamicPaths];

  // Fallback to auto-detection (first available)
  for (const browser of allPaths) {
    if (fs.existsSync(browser.path)) return browser.path;
  }
  return null; // fallback or error handled in main
}

function getAvailableBrowsers() {
  const dynamicPaths = process.env.LOCALAPPDATA ? [
    { name: 'Chrome Canary', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome SxS', 'Application', 'chrome.exe') },
    { name: 'Chromium', path: path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe') }
  ] : [];

  const allPaths = [...BROWSER_PATHS, ...dynamicPaths];
  return allPaths.filter(browser => fs.existsSync(browser.path));
}

module.exports = {
  encryptDirectory,
  decryptDirectory,
  getChromePath,
  getAvailableBrowsers
};
