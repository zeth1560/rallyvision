import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';
import {
  createSignedMp4FetchUrl,
  deleteS3Object,
  getS3ObjectContentLength,
  MAX_PBV_DIRECT_UPLOAD_BYTES,
  s3,
  uploadLocalFileToS3,
} from '@/lib/s3';

const REMUX_TIMEOUT_MS = 4 * 60 * 1000;

function runFfmpegFaststartRemux(inputUrl: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) {
    return Promise.reject(new Error('ffmpeg binary is not available'));
  }

  const executablePath = ffmpegPath;

  return new Promise((resolve, reject) => {
    const stderrChunks: string[] = [];
    const proc = spawn(
      executablePath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputUrl,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Timed out preparing MP4 for PB Vision'));
    }, REMUX_TIMEOUT_MS);

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString('utf8'));
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      const details = stderrChunks.join('').trim();
      reject(
        new Error(
          details
            ? `Failed to prepare MP4 for PB Vision: ${details}`
            : `Failed to prepare MP4 for PB Vision (ffmpeg exit ${code ?? 'unknown'})`
        )
      );
    });
  });
}

export async function preparePbVisionStreamableCopy(sourceKey: string): Promise<{
  stagingKey: string;
  cleanup: () => Promise<void>;
}> {
  const contentLength = await getS3ObjectContentLength(sourceKey);
  if (contentLength != null && contentLength > MAX_PBV_DIRECT_UPLOAD_BYTES) {
    throw new Error(
      `Video file is too large to prepare for PB Vision (${contentLength} bytes; max ${MAX_PBV_DIRECT_UPLOAD_BYTES})`
    );
  }

  const stagingKey = `pbv-prep/${randomUUID()}.mp4`;
  const outputPath = join(tmpdir(), `pbv-prep-${randomUUID()}.mp4`);
  const signedInputUrl = await createSignedMp4FetchUrl(sourceKey, 60 * 60);

  console.log('[PB Vision] Remuxing MP4 with faststart for streamable metadata', {
    source_key: sourceKey,
    staging_key: stagingKey,
    content_length: contentLength,
  });

  try {
    await runFfmpegFaststartRemux(signedInputUrl, outputPath);
    await uploadLocalFileToS3(stagingKey, outputPath);
  } finally {
    await rm(outputPath, { force: true });
  }

  return {
    stagingKey,
    cleanup: async () => {
      try {
        await deleteS3Object(stagingKey);
      } catch (error) {
        console.warn('[PB Vision] Failed to delete staging MP4', {
          staging_key: stagingKey,
          error: error instanceof Error ? error.message : error,
        });
      }
    },
  };
}
