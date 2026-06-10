import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseBuffer, parseFile } from 'music-metadata';
import { resolveFfmpegExecutable } from '@/lib/ffmpeg-path';
import {
  createSignedMp4FetchUrl,
  deleteS3Object,
  getS3ObjectContentLength,
  MAX_PBV_DIRECT_UPLOAD_BYTES,
  MAX_PBV_FFMPEG_DISK_OUTPUT_BYTES,
  MAX_PBV_H264_TRANSCODE_BYTES,
  MAX_PBV_IN_MEMORY_PREP_BYTES,
  readS3ObjectToBuffer,
  uploadBufferToS3,
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

export class PbVisionPrepSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PbVisionPrepSkippedError';
  }
}

function inspectionFromMetadata(metadata: Awaited<ReturnType<typeof parseBuffer>>) {
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
}

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

async function prepareMoovFaststartInMemory(
  sourceKey: string,
  contentLength: number | null
): Promise<Buffer> {
  if (contentLength != null && contentLength > MAX_PBV_IN_MEMORY_PREP_BYTES) {
    throw new PbVisionPrepSkippedError(
      `Skipping moov-faststart because file exceeds in-memory prep limit (${contentLength} bytes)`
    );
  }

  const inputBuffer = await readS3ObjectToBuffer(sourceKey, MAX_PBV_IN_MEMORY_PREP_BYTES);
  try {
    return faststart(inputBuffer);
  } catch (error) {
    throw new Error(
      `Failed to prepare MP4 for PB Vision: ${
        error instanceof Error ? error.message : 'invalid MP4 container'
      }`
    );
  }
}

async function prepareWithFfmpegToTempFile(
  sourceKey: string,
  strategy: 'ffmpeg-copy' | 'h264-transcode',
  contentLength: number | null
): Promise<string> {
  const maxBytes =
    strategy === 'h264-transcode'
      ? MAX_PBV_H264_TRANSCODE_BYTES
      : MAX_PBV_FFMPEG_DISK_OUTPUT_BYTES;

  if (contentLength != null && contentLength > maxBytes) {
    throw new PbVisionPrepSkippedError(
      `Skipping ${strategy} because file exceeds /tmp output limit (${contentLength} bytes)`
    );
  }

  const signedInputUrl = await createSignedMp4FetchUrl(sourceKey, 60 * 60);
  const outputPath = join(tmpdir(), `pbv-prep-${randomUUID()}.mp4`);

  try {
    if (strategy === 'ffmpeg-copy') {
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        signedInputUrl,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        '-y',
        outputPath,
      ]);
    } else {
      await runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        signedInputUrl,
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
    }

    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}

export function getPbVisionPrepStrategies(
  contentLength: number | null
): PbVisionPrepStrategy[] {
  const large =
    contentLength != null && contentLength > 300 * 1024 * 1024;

  // Large files: only ffmpeg stream-copy fits Vercel /tmp and memory limits.
  if (large) {
    return ['ffmpeg-copy'];
  }

  return ['moov-faststart', 'ffmpeg-copy', 'h264-transcode'];
}

export async function inspectMp4ForPbVision(
  filePath: string
): Promise<PbVisionMp4Inspection | null> {
  try {
    const metadata = await parseFile(filePath);
    return inspectionFromMetadata(metadata);
  } catch {
    return null;
  }
}

export async function inspectSourceMp4FromS3(
  sourceKey: string
): Promise<PbVisionMp4Inspection | null> {
  try {
    const contentLength = await getS3ObjectContentLength(sourceKey);
    if (
      contentLength != null &&
      contentLength > MAX_PBV_IN_MEMORY_PREP_BYTES
    ) {
      return null;
    }

    const buffer = await readS3ObjectToBuffer(sourceKey, MAX_PBV_IN_MEMORY_PREP_BYTES);
    const metadata = await parseBuffer(buffer, { mimeType: 'video/mp4' });
    return inspectionFromMetadata(metadata);
  } catch {
    return null;
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

  console.log('[PB Vision] Preparing streamable MP4 copy', {
    source_key: sourceKey,
    staging_key: stagingKey,
    strategy,
    content_length: contentLength,
  });

  if (strategy === 'moov-faststart') {
    const outputBuffer = await prepareMoovFaststartInMemory(sourceKey, contentLength);
    await uploadBufferToS3(stagingKey, outputBuffer);
  } else {
    const outputPath = await prepareWithFfmpegToTempFile(
      sourceKey,
      strategy,
      contentLength
    );
    try {
      await uploadLocalFileToS3(stagingKey, outputPath);
    } finally {
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
