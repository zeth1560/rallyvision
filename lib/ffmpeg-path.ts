import { access } from 'node:fs/promises';
import path from 'node:path';

export async function resolveFfmpegExecutable(): Promise<string> {
  const candidates = [
    process.env.FFMPEG_BIN?.trim(),
    path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'),
    path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg.exe'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error('ffmpeg binary is not available');
}
