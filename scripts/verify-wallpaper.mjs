import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const url = process.argv[2] || process.env.VERIFY_URL || 'http://127.0.0.1:5057/index.html';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const debugPort = Number(process.env.CHROME_DEBUG_PORT || 9223);
const windowSize = process.env.CHROME_WINDOW_SIZE || '1280,720';
const artifactPrefix = process.env.VERIFY_ARTIFACT_PREFIX || 'pond-patrol-wallpaper';
const windowSlug = windowSize.replace(/[^0-9]+/g, 'x').replace(/^x|x$/g, '');
const userDataDir = path.join(root, '.tmp-chrome-wallpaper');
const artifactsDir = path.join(root, 'artifacts');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(endpoint) {
  const response = await fetch(`http://127.0.0.1:${debugPort}${endpoint}`);
  if (!response.ok) {
    throw new Error(`CDP HTTP ${response.status} for ${endpoint}`);
  }
  return response.json();
}

async function waitForPage() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    try {
      const pages = await fetchJson('/json/list');
      const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {}

    await wait(100);
  }

  throw new Error('Chrome did not expose a debuggable page in time.');
}

function createCdpClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  socket.on('message', data => {
    const message = JSON.parse(data.toString());
    if (!message.id || !pending.has(message.id)) return;

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);

    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  return {
    command(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    ready() {
      return new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.command('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text);
  }

  return result.result.value;
}

async function waitForState(client, predicate, label) {
  const startedAt = Date.now();
  let lastState = null;

  while (Date.now() - startedAt < 10000) {
    lastState = await evaluate(client, `(() => {
      const canvas = document.querySelector('#canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : null;
      const wallpaper = window.pondPatrolWallpaper || window.duckHuntWallpaper;
      return {
        audioCount: document.querySelectorAll('audio').length,
        bodyDataset: { ...document.body.dataset },
        canvasRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        gameState: wallpaper && wallpaper.game ? wallpaper.game.gamestate : null,
        imageCount: document.querySelectorAll('img').length,
        loadingVisible: document.querySelector('.loading')?.classList.contains('visible') || false,
        ready: Boolean(wallpaper),
      };
    })()`);

    if (predicate(lastState)) {
      return lastState;
    }

    await wait(100);
  }

  throw new Error(`Timed out waiting for ${label}. Last state: ${JSON.stringify(lastState)}`);
}

async function saveScreenshot(client, fileName) {
  const screenshot = await client.command('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  const filePath = path.join(artifactsDir, fileName);
  await writeFile(filePath, Buffer.from(screenshot.data, 'base64'));
  return filePath;
}

function wallpaperExpression(expression) {
  return `(() => {
    const wallpaper = window.pondPatrolWallpaper || window.duckHuntWallpaper;
    ${expression}
  })()`;
}

await mkdir(artifactsDir, { recursive: true });
await rm(userDataDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-networking',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  `--window-size=${windowSize}`,
  url,
], {
  stdio: 'ignore',
});

let client;

try {
  const page = await waitForPage();
  client = createCdpClient(page.webSocketDebuggerUrl);
  await client.ready();
  await client.command('Page.enable');
  await client.command('Runtime.enable');

  const menuState = await waitForState(client, state => state.ready && !state.loadingVisible, 'ready menu');
  await wait(700);
  const menuScreenshot = await saveScreenshot(client, `${artifactPrefix}-${windowSlug}-menu.png`);

  const clickX = menuState.canvasRect.x + menuState.canvasRect.width * (384 / 768);
  const clickY = menuState.canvasRect.y + menuState.canvasRect.height * (460 / 720);
  await evaluate(client, `(() => {
    window.__verifyClicks = [];
    const canvas = document.querySelector('#canvas');
    canvas.addEventListener('mousedown', event => {
      window.__verifyClicks.push({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        mouseX: (window.pondPatrolWallpaper || window.duckHuntWallpaper).game.input.mouseX,
        mouseY: (window.pondPatrolWallpaper || window.duckHuntWallpaper).game.input.mouseY
      });
    }, true);
  })()`);
  await client.command('Page.bringToFront');
  await client.command('Input.dispatchMouseEvent', {
    button: 'none',
    pointerType: 'mouse',
    type: 'mouseMoved',
    x: clickX,
    y: clickY,
  });
  await wait(50);
  await client.command('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mousePressed',
    x: clickX,
    y: clickY,
  });
  await wait(50);
  await client.command('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'mouse',
    type: 'mouseReleased',
    x: clickX,
    y: clickY,
  });

  await wait(300);
  let clickDebug = await evaluate(client, wallpaperExpression(`return {
    clicks: window.__verifyClicks || [],
    gameState: wallpaper.game.gamestate
  };`));

  if (clickDebug.gameState !== 1) {
    await evaluate(client, `(() => {
      const canvas = document.querySelector('#canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: rect.x + rect.width * (384 / 768),
        clientY: rect.y + rect.height * (460 / 720)
      }));
    })()`);
    await wait(300);
    clickDebug = await evaluate(client, wallpaperExpression(`return {
      clicks: window.__verifyClicks || [],
      gameState: wallpaper.game.gamestate,
      usedSyntheticFallback: true
    };`));
  }

  const runningState = await waitForState(client, state => state.gameState === 1, 'running game state');
  const gameScreenshot = await saveScreenshot(client, `${artifactPrefix}-${windowSlug}-game.png`);

  const propertyState = await evaluate(client, wallpaperExpression(`
    window.wallpaperPropertyListener.applyUserProperties({
      duckspeed: { value: 1.5 },
      fitmode: { value: 'cover' },
      showcontrols: { value: false },
      showcursor: { value: false },
      showhud: { value: false },
      volume: { value: 30 }
    });
    return {
      bodyDataset: { ...document.body.dataset },
      controlsHidden: document.querySelector('.volume')?.classList.contains('hidden') || false,
      settings: {
        duckSpeedMultiplier: wallpaper.settings.duckSpeedMultiplier,
        showControls: wallpaper.settings.showControls,
        showCursor: wallpaper.settings.showCursor,
        showHud: wallpaper.settings.showHud,
        volume: wallpaper.settings.volume
      }
    };
  `));

  console.log(JSON.stringify({
    gameScreenshot,
    clickDebug,
    menuScreenshot,
    menuState,
    propertyState,
    runningState,
    url,
    windowSize,
  }, null, 2));
} finally {
  if (client) client.close();
  chrome.kill();
}
