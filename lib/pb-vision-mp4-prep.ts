import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseFile } from 'music-metadata';
import { resolveFfmpegExecutable } from '@/lib/ffmpeg-path';
import {
  deleteS3Object,
  downloadS3ObjectToTempFile,
  getS3ObjectContentLength,
  MAX_PBV_DIRECT_UPLOAD_BYTES,
  uploadLocalFileToS3,
} from '@/lib/s3';

const require = createRequire(import.meta.url);
const { faststart } = require('moov-faststart') as {
  faststart: (input: Buffer) => Buffer;
};

const REMUX_TIMEOUT_MS = 4 * 60 * 1000;

export type PbVisionPrepStrategy = 'moov-faststart' | 'ffmpeg-copy' | 'h264-transcode';

export type PbVisionMp4Inspection = {
  durationSeconds: number | null;
  videoCodec: string | null;
  container: string | null;
};

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = await resolveFfmpegExecutable();
  const stderrChunks: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
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

async function transformLocalMp4(
  inputPath: string,
  strategy: PbVisionPrepStrategy
): Promise<string> {
  const outputPath = join(tmpdir(), `pbv-prep-${randomUUID()}.mp4`);

  if (strategy === 'moov-faststart') {
    const inputBuffer = await readFile(inputPath);
    try {
      const outputBuffer = faststart(inputBuffer);
      await writeFile(outputPath, outputBuffer);
      return outputPath;
    } catch (error) {
      throw new Error(
        `Failed to prepare MP4 for PB Vision: ${
          error instanceof Error ? error.message : 'invalid MP4 container'
        }`
      );
    }
  }

  if (strategy === 'ffmpeg-copy') {
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ]);
    return outputPath;
  }

  await runFfmpeg([
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ]);
  return outputPath;
}

export async function inspectMp4ForPbVision(
  filePath: string
): Promise<PbVisionMp4Inspection | null> {
  try {
    const metadata = await parseFile(filePath);
    const videoTrack =
      'videoTracks' in metadata && Array.isArray(metadata.videoTracks)
        ? metadata.videoTracks[0]
        : undefined;

    return {
      durationSeconds: metadata.format.duration ?? null,
      videoCodec:
        videoTrack && typeof videoTrack === 'object' && 'codecName' in videoTrack
          ? String(videoTrack.codecName)
          : null,
      container: metadata.format.container ?? null,
    };
  } catch {
    return null;
  }
}

export async function inspectSourceMp4FromS3(
  sourceKey: string
): Promise<PbVisionMp4Inspection | null> {
  const { filePath, cleanup } = await downloadS3ObjectToTempFile(sourceKey);
  try {
    return await inspectMp4ForPbVision(filePath);
  } finally {
    await cleanup();
  }
}

export function formatPbVisionPrepFailureMessage(
  inspection: PbVisionMp4Inspection | null
): string {
  if (!inspection) {
    return 'PB Vision could not read video duration from this file. The source MP4 may be corrupt or need to be re-encoded as H.264.';
  }

  const duration =
    inspection.durationSeconds != null
      ? `${Math.round(inspection.durationSeconds)}s`
      : 'unknown';
  const codec = inspection.videoCodec ?? 'unknown';

  if (codec !== 'h264' && codec !== 'avc1') {
    return `PB Vision requires H.264 MP4 video, but this file uses codec "${codec}" (duration ${duration}). Re-encode the source clip as H.264 MP4 and try again.`;
  }

  return `PB Vision could not read video duration from this H.264 file (duration ${duration}). The source MP4 may be corrupt or missing streamable metadata.`;
}

export async function preparePbVisionCopy(
  sourceKey: string,
  strategy: PbVisionPrepStrategy
): Promise<{
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
  const { filePath: inputPath, cleanup: cleanupInput } =
    await downloadS3ObjectToTempFile(sourceKey);

  let outputPath: string | null = null;
  try {
    console.log('[PB Vision] Preparing streamable MP4 copy', {
      source_key: sourceKey,
      staging_key: stagingKey,
      strategy,
      content_length: contentLength,
    });

    outputPath = await transformLocalMp4(inputPath, strategy);
    await uploadLocalFileToS3(stagingKey, outputPath);
  } finally {
    await cleanupInput();
    if (outputPath) {
      await rm(outputPath, { force: true });
    }
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

/** @deprecated Use preparePbVisionCopy(sourceKey, 'moov-faststart') */
export async function preparePbVisionStreamableCopy(sourceKey: string) {
  return preparePbVisionCopy(sourceKey, 'moov-faststart');
}
