const fs = require('fs');
const path = require('path');
const https = require('https');
const child_process = require('child_process');

const version = require('./node_modules/electron/package.json').version;
const zipUrl = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`;
const zipPath = path.join(__dirname, 'electron.zip');
const distPath = path.join(__dirname, 'node_modules/electron/dist');

console.log(`Downloading ${zipUrl}...`);

const file = fs.createWriteStream(zipPath);
https.get(zipUrl, (response) => {
  if (response.statusCode === 302) {
    https.get(response.headers.location, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log('Download complete. Extracting...');
          if (!fs.existsSync(distPath)) {
             fs.mkdirSync(distPath, { recursive: true });
          }
          // Use powershell to extract
          const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${distPath}" -Force`;
          child_process.execSync(`powershell -Command "${psCommand}"`, { stdio: 'inherit' });
          console.log('Extraction complete.');
          fs.writeFileSync(path.join(__dirname, 'node_modules/electron/path.txt'), 'electron.exe');
          console.log('path.txt written.');
          fs.unlinkSync(zipPath);
        });
      });
    });
  }
}).on('error', (err) => {
  console.error('Error downloading:', err);
});
