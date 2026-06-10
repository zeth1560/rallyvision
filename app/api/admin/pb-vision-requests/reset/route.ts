import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { adminResetPbVisionRequestForRetry } from '@/lib/pb-vision-admin-reset';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const requestId = body?.request_id?.trim();

    if (!requestId) {
      return NextResponse.json({ error: 'request_id is required' }, { status: 400 });
    }

    const result = await adminResetPbVisionRequestForRetry(requestId);

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
    console.error('[PB Vision Admin Reset] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to reset PB Vision request' },
      { status: 500 }
    );
  }
}
