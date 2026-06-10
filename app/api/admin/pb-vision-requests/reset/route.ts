import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import {
  adminPreparePbVisionRequestForRetry,
  adminSubmitPbVisionRequestInBackground,
} from '@/lib/pb-vision-admin-reset';

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

    const prepared = await adminPreparePbVisionRequestForRetry(requestId);
    if (!prepared.ok) {
      return NextResponse.json({ error: prepared.error }, { status: prepared.status });
    }

    after(async () => {
      await adminSubmitPbVisionRequestInBackground(requestId);
    });

    return NextResponse.json({
      success: true,
      accepted: true,
      request_id: prepared.request_id,
      message:
        'Request reset. PB Vision submission is running in the background — refresh this page in a few minutes to check status.',
    });
  } catch (error) {
    console.error('[PB Vision Admin Reset] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to reset PB Vision request' },
      { status: 500 }
    );
  }
}
