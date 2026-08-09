import { musicManifestResponse } from '../../../server/music-library.ts';

export function GET(): Response {
  return musicManifestResponse();
}

export function HEAD(): Response {
  return musicManifestResponse('HEAD');
}
