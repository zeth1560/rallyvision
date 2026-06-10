import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
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

  console.log('[PB Vision] Reordering MP4 moov atom for streamable metadata', {
    source_key: sourceKey,
    staging_key: stagingKey,
    content_length: contentLength,
  });

  const { filePath: inputPath, cleanup: cleanupInput } =
    await downloadS3ObjectToTempFile(sourceKey);

  try {
    const inputBuffer = await readFile(inputPath);
    await rm(inputPath, { force: true });

    let outputBuffer: Buffer;
    try {
      outputBuffer = faststart(inputBuffer);
    } catch (error) {
      throw new Error(
        `Failed to prepare MP4 for PB Vision: ${
          error instanceof Error ? error.message : 'invalid MP4 container'
        }`
      );
    }

    await writeFile(outputPath, outputBuffer);
    await uploadLocalFileToS3(stagingKey, outputPath);
  } finally {
    await cleanupInput();
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
