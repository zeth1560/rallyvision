import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

type PurchasedClip = {
  title: string;
  slug: string;
};

type SendPurchaseEmailArgs = {
  to: string;
  sessionId: string;
  clips: PurchasedClip[];
};

export async function sendPurchaseConfirmationEmail({
  to,
  sessionId,
  clips,
}: SendPurchaseEmailArgs) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  const clipListHtml = clips
    .map(
      (clip) => `
        <li style="margin-bottom:8px;">
          <strong>${clip.title}</strong><br />
          <a href="${baseUrl}/clip/${clip.slug}">${baseUrl}/clip/${clip.slug}</a>
        </li>
      `
    )
    .join('');

  const successUrl = `${baseUrl}/success?session_id=${encodeURIComponent(sessionId)}`;

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: 'Your ReplayTrove clips are ready',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h1>Your ReplayTrove purchase is complete</h1>
        <p>Thanks for your purchase. Your clips are ready.</p>

        <p>
          You can access your purchased clips here:<br />
          <a href="${successUrl}">${successUrl}</a>
        </p>

        <h2>Purchased Clips</h2>
        <ul>
          ${clipListHtml}
        </ul>

        <p>
          Keep this email handy in case you want to come back later and download your clips again.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send purchase email');
  }

  return data;
}