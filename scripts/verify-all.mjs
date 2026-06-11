import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const nodeCommand = process.execPath;
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? nodeCommand : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmPrefixArgs = npmExecPath ? [npmExecPath] : [];
const npmNeedsShell = !npmExecPath && process.platform === 'win32';
const startPort = Number(process.env.WALLPAPER_VERIFY_PORT || 5057);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      shell: options.shell || false,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

function canUsePort(port) {
  return new Promise(resolve => {
    const server = createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(firstPort) {
  for (let port = firstPort; port < firstPort + 100; port++) {
    if (await canUsePort(port)) return port;
  }

  throw new Error(`Could not find a free local port starting at ${firstPort}`);
}

async function waitForServer(url) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {}

    await wait(150);
  }

  throw new Error(`Preview server did not become ready at ${url}`);
}

function startServer(port) {
  return spawn(nodeCommand, ['scripts/serve-wallpaper.mjs', 'build', String(port)], {
    shell: false,
    stdio: 'inherit',
  });
}

let server = null;

try {
  const port = await findFreePort(startPort);
  const url = `http://127.0.0.1:${port}/index.html`;

  await run(npmCommand, [...npmPrefixArgs, 'run', 'build'], { shell: npmNeedsShell });
  await run(npmCommand, [...npmPrefixArgs, 'run', 'verify:bundle'], { shell: npmNeedsShell });

  server = startServer(port);
  await waitForServer(url);

  await run(npmCommand, [...npmPrefixArgs, 'run', 'verify:wallpaper:matrix'], {
    env: {
      VERIFY_URL: url,
    },
    shell: npmNeedsShell,
  });
} finally {
  if (server) {
    server.kill();
  }
}
