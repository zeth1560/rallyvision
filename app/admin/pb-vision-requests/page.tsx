import Link from 'next/link';
import { redirect } from 'next/navigation';
import PbVisionRetryButton from '@/app/admin/pb-vision-requests/PbVisionRetryButton';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { formatDateInTimezone } from '@/lib/formatDate';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = [
  'all',
  'requested',
  'submitted',
  'processing',
  'completed',
  'failed',
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

type ClipRelation = {
  id: string;
  title: string | null;
  slug: string | null;
};

type AccessRelation = {
  id: string;
  access_status: string | null;
  pb_vision_expires_at: string | null;
};

type PbVisionRequestRow = {
  id: string;
  created_at: string;
  email: string;
  clip_id: string;
  status: string;
  source_s3_key: string | null;
  pbv_vid: string | null;
  pbv_webpage_url: string | null;
  error_reason: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  callback_received_at: string | null;
  submission_attempt_count: number;
  refund_status: string | null;
  stripe_refund_id: string | null;
  refunded_at: string | null;
  player_video_access_id: string;
  clips: ClipRelation | ClipRelation[] | null;
  player_video_access: AccessRelation | AccessRelation[] | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatTimestamp(value: string | null) {
  if (!value) return '—';
  return formatDateInTimezone(value);
}

function clipLabel(clip: ClipRelation | null, clipId: string) {
  if (!clip) return clipId;
  return clip.title || clip.slug || clipId;
}

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter);
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 700,
    textTransform: 'capitalize',
    letterSpacing: '0.02em',
  };

  switch (status) {
    case 'completed':
      return { ...base, background: '#d4edda', color: '#155724', border: '1px solid #b7dfc5' };
    case 'failed':
      return { ...base, background: '#f8d7da', color: '#721c24', border: '1px solid #f1b0b7' };
    case 'submitted':
      return { ...base, background: '#cce5ff', color: '#004085', border: '1px solid #9ec5fe' };
    case 'processing':
      return { ...base, background: '#fff3cd', color: '#856404', border: '1px solid #ffe69c' };
    case 'requested':
      return { ...base, background: '#e9ecef', color: '#495057', border: '1px solid #ced4da' };
    default:
      return { ...base, background: '#f1f3f5', color: '#343a40', border: '1px solid #dee2e6' };
  }
}

function filterHref(status: StatusFilter) {
  if (status === 'all') {
    return '/admin/pb-vision-requests';
  }
  return `/admin/pb-vision-requests?status=${status}`;
}

export default async function AdminPbVisionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  const { status: statusParam } = await searchParams;
  const activeFilter: StatusFilter = isStatusFilter(statusParam)
    ? statusParam
    : 'all';

  let requestsQuery = supabaseAdmin
    .from('pb_vision_requests')
    .select(
      `
      id,
      created_at,
      email,
      clip_id,
      status,
      source_s3_key,
      pbv_vid,
      pbv_webpage_url,
      error_reason,
      submitted_at,
      completed_at,
      callback_received_at,
      submission_attempt_count,
      refund_status,
      stripe_refund_id,
      refunded_at,
      player_video_access_id,
      clips (id, title, slug),
      player_video_access (id, access_status, pb_vision_expires_at)
    `
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (activeFilter !== 'all') {
    requestsQuery = requestsQuery.eq('status', activeFilter);
  }

  const { data: requestsData, error: requestsError } = await requestsQuery;

  if (requestsError) {
    return (
      <ReplayTrovePageShell
        title="PB Vision Requests"
        subtitle="View PlayerTrove PB Vision submission status."
        maxWidth="1400px"
      >
        <div style={panelStyle}>
          <p style={{ color: '#b00020', fontWeight: 700, marginTop: 0 }}>
            Failed to load PB Vision requests.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{requestsError.message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const requests = (requestsData ?? []) as PbVisionRequestRow[];
  const refreshHref =
    activeFilter === 'all'
      ? '/admin/pb-vision-requests'
      : `/admin/pb-vision-requests?status=${activeFilter}`;

  return (
    <ReplayTrovePageShell
      title="PB Vision Requests"
      subtitle="View PlayerTrove PB Vision submission status."
      maxWidth="1400px"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        <div style={panelStyle}>
          <div style={{ fontSize: '0.95rem', color: '#555' }}>
            Logged in as <strong>{adminUser.email}</strong>
          </div>
          <div style={{ fontSize: '0.95rem', color: '#555', marginTop: '4px' }}>
            Role: <strong>{adminUser.role}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/admin/dashboard" style={navButton}>
            Dashboard
          </Link>
          <Link href={refreshHref} style={navButton}>
            Refresh
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        {STATUS_FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <Link
              key={filter}
              href={filterHref(filter)}
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: '999px',
                border: isActive ? '1px solid #111111' : '1px solid #d0d0d0',
                background: isActive ? '#111111' : '#ffffff',
                color: isActive ? '#ffffff' : '#17191c',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                textTransform: 'capitalize',
              }}
            >
              {filter}
            </Link>
          );
        })}
      </div>

      <div style={panelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '18px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.25rem',
              color: '#17191c',
            }}
          >
            Requests ({requests.length})
          </h2>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>
            Filter: <strong>{activeFilter}</strong>
          </span>
        </div>

        {requests.length === 0 ? (
          <p style={{ margin: 0, color: '#555' }}>No PB Vision requests found.</p>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {requests.map((request) => {
              const clip = normalizeRelation(request.clips);
              const access = normalizeRelation(request.player_video_access);
              const label = clipLabel(clip, request.clip_id);

              return (
                <div
                  key={request.id}
                  style={{
                    padding: '16px 18px',
                    border: '1px solid #ececec',
                    borderRadius: '12px',
                    background: '#fafafa',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px',
                      flexWrap: 'wrap',
                      marginBottom: '12px',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: '#17191c',
                          fontSize: '1.05rem',
                          marginBottom: '4px',
                        }}
                      >
                        {label}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>
                        {request.email}
                      </div>
                    </div>
                    <span style={statusBadgeStyle(request.status)}>{request.status}</span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '10px 16px',
                      fontSize: '0.9rem',
                      color: '#444',
                    }}
                  >
                    <div>
                      <strong>Created:</strong> {formatTimestamp(request.created_at)}
                    </div>
                    <div>
                      <strong>Submitted:</strong> {formatTimestamp(request.submitted_at)}
                    </div>
                    <div>
                      <strong>Completed:</strong> {formatTimestamp(request.completed_at)}
                    </div>
                    <div>
                      <strong>Callback:</strong>{' '}
                      {formatTimestamp(request.callback_received_at)}
                    </div>
                    <div>
                      <strong>Attempts:</strong> {request.submission_attempt_count}
                    </div>
                    <div>
                      <strong>Refund:</strong> {request.refund_status || '—'}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>
                      <strong>Clip ID:</strong> {request.clip_id}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>
                      <strong>PBV VID:</strong> {request.pbv_vid || '—'}
                    </div>
                    <div style={{ wordBreak: 'break-all' }}>
                      <strong>Source S3 key:</strong> {request.source_s3_key || '—'}
                    </div>
                    {access ? (
                      <div>
                        <strong>Access:</strong> {access.access_status || '—'}
                        {access.pb_vision_expires_at
                          ? ` · PB Vision until ${formatTimestamp(access.pb_vision_expires_at)}`
                          : null}
                      </div>
                    ) : null}
                  </div>

                  {request.error_reason ? (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: '#fff5f5',
                        border: '1px solid #f1b0b7',
                        color: '#721c24',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>Error:</strong> {request.error_reason}
                    </div>
                  ) : null}

                  {request.pbv_webpage_url ? (
                    <div style={{ marginTop: '12px' }}>
                      <a
                        href={request.pbv_webpage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={primaryButton}
                      >
                        View PB Vision Results
                      </a>
                    </div>
                  ) : null}

                  {request.refund_status === 'completed' ||
                  request.refund_status === 'skipped_free' ||
                  request.status === 'failed' ||
                  request.status === 'requested' ||
                  request.status === 'processing' ? (
                    <PbVisionRetryButton
                      requestId={request.id}
                      status={request.status}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReplayTrovePageShell>
  );
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '24px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
};

const navButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 18px',
  borderRadius: '10px',
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  color: '#17191c',
  textDecoration: 'none',
  fontWeight: 700,
};

const primaryButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 14px',
  borderRadius: '10px',
  background: '#111111',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600,
};
