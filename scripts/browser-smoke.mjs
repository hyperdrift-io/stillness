import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const screenshotDirectory = '/tmp/stillness-guided-qa';
const desktopViewport = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
const mobileViewport = { width: 320, height: 700, deviceScaleFactor: 1, mobile: true };

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
    await rm(screenshotDirectory, { recursive: true, force: true });
    await mkdir(screenshotDirectory, { recursive: true });
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
    cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
      if (type !== 'error' && type !== 'assert') return;
      browserErrors.push(args.map((argument) => argument.value ?? argument.description).join(' '));
    });
    await cdp.call('Page.enable');
    await cdp.call('Runtime.enable');
    await cdp.call('Log.enable');
    await cdp.call('Network.enable');
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const audit = { streams: [], webglContextLost: 0 };
        Object.defineProperty(window, '__stillnessQa', { value: audit });
        window.addEventListener('webglcontextlost', () => { audit.webglContextLost += 1; }, true);
        const mediaDevices = navigator.mediaDevices;
        const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);
        if (getUserMedia) {
          mediaDevices.getUserMedia = async (...args) => {
            if (new URLSearchParams(location.search).has('deny-camera')) {
              throw new DOMException('Camera permission denied for QA', 'NotAllowedError');
            }
            const stream = await getUserMedia(...args);
            audit.streams.push(stream);
            return stream;
          };
        }
      })();`,
    });

    await setViewport(cdp, desktopViewport);

    await navigate(cdp, origin);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    assert(
      await evaluate(cdp, `document.querySelector('.mode-choice input')?.checked === true`),
      'Guided mode was not checked by default',
    );
    assert(
      await evaluate(cdp, `(() => {
        const text = document.querySelector('.entry-copy')?.innerText ?? '';
        return text.includes('Camera and motion sensing')
          && text.includes('Soothing sound begins')
          && text.includes('Press ? anytime')
          && text.includes('Pure session');
      })()`),
      'Landing copy did not explain sensing, sound, the ? menu, and Pure mode',
    );
    await screenshot(cdp, 'desktop-landing.png');

    await begin(cdp);
    await assertHealthyCanvas(cdp);
    await waitForGuidance(cdp);
    await waitForVisualSettle(cdp);
    await screenshot(cdp, 'desktop-guided.png');

    await pressKey(cdp, '?');
    await waitFor(cdp, `document.querySelector('dialog.session-menu')?.open === true`);
    assert(
      await evaluate(cdp, `(() => {
        const dialog = document.querySelector('dialog.session-menu');
        const titleId = dialog?.getAttribute('aria-labelledby');
        return titleId === 'session-menu-title'
          && document.getElementById(titleId)?.textContent === 'Session options';
      })()`),
      'The ? shortcut did not open a labelled Session options dialog',
    );
    assert(
      await evaluate(cdp, `document.querySelector('dialog.session-menu')?.contains(document.activeElement)`),
      'Focus did not enter the session dialog',
    );
    assert(
      await evaluate(cdp, `(() => {
        const guidance = document.querySelector('.session-guidance')?.getBoundingClientRect();
        const menu = document.querySelector('dialog.session-menu')?.getBoundingClientRect();
        return guidance && menu && (
          guidance.right <= menu.left || guidance.left >= menu.right
          || guidance.bottom <= menu.top || guidance.top >= menu.bottom
        );
      })()`),
      'The desktop guidance prompt collided with the session menu',
    );
    await screenshot(cdp, 'desktop-guided-menu.png');

    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('dialog.session-menu')?.open === false`);
    assert(
      await evaluate(cdp, `document.activeElement === document.querySelector('button.session-menu-trigger')`),
      'Escape did not restore focus to the session menu trigger',
    );

    await pressKey(cdp, 'd');
    await waitFor(cdp, `document.querySelector('dialog.session-menu')?.open === true`);
    await waitFor(cdp, `document.querySelectorAll('dialog.session-menu meter').length === 4`);
    assert(
      await evaluate(cdp, `(() => {
        const names = Array.from(document.querySelectorAll('dialog.session-menu section > p > span:first-child'))
          .map((node) => node.textContent);
        return JSON.stringify(names) === JSON.stringify(['Movement', 'Steadiness', 'Presence', 'Sensing']);
      })()`),
      'D did not reveal all four named live-signal metrics',
    );
    await screenshot(cdp, 'menu-metrics.png');

    for (const [key, label] of [['m', 'Soothing sound'], ['g', 'Guidance'], ['c', 'Camera sensing']]) {
      const before = await switchChecked(cdp, label);
      assert(typeof before === 'boolean', `${label} switch was missing from the session menu`);
      await pressKey(cdp, key);
      await waitFor(cdp, `(() => {
        const label = Array.from(document.querySelectorAll('dialog.session-menu label'))
          .find((item) => item.innerText.includes(${JSON.stringify(label)}));
        return label?.querySelector('input')?.checked === ${!before};
      })()`);
      assert(
        await evaluate(cdp, `document.querySelector('.experience')?.dataset.mode === 'active'`),
        `${key.toUpperCase()} ended the active session`,
      );
    }
    await waitFor(cdp, `window.__stillnessQa.streams.length > 0
      && window.__stillnessQa.streams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'))`);
    assert(
      await evaluate(cdp, `document.querySelector('.session-guidance') === null`),
      'G did not remove the visible guidance cue',
    );

    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('dialog.session-menu')?.open === false`);
    assert(
      await evaluate(cdp, `document.querySelector('.experience')?.dataset.mode === 'active'`),
      'The first Escape left instead of closing the menu',
    );
    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    assert(
      await evaluate(cdp, `window.__stillnessQa.streams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'))`),
      'Leaving did not release fake-camera tracks',
    );

    if (await evaluate(cdp, `document.querySelector('.mode-choice input')?.checked === true`)) {
      await evaluate(cdp, `document.querySelector('.mode-choice input').click()`);
    }
    assert(
      await evaluate(cdp, `document.querySelector('.mode-choice input')?.checked === false`),
      'The Guided checkbox could not be unchecked for Pure mode',
    );
    await begin(cdp);
    await assertHealthyCanvas(cdp);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(
      await evaluate(cdp, `document.querySelector('.session-guidance') === null`),
      'Pure mode rendered guidance',
    );
    assert(
      await evaluate(cdp, `(() => {
        const metrics = document.querySelector('dialog.session-menu section');
        return metrics === null || getComputedStyle(metrics).display === 'none'
          || metrics.getClientRects().length === 0;
      })()`),
      'Pure mode exposed visible metrics by default',
    );
    await waitForVisualSettle(cdp);
    await screenshot(cdp, 'desktop-pure.png');
    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);

    await navigate(cdp, `${origin}/?deny-camera`);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    await begin(cdp);
    await waitForGuidance(cdp);
    await assertHealthyCanvas(cdp);
    assert(
      await evaluate(cdp, `window.__stillnessQa.streams.length === 0`),
      'Camera denial unexpectedly retained a media stream',
    );
    assert(
      await evaluate(cdp, `document.querySelector('.session-guidance .signal-label')?.textContent
        === 'Following a gentle rhythm'`),
      'Camera denial did not fall back to the non-judgmental scripted cue',
    );
    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    await setViewport(cdp, mobileViewport);
    await navigate(cdp, origin);
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);
    assert(
      await evaluate(cdp, `document.documentElement.scrollWidth <= document.documentElement.clientWidth`),
      'Landing overflowed the 320 CSS pixel viewport',
    );
    await begin(cdp);
    await waitForGuidance(cdp);
    await assertHealthyCanvas(cdp);
    await waitForVisualSettle(cdp);
    await screenshot(cdp, 'mobile-guided.png');
    await pressKey(cdp, 'd');
    await waitFor(cdp, `document.querySelectorAll('dialog.session-menu meter').length === 4`);
    assert(
      await evaluate(cdp, `(() => {
        const rect = document.querySelector('dialog.session-menu')?.getBoundingClientRect();
        return rect && rect.left >= 0 && rect.right <= innerWidth
          && rect.top >= 0 && rect.bottom <= innerHeight
          && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      })()`),
      'The session menu did not fit the 320 CSS pixel viewport',
    );
    await screenshot(cdp, 'mobile-menu-metrics.png');
    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('dialog.session-menu')?.open === false`);
    await pressKey(cdp, 'Escape');
    await waitFor(cdp, `document.querySelector('[data-mode="ready"]') !== null`);

    await setViewport(cdp, desktopViewport);
    await cdp.call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await navigate(cdp, origin);
    assert(
      await evaluate(cdp, `matchMedia('(prefers-reduced-motion: reduce)').matches`),
      'Reduced-motion preference was not applied',
    );
    await begin(cdp);
    await waitForGuidance(cdp);
    await assertHealthyCanvas(cdp);
    assert(
      await evaluate(cdp, `parseFloat(getComputedStyle(document.querySelector('.session-guidance')).animationDuration) <= 0.001`),
      'Guidance animation did not honor reduced motion',
    );
    await waitForVisualSettle(cdp);
    await screenshot(cdp, 'reduced-motion-guided.png');
    await pressKey(cdp, 'Escape');
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
    await assertHealthyCanvas(cdp);

    assert(browserErrors.length === 0, `Browser errors:\n${browserErrors.join('\n')}`);
    await cdp.close();
    process.stdout.write(
      `Stillness browser smoke passed: Guided, Pure, dialog focus, shortcuts, camera fallback/cleanup, 320px layout, WebGL, reduced motion, and offline hydration. Screenshots: ${screenshotDirectory}\n`,
    );
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

async function setViewport(cdp, viewport) {
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    ...viewport,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
}

async function pressKey(cdp, key) {
  const keyboard = {
    '?': { key: '?', code: 'Slash', modifiers: 8, text: '?' },
    Escape: { key: 'Escape', code: 'Escape', modifiers: 0 },
  }[key] ?? { key, code: `Key${key.toUpperCase()}`, modifiers: 0, text: key };
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', ...keyboard });
  await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', ...keyboard, text: undefined });
}

async function switchChecked(cdp, label) {
  return evaluate(cdp, `(() => {
    const label = Array.from(document.querySelectorAll('dialog.session-menu label'))
      .find((item) => item.innerText.includes(${JSON.stringify(label)}));
    return label?.querySelector('input')?.checked;
  })()`);
}

async function waitForGuidance(cdp) {
  await waitFor(cdp, `(() => {
    const guidance = document.querySelector('.session-guidance');
    if (!guidance || guidance.getClientRects().length === 0) return false;
    return Boolean(
      guidance.querySelector('.signal-label')?.textContent?.trim()
      && guidance.querySelector('h2')?.textContent?.trim()
      && guidance.querySelector('.signal-explanation')?.textContent?.trim()
    );
  })()`);
}

async function waitForVisualSettle(cdp) {
  await waitFor(cdp, `parseFloat(getComputedStyle(document.querySelector('section.entry-panel')).opacity) < 0.01`);
  await new Promise((resolve) => setTimeout(resolve, 1_100));
}

async function assertHealthyCanvas(cdp) {
  assert(await evaluate(cdp, `(() => {
    const canvas = document.querySelector('canvas.light-field');
    const gl = canvas?.getContext('webgl2');
    return Boolean(canvas?.width > 0 && canvas?.height > 0
      && gl && !gl.isContextLost() && gl.getError() === gl.NO_ERROR
      && window.__stillnessQa.webglContextLost === 0);
  })()`), 'WebGL canvas did not render cleanly');
}

async function screenshot(cdp, filename) {
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(screenshotDirectory, filename), Buffer.from(result.data, 'base64'));
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
