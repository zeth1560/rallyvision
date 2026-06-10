import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/admin/pb-vision-requests/retry': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
    '/api/player-trove/pb-vision/request': [
      './node_modules/ffmpeg-static/ffmpeg',
    ],
  },
};

export default nextConfig;
