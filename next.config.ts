import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'moov-faststart'],
  outputFileTracingIncludes: {
    '/api/admin/pb-vision-requests/retry': [
      './node_modules/ffmpeg-static/**',
    ],
    '/api/player-trove/pb-vision/request': [
      './node_modules/ffmpeg-static/**',
    ],
  },
};

export default nextConfig;
