import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { adminRetryPbVisionRequest } from '@/lib/pb-vision-admin-reset';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let requestId: string | undefined;

  try {
    const body = await request.json();
    requestId = body?.request_id?.trim();

    if (!requestId) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    const result = await adminRetryPbVisionRequest(requestId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      request_id: result.request_id,
      status: result.status,
      pbv_vid: result.pbv_vid,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to retry PB Vision request';

    console.error('[PB Vision Admin Retry] Route error:', {
      request_id: requestId,
      error: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
