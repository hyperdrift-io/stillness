import {
  createReadStream,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { Readable } from 'node:stream';

export type StreamedTrack = {
  title: string;
  url: string;
  bytes: number;
};

function musicDirectory(): string {
  const configured = process.env.STILLNESS_MUSIC_DIR?.trim();
  return configured ? resolve(configured) : resolve('.local-music');
}

function trackTitle(filename: string): string {
  return filename
    .replace(/^Boards of Canada - Music Has The Right To Children - \d+\s+/, '')
    .replace(/\.mp3$/i, '');
}

export function streamedTracks(): StreamedTrack[] {
  const directory = musicDirectory();
  if (!existsSync(directory)) return [];
  try {
    return readdirSync(directory)
      .filter((filename) => filename.toLowerCase().endsWith('.mp3'))
      .sort()
      .map((filename) => ({
        title: trackTitle(filename),
        url: `/local-music/${encodeURIComponent(filename)}`,
        bytes: statSync(resolve(directory, filename)).size,
      }));
  } catch {
    return [];
  }
}

export function musicManifestResponse(method = 'GET'): Response {
  const body = JSON.stringify({ tracks: streamedTracks() });
  return new Response(method === 'HEAD' ? null : body, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function musicTrackResponse(request: Request, filename: string): Response {
  if (filename !== basename(filename) || !filename.toLowerCase().endsWith('.mp3')) {
    return new Response(null, { status: 404 });
  }

  const trackPath = resolve(musicDirectory(), filename);
  if (!existsSync(trackPath)) return new Response(null, { status: 404 });
  const size = statSync(trackPath).size;
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;

  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  if (range) {
    start = range[1]
      ? Number(range[1])
      : Math.max(0, size - Number(range[2] || 0));
    end = range[2] && range[1] ? Number(range[2]) : size - 1;
    if (
      !Number.isSafeInteger(start)
      || !Number.isSafeInteger(end)
      || start < 0
      || start > end
      || start >= size
    ) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
  }

  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'Content-Length': String(end - start + 1),
    'Content-Type': 'audio/mpeg',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  if (request.method === 'HEAD') {
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const stream = Readable.toWeb(createReadStream(trackPath, { start, end }));
  return new Response(stream as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
