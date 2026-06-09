import Link from 'next/link';
import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import ProReviewRequestEditor from '@/app/admin/pro-review-requests/ProReviewRequestEditor';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { formatDateInTimezone } from '@/lib/formatDate';
import { createSignedObjectUrl } from '@/lib/s3';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = [
  'all',
  'requested',
  'ready_for_reviewer',
  'in_review',
  'completed',
  'failed',
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];

type ClipRelation = {
  id: string;
  title: string | null;
  slug: string | null;
};

type ProReviewRequestRow = {
  id: string;
  created_at: string;
  email: string;
  clip_id: string;
  status: string;
  source_s3_key: string | null;
  focus_notes: string | null;
  skill_level: string | null;
  specific_moment_notes: string | null;
  additional_notes: string | null;
  identification_frame_s3_key: string | null;
  buyer_position: string | null;
  player_names: Record<string, string> | null;
  assigned_reviewer_email: string | null;
  reviewer_link: string | null;
  reviewer_notes: string | null;
  assigned_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  completed_email_sent_at: string | null;
  submitted_at: string | null;
  ready_for_reviewer_at: string | null;
  completed_at: string | null;
  clips: ClipRelation | ClipRelation[] | null;
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
    case 'ready_for_reviewer':
      return { ...base, background: '#cce5ff', color: '#004085', border: '1px solid #9ec5fe' };
    case 'in_review':
      return { ...base, background: '#fff3cd', color: '#856404', border: '1px solid #ffe69c' };
    case 'requested':
      return { ...base, background: '#e9ecef', color: '#495057', border: '1px solid #ced4da' };
    default:
      return { ...base, background: '#f1f3f5', color: '#343a40', border: '1px solid #dee2e6' };
  }
}

function filterHref(status: StatusFilter) {
  if (status === 'all') {
    return '/admin/pro-review-requests';
  }
  return `/admin/pro-review-requests?status=${status}`;
}

function formatPosition(position: string | null) {
  if (!position) return '—';
  return position.replace(/_/g, ' ');
}

function getFrameContentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

export default async function AdminProReviewRequestsPage({
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
    .from('pro_review_requests')
    .select(
      `
      id,
      created_at,
      email,
      clip_id,
      status,
      source_s3_key,
      focus_notes,
      skill_level,
      specific_moment_notes,
      additional_notes,
      identification_frame_s3_key,
      buyer_position,
      player_names,
      assigned_reviewer_email,
      reviewer_link,
      reviewer_notes,
      assigned_at,
      failed_at,
      failure_reason,
      completed_email_sent_at,
      submitted_at,
      ready_for_reviewer_at,
      completed_at,
      clips (id, title, slug)
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
        title="Pro Review Requests"
        subtitle="View PlayerTrove Pro Review submission status."
        maxWidth="1400px"
      >
        <div style={panelStyle}>
          <p style={{ color: '#b00020', fontWeight: 700, marginTop: 0 }}>
            Failed to load Pro Review requests.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{requestsError.message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const requests = await Promise.all(
    ((requestsData ?? []) as ProReviewRequestRow[]).map(async (request) => {
      const frameUrl = request.identification_frame_s3_key
        ? await createSignedObjectUrl(
            request.identification_frame_s3_key,
            getFrameContentType(request.identification_frame_s3_key)
          )
        : null;

      return { ...request, frameUrl };
    })
  );

  const refreshHref =
    activeFilter === 'all'
      ? '/admin/pro-review-requests'
      : `/admin/pro-review-requests?status=${activeFilter}`;

  return (
    <ReplayTrovePageShell
      title="Pro Review Requests"
      subtitle="Manage PlayerTrove Pro Review requests and fulfillment."
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
              {filter.replace(/_/g, ' ')}
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
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#17191c' }}>
            Requests ({requests.length})
          </h2>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>
            Filter: <strong>{activeFilter.replace(/_/g, ' ')}</strong>
          </span>
        </div>

        {requests.length === 0 ? (
          <p style={{ margin: 0, color: '#555' }}>No Pro Review requests found.</p>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {requests.map((request) => {
              const clip = normalizeRelation(request.clips);
              const label = clipLabel(clip, request.clip_id);
              const playerNames = request.player_names ?? {};

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
                    <span style={statusBadgeStyle(request.status)}>
                      {request.status.replace(/_/g, ' ')}
                    </span>
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
                      <strong>Ready for reviewer:</strong>{' '}
                      {formatTimestamp(request.ready_for_reviewer_at)}
                    </div>
                    <div>
                      <strong>Completed:</strong> {formatTimestamp(request.completed_at)}
                    </div>
                    <div>
                      <strong>Completion email sent:</strong>{' '}
                      {formatTimestamp(request.completed_email_sent_at)}
                    </div>
                    <div>
                      <strong>Assigned at:</strong> {formatTimestamp(request.assigned_at)}
                    </div>
                    {request.failed_at ? (
                      <div>
                        <strong>Failed at:</strong> {formatTimestamp(request.failed_at)}
                      </div>
                    ) : null}
                    <div style={{ wordBreak: 'break-all' }}>
                      <strong>Source S3 key:</strong> {request.source_s3_key || '—'}
                    </div>
                    <div>
                      <strong>Skill level:</strong> {request.skill_level || '—'}
                    </div>
                    <div>
                      <strong>Buyer position:</strong> {formatPosition(request.buyer_position)}
                    </div>
                    <div>
                      <strong>Assigned reviewer:</strong>{' '}
                      {request.assigned_reviewer_email || '—'}
                    </div>
                  </div>

                  {request.reviewer_notes ? (
                    <div style={{ marginTop: '12px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Reviewer notes:</strong> {request.reviewer_notes}
                    </div>
                  ) : null}

                  {request.failure_reason ? (
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Failure reason:</strong> {request.failure_reason}
                    </div>
                  ) : null}

                  {request.focus_notes ? (
                    <div style={{ marginTop: '12px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Focus notes:</strong> {request.focus_notes}
                    </div>
                  ) : null}

                  {request.specific_moment_notes ? (
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Specific moment:</strong> {request.specific_moment_notes}
                    </div>
                  ) : null}

                  {request.additional_notes ? (
                    <div style={{ marginTop: '8px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Additional notes:</strong> {request.additional_notes}
                    </div>
                  ) : null}

                  {Object.keys(playerNames).length > 0 ? (
                    <div style={{ marginTop: '12px', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      <strong>Player names:</strong>
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                        {Object.entries(playerNames).map(([position, name]) => (
                          <li key={position}>
                            {formatPosition(position)}: {name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {request.frameUrl ? (
                    <div style={{ marginTop: '14px' }}>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          marginBottom: '8px',
                        }}
                      >
                        Identification frame
                      </div>
                      <img
                        src={request.frameUrl}
                        alt={`Identification frame for ${label}`}
                        style={{
                          maxWidth: '100%',
                          borderRadius: '10px',
                          border: '1px solid #dedede',
                        }}
                      />
                    </div>
                  ) : null}

                  {request.reviewer_link ? (
                    <div style={{ marginTop: '12px' }}>
                      <a
                        href={request.reviewer_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={primaryButton}
                      >
                        Open reviewer link
                      </a>
                    </div>
                  ) : null}

                  <ProReviewRequestEditor
                    request={{
                      id: request.id,
                      status: request.status,
                      assigned_reviewer_email: request.assigned_reviewer_email,
                      reviewer_link: request.reviewer_link,
                      reviewer_notes: request.reviewer_notes,
                      assigned_at: formatTimestamp(request.assigned_at),
                      completed_at: formatTimestamp(request.completed_at),
                      completed_email_sent_at: request.completed_email_sent_at,
                      failed_at: request.failed_at
                        ? formatTimestamp(request.failed_at)
                        : null,
                      failure_reason: request.failure_reason,
                    }}
                    clipLabel={label}
                  />
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
