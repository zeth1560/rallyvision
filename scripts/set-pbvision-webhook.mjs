/**
 * Register PB Vision webhook URL for this environment.
 *
 * Usage (from repo root):
 *   node scripts/set-pbvision-webhook.mjs
 *
 * Requires:
 *   PBVISION_API_KEY
 *   PBVISION_WEBHOOK_URL  (e.g. https://www.replaytrove.com/api/pb-vision-webhook)
 * Optional:
 *   PBVISION_USE_PROD_SERVER=true
 *
 * Alternative (curl):
 *   curl -X POST -H 'x-api-key: YOUR_API_KEY' -H 'Content-Type: application/json' \
 *     -d '{"url":"https://YOUR_HOST/api/pb-vision-webhook"}' \
 *     https://api-2o2klzx4pa-uc.a.run.app/partner/webhook/set
 */
import 'dotenv/config';
import { PBVision } from '@pbvision/partner-sdk';

const apiKey = process.env.PBVISION_API_KEY?.trim();
const webhookUrl = process.env.PBVISION_WEBHOOK_URL?.trim();

if (!apiKey) {
  console.error('PBVISION_API_KEY is required');
  process.exit(1);
}

if (!webhookUrl) {
  console.error('PBVISION_WEBHOOK_URL is required');
  process.exit(1);
}

const pbv = new PBVision(apiKey, {
  useProdServer: process.env.PBVISION_USE_PROD_SERVER === 'true',
});

try {
  await pbv.setWebhook(webhookUrl);
  console.log('PB Vision webhook registered:', webhookUrl);
} catch (error) {
  console.error('Failed to set webhook:', error);
  process.exit(1);
}
