import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  claimCheckoutFulfillment,
  completeCheckoutFulfillment,
} from '@/lib/commerce/fulfillment-lock';
import { runStripeCheckoutFulfillment } from '@/lib/commerce/fulfillment';
import { normalizeCheckoutEmail } from '@/lib/commerce/purchase-validation';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

function resolveSessionPaymentIntentId(session: Stripe.Checkout.Session) {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
}

function resolveSessionEmail(session: Stripe.Checkout.Session) {
  return normalizeCheckoutEmail(
    session.customer_details?.email || session.customer_email
  );
}

export async function retryStripeCheckoutFulfillmentIfNeeded(
  stripeCheckoutSessionId: string
): Promise<{ ok: true; fulfilled: boolean } | { ok: false; error: string }> {
  const sessionId = stripeCheckoutSessionId.trim();
  if (!sessionId) {
    return { ok: false, error: 'Missing checkout session id' };
  }

  const { data: existingFulfillment } = await supabaseAdmin
    .from('checkout_fulfillments')
    .select('status')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();

  if (existingFulfillment?.status === 'completed') {
    return { ok: true, fulfilled: false };
  }

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load Stripe checkout session',
    };
  }

  if (session.payment_status !== 'paid') {
    return { ok: false, error: 'Checkout session is not paid' };
  }

  const email = resolveSessionEmail(session);
  if (!email) {
    return { ok: false, error: 'Missing customer email on checkout session' };
  }

  const claimResult = await claimCheckoutFulfillment({
    stripeCheckoutSessionId: sessionId,
    email,
  });

  if (claimResult === 'already_completed') {
    return { ok: true, fulfilled: false };
  }

  try {
    await runStripeCheckoutFulfillment({
      session,
      email,
      paymentIntentId: resolveSessionPaymentIntentId(session),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Fulfillment retry failed',
    };
  }

  return { ok: true, fulfilled: true };
}

export async function retryPendingCheckoutFulfillmentsForEmail(
  email: string,
  options?: { sessionId?: string | null }
) {
  const normalizedEmail = normalizeCheckoutEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const sessionIds = new Set<string>();

  if (options?.sessionId?.trim()) {
    sessionIds.add(options.sessionId.trim());
  }

  const { data: checkoutCarts } = await supabaseAdmin
    .from('checkout_carts')
    .select('stripe_checkout_session_id, cart_json, created_at')
    .not('stripe_checkout_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  for (const cart of checkoutCarts ?? []) {
    const sessionId = cart.stripe_checkout_session_id?.trim();
    if (!sessionId) {
      continue;
    }

    const cartEmail =
      typeof cart.cart_json === 'object' &&
      cart.cart_json !== null &&
      'customerEmail' in cart.cart_json
        ? normalizeCheckoutEmail(
            String((cart.cart_json as { customerEmail?: string }).customerEmail)
          )
        : null;

    if (cartEmail !== normalizedEmail) {
      continue;
    }

    const { data: fulfillment } = await supabaseAdmin
      .from('checkout_fulfillments')
      .select('status')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle();

    if (fulfillment?.status === 'completed') {
      continue;
    }

    sessionIds.add(sessionId);
  }

  for (const sessionId of sessionIds) {
    const result = await retryStripeCheckoutFulfillmentIfNeeded(sessionId);
    if (!result.ok) {
      console.error('[Fulfillment Retry] Failed to complete checkout fulfillment', {
        stripe_checkout_session_id: sessionId,
        email: normalizedEmail,
        error: result.error,
      });
    } else if (result.fulfilled) {
      console.log('[Fulfillment Retry] Completed checkout fulfillment', {
        stripe_checkout_session_id: sessionId,
        email: normalizedEmail,
      });
    }
  }
}

export async function markCheckoutFulfillmentCompletedIfOrdersExist(
  stripeCheckoutSessionId: string
) {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId)
    .eq('status', 'paid');

  if (error || (count ?? 0) === 0) {
    return;
  }

  await completeCheckoutFulfillment(stripeCheckoutSessionId);
}
