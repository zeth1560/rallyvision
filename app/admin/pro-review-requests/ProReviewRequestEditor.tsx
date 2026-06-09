'use client';

import { useState } from 'react';
import {
  ADMIN_PRO_REVIEW_STATUS_OPTIONS,
  isProReviewStatus,
} from '@/lib/pro-review-status';

type ProReviewRequestEditorProps = {
  request: {
    id: string;
    status: string;
    assigned_reviewer_email: string | null;
    reviewer_link: string | null;
    reviewer_notes: string | null;
    assigned_at: string | null;
    completed_at: string | null;
    completed_email_sent_at: string | null;
    failed_at: string | null;
    failure_reason: string | null;
  };
  clipLabel: string;
};

function inputStyle() {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cfcfcf',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  };
}

function labelStyle() {
  return {
    display: 'block',
    marginBottom: '6px',
    fontWeight: 700,
    fontSize: '13px',
  };
}

export default function ProReviewRequestEditor({
  request,
  clipLabel,
}: ProReviewRequestEditorProps) {
  const initialStatus = isProReviewStatus(request.status)
    ? request.status
    : 'ready_for_reviewer';

  const statusOptions =
    initialStatus === 'requested'
      ? (['requested', ...ADMIN_PRO_REVIEW_STATUS_OPTIONS] as string[])
      : [...ADMIN_PRO_REVIEW_STATUS_OPTIONS];

  const [assignedReviewerEmail, setAssignedReviewerEmail] = useState(
    request.assigned_reviewer_email ?? ''
  );
  const [reviewerLink, setReviewerLink] = useState(request.reviewer_link ?? '');
  const [reviewerNotes, setReviewerNotes] = useState(request.reviewer_notes ?? '');
  const [status, setStatus] = useState<string>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completedEmailSentAt, setCompletedEmailSentAt] = useState(
    request.completed_email_sent_at
  );

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/pro-review-requests/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          request_id: request.id,
          assigned_reviewer_email: assignedReviewerEmail,
          reviewer_link: reviewerLink,
          reviewer_notes: reviewerNotes,
          status,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result?.error || 'Failed to save Pro Review request');
        return;
      }

      if (result.completion_email_sent) {
        setCompletedEmailSentAt(new Date().toISOString());
      }

      setSuccess(
        result.completion_email_sent
          ? 'Saved. Completion email sent to the player.'
          : 'Saved.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Pro Review request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #dedede',
        background: '#ffffff',
      }}
    >
      <div
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          marginBottom: '12px',
          color: '#17191c',
        }}
      >
        Admin fulfillment
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div>
          <label htmlFor={`assigned-reviewer-${request.id}`} style={labelStyle()}>
            Assigned reviewer email
          </label>
          <input
            id={`assigned-reviewer-${request.id}`}
            type="email"
            value={assignedReviewerEmail}
            onChange={(event) => setAssignedReviewerEmail(event.target.value)}
            placeholder="coach@example.com"
            style={inputStyle()}
          />
        </div>

        <div>
          <label htmlFor={`reviewer-link-${request.id}`} style={labelStyle()}>
            Reviewer link
          </label>
          <input
            id={`reviewer-link-${request.id}`}
            type="url"
            value={reviewerLink}
            onChange={(event) => setReviewerLink(event.target.value)}
            placeholder="https://..."
            style={inputStyle()}
          />
        </div>

        <div>
          <label htmlFor={`reviewer-notes-${request.id}`} style={labelStyle()}>
            Reviewer notes
          </label>
          <textarea
            id={`reviewer-notes-${request.id}`}
            value={reviewerNotes}
            onChange={(event) => setReviewerNotes(event.target.value)}
            rows={3}
            placeholder="Internal notes for admins and reviewers"
            style={{ ...inputStyle(), resize: 'vertical' }}
          />
        </div>

        <div>
          <label htmlFor={`status-${request.id}`} style={labelStyle()}>
            Status
          </label>
          <select
            id={`status-${request.id}`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={inputStyle()}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '8px 16px',
            fontSize: '0.85rem',
            color: '#555',
          }}
        >
          <div>
            <strong>Assigned at:</strong> {request.assigned_at || '—'}
          </div>
          <div>
            <strong>Completed at:</strong> {request.completed_at || '—'}
          </div>
          <div>
            <strong>Completion email sent:</strong>{' '}
            {completedEmailSentAt ? 'Yes' : 'No'}
          </div>
          {request.failed_at ? (
            <div>
              <strong>Failed at:</strong> {request.failed_at}
            </div>
          ) : null}
        </div>

        {error ? (
          <p style={{ margin: 0, color: '#b00020', fontSize: '0.9rem' }} role="alert">
            {error}
          </p>
        ) : null}

        {success ? (
          <p style={{ margin: 0, color: '#155724', fontSize: '0.9rem' }} role="status">
            {success}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleSave()}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#111111',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>
            Clip: {clipLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
