import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPlayerTroveAccessEmail } from '@/lib/email';
import {
  checkPlayerTroveLinkRateLimit,
  getRequestClientIp,
  RATE_LIMIT_MESSAGE,
  recordPlayerTroveLinkRequest,
} from '@/lib/player-trove-rate-limit';

const GENERIC_SUCCESS_MESSAGE =
  'If videos are available for that email, a PlayerTrove link has been sent.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawEmail = typeof body?.email === 'string' ? body.email : '';
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const ipAddress = getRequestClientIp(request);

    const rateLimit = await checkPlayerTroveLinkRateLimit(email, ipAddress);

    if (!rateLimit.allowed) {
      console.warn('[PlayerTrove] Magic link request rate limited', {
        reason: rateLimit.reason,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    await recordPlayerTroveLinkRequest(email, ipAddress);

    console.log('[PlayerTrove] Magic link requested', {
      timestamp: new Date().toISOString(),
    });

    const { count, error: lookupError } = await supabaseAdmin
      .from('player_video_access')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .eq('access_status', 'active');

    if (lookupError) {
      console.error('[PlayerTrove] Access lookup failed for magic link request', {
        error: lookupError.message,
      });
      return NextResponse.json(
        { error: 'Unable to process request. Please try again later.' },
        { status: 500 }
      );
    }

    if ((count ?? 0) > 0) {
      try {
        await sendPlayerTroveAccessEmail(email, { source: 'manual_request' });

        console.log('[PlayerTrove] Magic link email sent', {
          timestamp: new Date().toISOString(),
        });
      } catch (emailError) {
        console.error('[PlayerTrove] Magic link email failed', {
          error: emailError instanceof Error ? emailError.message : emailError,
        });
        return NextResponse.json(
          { error: 'Unable to send email. Please try again later.' },
          { status: 500 }
        );
      }
    } else {
      console.log('[PlayerTrove] Magic link request with no active access (generic response)', {
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      message: GENERIC_SUCCESS_MESSAGE,
    });
  } catch (error) {
    console.error('[PlayerTrove] request-link route error:', error);

    return NextResponse.json(
      { error: 'Unable to process request. Please try again later.' },
      { status: 500 }
    );
  }
}
