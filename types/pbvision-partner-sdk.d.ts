declare module '@pbvision/partner-sdk' {
  export type VideoMetadata = {
    userEmails?: string[];
    name?: string;
    desc?: string;
    gameStartEpoch?: number;
    facility?: string;
    court?: string;
    fid?: number;
  };

  export class PBVision {
    constructor(
      apiKey: string,
      options?: { useProdServer?: boolean }
    );

    setWebhook(webhookUrl: string): Promise<unknown>;
    sendVideoUrlToDownload(
      videoUrl: string,
      metadata?: VideoMetadata
    ): Promise<{ vid: string; hasCredits?: boolean }>;
    uploadVideo(
      mp4Filename: string,
      metadata?: VideoMetadata
    ): Promise<{ vid?: string; hasCredits?: boolean }>;
    getVideoEditors(vid: string): Promise<unknown>;
    setVideoEditors(
      vid: string,
      editorEmails: string[],
      viewerEmails: string[]
    ): Promise<unknown>;
  }
}