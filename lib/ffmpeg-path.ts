import { access, chmod, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';

let cachedExecutablePath: string | null = null;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Copy ffmpeg to /tmp so it is executable on read-only serverless filesystems. */
export async function resolveFfmpegExecutable(): Promise<string> {
  if (cachedExecutablePath && (await pathExists(cachedExecutablePath))) {
    return cachedExecutablePath;
  }

  const bundledPath = ffmpegStatic?.trim();
  if (!bundledPath || !(await pathExists(bundledPath))) {
    const envPath = process.env.FFMPEG_BIN?.trim();
    if (envPath && (await pathExists(envPath))) {
      cachedExecutablePath = envPath;
      return envPath;
    }

    throw new Error(
      'ffmpeg binary is not available in this deployment. Re-encode the source clip as H.264 MP4 with faststart locally, then retry.'
    );
  }

  const tmpPath = join(tmpdir(), 'pbv-ffmpeg');
  if (!(await pathExists(tmpPath))) {
    await copyFile(bundledPath, tmpPath);
    await chmod(tmpPath, 0o755);
  }

  cachedExecutablePath = tmpPath;
  return tmpPath;
}
