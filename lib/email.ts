import { Resend } from 'resend';
import { createPlayerTroveToken } from '@/lib/player-trove-token';
import {
  describePlayerTroveEmailConfigIssues,
  getPlayerTroveEmailConfigIssues,
} from '@/lib/player-trove-email-config';

const resend = new Resend(process.env.RESEND_API_KEY!);

type PurchasedClip = {
  title: string;
  slug: string;
};

export type PlayerTroveAccessEmailOptions =
  | {
      source: 'paid_purchase';
      sessionId: string;
      clips: PurchasedClip[];
    }
  | {
      source: 'free_checkout';
      clipCount: number;
    }
  | {
      source: 'free_claim';
    }
  | {
      source: 'manual_request';
    };

function getEmailBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function getEmailLogoUrl() {
  const override = process.env.EMAIL_LOGO_URL?.trim();
  if (override) {
    return override;
  }

  return `${getEmailBaseUrl()}/logo.png`;
}

function emailHeaderHtml() {
  const baseUrl = getEmailBaseUrl();
  const logoUrl = getEmailLogoUrl();

  return `
    <div style="text-align: center; margin: 0 0 24px; padding-bottom: 20px; border-bottom: 1px solid #ececec;">
      <a href="${baseUrl}" style="text-decoration: none;">
        <img
          src="${logoUrl}"
          alt="ReplayTrove"
          width="420"
          style="display: block; max-width: 420px; width: 100%; height: auto; margin: 0 auto; border: 0;"
        />
      </a>
    </div>
  `;
}

function wrapEmailBody(content: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17191c;">
      ${emailHeaderHtml()}
      ${content}
    </div>
  `;
}

/** Build PlayerTrove magic link for emails. Never log the return value. */
function buildPlayerTroveMagicLinkUrl(email: string) {
  const token = createPlayerTroveToken(email);
  return `${getEmailBaseUrl()}/api/player-trove/open?token=${encodeURIComponent(token)}`;
}

function playerTroveAccessSectionHtml(magicLinkUrl: string) {
  const requestUrl = `${getEmailBaseUrl()}/player-trove/request`;

  return `
    <div style="margin: 24px 0; padding: 16px; background: #f8f8f8; border-radius: 8px; border: 1px solid #ececec;">
      <h2 style="margin-top: 0; font-size: 1.1rem;">Your PlayerTrove</h2>
      <p style="margin: 0 0 12px;">
        <a href="${magicLinkUrl}">Open PlayerTrove</a> to view all of your purchased or claimed videos in one place.
      </p>
      <p style="margin: 0 0 8px; color: #444; font-size: 14px;">
        HD downloads are available for 30 days from purchase or claim.
      </p>
      <p style="margin: 0; color: #666; font-size: 14px;">
        This PlayerTrove link expires in 24 hours. You can request a new link anytime at
        <a href="${requestUrl}">${requestUrl}</a>.
      </p>
    </div>
  `;
}

function buildEmailHtml(to: string, options: PlayerTroveAccessEmailOptions) {
  const baseUrl = getEmailBaseUrl();
  const playerTroveUrl = buildPlayerTroveMagicLinkUrl(to);
  const troveSection = playerTroveAccessSectionHtml(playerTroveUrl);

  switch (options.source) {
    case 'paid_purchase': {
      const successUrl = `${baseUrl}/success?session_id=${encodeURIComponent(options.sessionId)}`;
      const clipListHtml = options.clips
        .map(
          (clip) => `
            <li style="margin-bottom:8px;">
              <strong>${clip.title}</strong><br />
              <a href="${baseUrl}/clip/${clip.slug}">${baseUrl}/clip/${clip.slug}</a>
            </li>
          `
        )
        .join('');

      return {
        subject: 'Your ReplayTrove clips are ready',
        html: wrapEmailBody(`
            <h1 style="margin-top: 0;">Your ReplayTrove purchase is complete</h1>
            <p>Thanks for your purchase. Your clips are ready.</p>

            <p>
              You can download your clips from this purchase session here:<br />
              <a href="${successUrl}">${successUrl}</a>
            </p>

            ${troveSection}

            <h2>Purchased Clips</h2>
            <ul>${clipListHtml}</ul>

            <p>
              Keep this email handy in case you want to come back later and download your clips again.
            </p>
        `),
      };
    }

    case 'free_checkout': {
      const clipLabel =
        options.clipCount === 1 ? '1 clip' : `${options.clipCount} clips`;

      return {
        subject: 'Your ReplayTrove clips are ready',
        html: wrapEmailBody(`
            <h1 style="margin-top: 0;">Your free ReplayTrove clips are ready</h1>
            <p>
              Thanks for completing free checkout during the ReplayTrove free pilot.
              ${clipLabel} ${options.clipCount === 1 ? 'is' : 'are'} now available in your PlayerTrove.
            </p>

            ${troveSection}

            <p>
              Keep this email handy in case you want to come back later and download your clips again.
            </p>
        `),
      };
    }

    case 'free_claim':
      return {
        subject: 'Your ReplayTrove clip is ready',
        html: wrapEmailBody(`
            <h1 style="margin-top: 0;">Your free ReplayTrove clip is ready</h1>
            <p>
              Thanks for claiming free access during the ReplayTrove free pilot.
              Your clip is now available in your PlayerTrove.
            </p>

            ${troveSection}

            <p>
              Keep this email handy in case you want to come back later and download your clip again.
            </p>
        `),
      };

    case 'manual_request':
      return {
        subject: 'Your PlayerTrove access link',
        html: wrapEmailBody(`
            <h1 style="margin-top: 0;">Access your PlayerTrove</h1>
            <p>Use the link below to view and download your ReplayTrove videos.</p>

            ${troveSection}

            <p style="color: #666; font-size: 14px;">
              If you did not request this email, you can safely ignore it.
            </p>
        `),
      };
  }
}

export async function sendPlayerTroveAccessEmail(
  to: string,
  options: PlayerTroveAccessEmailOptions
) {
  const configIssues = getPlayerTroveEmailConfigIssues();
  if (configIssues.length > 0) {
    throw new Error(describePlayerTroveEmailConfigIssues(configIssues));
  }

  const { subject, html } = buildEmailHtml(to, options);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send PlayerTrove access email');
  }

  return data;
}

/** Paid Stripe purchase confirmation (includes success-page link + PlayerTrove). */
export async function sendPurchaseConfirmationEmail({
  to,
  sessionId,
  clips,
}: {
  to: string;
  sessionId: string;
  clips: PurchasedClip[];
}) {
  return sendPlayerTroveAccessEmail(to, {
    source: 'paid_purchase',
    sessionId,
    clips,
  });
}

/** Manual magic-link request from /player-trove/request */
export async function sendPlayerTroveMagicLinkEmail({
  to,
}: {
  to: string;
  magicLinkUrl?: string;
}) {
  return sendPlayerTroveAccessEmail(to, { source: 'manual_request' });
}
