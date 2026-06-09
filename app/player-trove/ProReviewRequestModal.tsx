'use client';

import { useState } from 'react';
import {
  BUYER_POSITIONS,
  type BuyerPosition,
  type PlayerNames,
} from '@/lib/pro-review-types';

type VideoContext = {
  access_id: string;
  clip_title: string | null;
};

type ProReviewRequestModalProps = {
  video: VideoContext;
  token: string;
  useCookieAuth?: boolean;
  initialRequestId?: string | null;
  onClose: () => void;
  onSubmitted: (patch: {
    pro_review_request_id: string;
    pro_review_status: string;
  }) => void;
};

function authFetchInit(
  token: string,
  useCookieAuth: boolean | undefined,
  body: Record<string, unknown>
) {
  return {
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include' as const,
    body: JSON.stringify({
      ...body,
      token: useCookieAuth ? undefined : token,
    }),
  };
}

type Step = 1 | 2 | 3 | 4;

const POSITION_LABELS: Record<BuyerPosition, string> = {
  top_left: 'Top Left',
  top_right: 'Top Right',
  bottom_left: 'Bottom Left',
  bottom_right: 'Bottom Right',
};

const SKILL_LEVELS = [
  'Beginner (2.0–2.5)',
  'Intermediate (3.0–3.5)',
  'Advanced (4.0–4.5)',
  'Competitive (5.0+)',
];

function fieldLabel(text: string) {
  return (
    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '14px' }}>
      {text}
    </label>
  );
}

function textInputStyle() {
  return {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid #cfcfcf',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  };
}

function IdentificationFrame({
  frameUrl,
  selectedPosition,
}: {
  frameUrl: string | null;
  selectedPosition?: BuyerPosition | null;
}) {
  if (!frameUrl) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
        Loading identification frame...
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid #dedede',
        background: '#f5f5f5',
      }}
    >
      <img
        src={frameUrl}
        alt="Player identification frame"
        style={{ width: '100%', display: 'block' }}
      />
      {selectedPosition ? (
        <p
          style={{
            margin: 0,
            padding: '10px 12px',
            fontSize: '13px',
            color: '#444',
            background: '#ffffff',
            borderTop: '1px solid #dedede',
          }}
        >
          You selected <strong>{POSITION_LABELS[selectedPosition]}</strong>
        </p>
      ) : null}
    </div>
  );
}

export default function ProReviewRequestModal({
  video,
  token,
  useCookieAuth,
  initialRequestId,
  onClose,
  onSubmitted,
}: ProReviewRequestModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusNotes, setFocusNotes] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [specificMomentNotes, setSpecificMomentNotes] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [buyerPosition, setBuyerPosition] = useState<BuyerPosition | null>(null);
  const [playerNames, setPlayerNames] = useState<PlayerNames>({});

  async function startProReview() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/player-trove/pro-review/start',
        authFetchInit(token, useCookieAuth, {
          access_id: video.access_id,
        })
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result?.error || 'Failed to start Pro Review request');
        return;
      }

      setRequestId(result.request_id);
      setFrameUrl(result.identification_frame_url);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Pro Review request');
    } finally {
      setLoading(false);
    }
  }

  async function handleNextFrame() {
    if (!requestId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/player-trove/pro-review/next-frame',
        authFetchInit(token, useCookieAuth, {
          request_id: requestId,
        })
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result?.error || 'Failed to load the next frame');
        return;
      }

      setFrameUrl(result.identification_frame_url);
      setBuyerPosition(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the next frame');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!requestId || !buyerPosition) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        '/api/player-trove/pro-review/submit',
        authFetchInit(token, useCookieAuth, {
          request_id: requestId,
          focus_notes: focusNotes,
          skill_level: skillLevel,
          specific_moment_notes: specificMomentNotes,
          additional_notes: additionalNotes,
          buyer_position: buyerPosition,
          player_names: playerNames,
        })
      );
      const result = await response.json();

      if (!response.ok) {
        setError(result?.error || 'Failed to submit Pro Review request');
        return;
      }

      onSubmitted({
        pro_review_request_id: result.request_id,
        pro_review_status: result.status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit Pro Review request');
    } finally {
      setLoading(false);
    }
  }

  function handleStep1Continue() {
    if (!focusNotes.trim()) {
      setError('Please describe what you would like the coach to focus on.');
      return;
    }
    if (!skillLevel.trim()) {
      setError('Please select your skill level.');
      return;
    }
    setError(null);
    void startProReview();
  }

  function handlePositionSelect(position: BuyerPosition | 'none') {
    if (position === 'none') {
      void handleNextFrame();
      return;
    }

    setBuyerPosition(position);
    setPlayerNames({});
    setError(null);
    setStep(3);
  }

  function otherPositions(): BuyerPosition[] {
    if (!buyerPosition) return [];
    return BUYER_POSITIONS.filter((position) => position !== buyerPosition);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-review-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2 id="pro-review-modal-title" style={{ margin: '0 0 4px', fontSize: '1.25rem' }}>
              Pro Review Request
            </h2>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              {video.clip_title || 'Your video'} · Step {step} of 4
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '1.5rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: '#666',
            }}
          >
            ×
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#fff1f1',
              border: '1px solid #f1c5c5',
              color: '#a12626',
              fontSize: '14px',
            }}
          >
            {error}
          </div>
        ) : null}

        {step === 1 ? (
          <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
            <div>
              {fieldLabel('What would you like the coach to focus on? *')}
              <textarea
                value={focusNotes}
                onChange={(event) => setFocusNotes(event.target.value)}
                rows={3}
                placeholder="e.g. Third-shot drops, court positioning, dinking strategy"
                style={{ ...textInputStyle(), resize: 'vertical' }}
              />
            </div>
            <div>
              {fieldLabel('Your skill level *')}
              <select
                value={skillLevel}
                onChange={(event) => setSkillLevel(event.target.value)}
                style={textInputStyle()}
              >
                <option value="">Select skill level</option>
                {SKILL_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel('Specific moment or rally (optional)')}
              <textarea
                value={specificMomentNotes}
                onChange={(event) => setSpecificMomentNotes(event.target.value)}
                rows={2}
                placeholder="e.g. Around 12:30 in the video"
                style={{ ...textInputStyle(), resize: 'vertical' }}
              />
            </div>
            <div>
              {fieldLabel('Additional notes (optional)')}
              <textarea
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                rows={2}
                placeholder="Anything else the coach should know"
                style={{ ...textInputStyle(), resize: 'vertical' }}
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleStep1Continue}
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: '#111111',
                color: '#ffffff',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Loading frame...' : 'Continue'}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              Which player are you in this frame?
            </p>
            <IdentificationFrame frameUrl={frameUrl} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {BUYER_POSITIONS.map((position) => (
                <button
                  key={position}
                  type="button"
                  disabled={loading || !frameUrl}
                  onClick={() => handlePositionSelect(position)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cfcfcf',
                    background: '#ffffff',
                    fontWeight: 600,
                    cursor: loading || !frameUrl ? 'not-allowed' : 'pointer',
                  }}
                >
                  {POSITION_LABELS[position]}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={loading || !frameUrl}
              onClick={() => handlePositionSelect('none')}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cfcfcf',
                background: '#f8f9fa',
                fontWeight: 600,
                cursor: loading || !frameUrl ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Loading next frame...' : 'None of these are me'}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: 0,
                border: 'none',
                background: 'none',
                color: '#007bff',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px',
                justifySelf: 'start',
              }}
            >
              Back to questionnaire
            </button>
          </div>
        ) : null}

        {step === 3 && buyerPosition ? (
          <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
              Enter names for the other players based on their court position (optional).
            </p>
            <IdentificationFrame frameUrl={frameUrl} selectedPosition={buyerPosition} />
            {otherPositions().map((position) => (
              <div key={position}>
                {fieldLabel(`${POSITION_LABELS[position]} player name`)}
                <input
                  type="text"
                  value={playerNames[position] ?? ''}
                  onChange={(event) =>
                    setPlayerNames((current) => ({
                      ...current,
                      [position]: event.target.value,
                    }))
                  }
                  placeholder="Optional"
                  style={textInputStyle()}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cfcfcf',
                  background: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep(4);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#111111',
                  color: '#ffffff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 && buyerPosition ? (
          <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Confirm your Pro Review request</p>
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: '#f8f9fa',
                border: '1px solid #e9ecef',
                fontSize: '14px',
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong>Focus:</strong> {focusNotes}
              </div>
              <div>
                <strong>Skill level:</strong> {skillLevel}
              </div>
              {specificMomentNotes.trim() ? (
                <div>
                  <strong>Specific moment:</strong> {specificMomentNotes}
                </div>
              ) : null}
              {additionalNotes.trim() ? (
                <div>
                  <strong>Additional notes:</strong> {additionalNotes}
                </div>
              ) : null}
              <div>
                <strong>Your position:</strong> {POSITION_LABELS[buyerPosition]}
              </div>
              {otherPositions().map((position) =>
                playerNames[position]?.trim() ? (
                  <div key={position}>
                    <strong>{POSITION_LABELS[position]}:</strong> {playerNames[position]}
                  </div>
                ) : null
              )}
            </div>
            <IdentificationFrame frameUrl={frameUrl} selectedPosition={buyerPosition} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(3)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cfcfcf',
                  background: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSubmit()}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#ffc107',
                  color: '#111111',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? 'Submitting...' : 'Submit Pro Review Request'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
