import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => {
  try {
    return process.getBuiltinModule('fs').existsSync(candidate);
  } catch {
    return false;
  }
});

if (!chromePath) throw new Error('Chrome was not found. Set CHROME_PATH to run the browser smoke gate.');

async function run() {
  const appPort = await freePort();
  const debugPort = await freePort();
  const profile = await mkdtemp(path.join(os.tmpdir(), 'stillness-chrome-'));
  const server = spawn('pnpm', ['start'], {
    env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });

  try {
    const origin = `http://127.0.0.1:${appPort}`;
    await waitForHttp(origin);
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
    const target = await fetch(
      `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`,
      { method: 'PUT' },
    ).then((response) => response.json());
    const cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    const browserErrors = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      browserErrors.push(params.exceptionDetails?.text ?? 'Uncaught browser exception');
    });
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error') browserErrors.push(entry.text);
    });
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Log.enable');
    await cdp.call('Network.enable');

    await navigate(cdp, origin);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    await begin(cdp);
    assert(await evaluate(cdp, `Boolean(
      document.querySelector('canvas.light-field')?.width > 0 &&
      document.querySelector('canvas.light-field')?.height > 0
    )`), 'WebGL canvas did not render');
    await evaluate(cdp, `document.querySelector('button.exit-session').click()`);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);

    await cdp.call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await navigate(cdp, origin);
    assert(
      await evaluate(cdp, `matchMedia('(prefers-reduced-motion: reduce)').matches`),
      'Reduced-motion preference was not applied',
    );
    await begin(cdp);
    await evaluate(cdp, `document.querySelector('button.exit-session').click()`);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);

    await evaluate(cdp, `navigator.serviceWorker.ready.then(() => new Promise((resolve) => {
      setTimeout(resolve, 750);
    }))`);
    await cdp.call('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await navigate(cdp, origin);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    await begin(cdp);

    assert(browserErrors.length === 0, `Browser errors:\n${browserErrors.join('\n')}`);
    await cdp.close();
    process.stdout.write('Stillness browser smoke passed: WebGL, reduced motion, and offline hydration.\n');
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n${serverLog}\n`);
    process.exitCode = 1;
  } finally {
    chrome.kill('SIGTERM');
    server.kill('SIGTERM');
    await Promise.allSettled([waitForExit(chrome), waitForExit(server)]);
    await rm(profile, { recursive: true, force: true });
  }
}

class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new Cdp(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  waitForEvent(method, timeout = 10_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      const listener = (params) => {
        clearTimeout(timer);
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
        resolve(params);
      };
      this.on(method, listener);
    });
  }

  async close() {
    this.socket.close();
  }
}

async function navigate(cdp, url) {
  const loaded = cdp.waitForEvent('Page.loadEventFired');
  const result = await cdp.call('Page.navigate', { url });
  if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
  await loaded;
}

async function evaluate(cdp, expression) {
  const response = await cdp.call('Runtime.evaluate', {
    expression: `(() => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}

async function waitFor(cdp, expression, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function begin(cdp, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const mode = await evaluate(cdp, `document.querySelector('.experience')?.dataset.mode`);
    if (mode === 'active') return;
    if (mode === 'error') {
      const message = await evaluate(cdp, `document.querySelector('.system-message')?.textContent`);
      throw new Error(`Stillness entered error mode: ${message ?? 'No browser message'}`);
    }
    if (mode === 'ready') {
      await evaluate(cdp, `document.querySelector('button.primary')?.click()`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Stillness to begin');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHttp(url, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2_000);
  });
}

await run();
