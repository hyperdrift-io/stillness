import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('manifest declares installable, portrait, maskable app assets', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest')) as {
    name: string;
    start_url: string;
    display: string;
    orientation: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  assert.equal(manifest.name, 'Stillness');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.purpose?.includes('maskable')));
});

test('declared PNG icons exist and are non-empty', async () => {
  for (const icon of ['public/icon-192.png', 'public/icon-512.png']) {
    const metadata = await stat(new URL(icon, root));
    assert.ok(metadata.size > 1_000, `${icon} should contain rendered icon data`);
  }
});

test('service worker caches the shell and is registered by the client island', async () => {
  const worker = await read('public/sw.js');
  const experience = await read('src/experience/stillness-experience.tsx');
  assert.match(worker, /stillness-shell-v\d+/);
  assert.match(worker, /caches\.open/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /addEventListener\('message'/);
  assert.match(experience, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(experience, /postMessage/);
});

test('public discovery and metadata assets are present', async () => {
  const robots = await read('public/robots.txt');
  const sitemap = await read('public/sitemap.xml');
  const layout = await read('src/pages/_layout.tsx');
  const rootElement = await read('src/pages/_root.tsx');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /<urlset/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /og:title/);
  assert.match(rootElement, /<html lang="en">/);
});
