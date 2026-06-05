import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeCheckoutEmail } from '@/lib/commerce/purchase-validation';

export type FulfillmentClaimResult =
  | 'claimed'
  | 'already_completed'
  | 'resume';

export async function claimCheckoutFulfillment({
  stripeCheckoutSessionId,
  email,
}: {
  stripeCheckoutSessionId: string;
  email: string;
}): Promise<FulfillmentClaimResult> {
  const normalizedEmail = normalizeCheckoutEmail(email);

  if (!normalizedEmail) {
    throw new Error('Missing customer email for fulfillment claim');
  }

  const { error: insertError } = await supabaseAdmin
    .from('checkout_fulfillments')
    .insert({
      stripe_checkout_session_id: stripeCheckoutSessionId,
      email: normalizedEmail,
      status: 'processing',
    });

  if (!insertError) {
    return 'claimed';
  }

  if (insertError.code !== '23505') {
    throw new Error(
      `Failed to claim checkout fulfillment: ${insertError.message}`
    );
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('checkout_fulfillments')
    .select('status')
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId)
    .maybeSingle();

  if (lookupError || !existing) {
    throw new Error(
      `Failed to load checkout fulfillment claim: ${lookupError?.message ?? 'not found'}`
    );
  }

  if (existing.status === 'completed') {
    return 'already_completed';
  }

  return 'resume';
}

export async function completeCheckoutFulfillment(stripeCheckoutSessionId: string) {
  const { error } = await supabaseAdmin
    .from('checkout_fulfillments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId);

  if (error) {
    throw new Error(`Failed to complete checkout fulfillment: ${error.message}`);
  }
}

export async function failCheckoutFulfillment(
  stripeCheckoutSessionId: string,
  errorMessage: string
) {
  await supabaseAdmin
    .from('checkout_fulfillments')
    .update({
      status: 'failed',
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId);
}

export async function hasExistingOrderLineItems(
  stripeCheckoutSessionId: string
) {
  const { count, error } = await supabaseAdmin
    .from('order_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId);

  if (error) {
    throw new Error(`Failed to check order line items: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function hasExistingSessionOrders(stripeCheckoutSessionId: string) {
  const { count, error } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId);

  if (error) {
    throw new Error(`Failed to check existing orders: ${error.message}`);
  }

  return (count ?? 0) > 0;
}
