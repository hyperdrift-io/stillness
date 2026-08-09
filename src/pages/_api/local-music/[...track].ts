import { musicTrackResponse } from '../../../server/music-library.ts';

function filenameFromRequest(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  try {
    return decodeURIComponent(pathname.slice('/local-music/'.length));
  } catch {
    return null;
  }
}

function respond(request: Request): Response {
  const filename = filenameFromRequest(request);
  return filename === null
    ? new Response(null, { status: 400 })
    : musicTrackResponse(request, filename);
}

export function GET(request: Request): Response {
  return respond(request);
}

export function HEAD(request: Request): Response {
  return respond(request);
}
