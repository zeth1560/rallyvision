import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import {
  parseUpdateProReviewRequestInput,
  updateProReviewRequestFromAdmin,
} from '@/lib/pro-review-admin-update';

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = parseUpdateProReviewRequestInput(body);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await updateProReviewRequestFromAdmin(parsed.input);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      request: result.request,
      completion_email_sent: result.completion_email_sent,
    });
  } catch (error) {
    console.error('[Pro Review Admin Update] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to update Pro Review request' },
      { status: 500 }
    );
  }
}
