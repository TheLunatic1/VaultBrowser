const { createServer } = require('vite');
const { spawn } = require('child_process');

async function startDev() {
  try {
    // Start Vite server
    const server = await createServer({
      configFile: 'vite.config.mjs'
    });
    
    await server.listen();
    
    // Vite automatically increments the port if it's in use
    const port = server.config.server.port;
    const serverUrl = `http://localhost:${port}`;
    console.log(`\n🚀 Vite server running dynamically on: ${serverUrl}\n`);
    
    // Spawn Electron
    const electronProcess = spawn('npx', ['electron', '.'], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: serverUrl
      },
      stdio: 'inherit',
      shell: true
    });

    electronProcess.on('close', () => {
      server.close();
      process.exit();
    });

  } catch (err) {
    console.error('Failed to start dev server:', err);
    process.exit(1);
  }
}

startDev();
