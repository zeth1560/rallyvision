'use client';

import { useEffect, useState, useTransition } from 'react';

type Club = {
  id: string;
  name: string | null;
};

type Props = {
  clubs: Club[];
  action: (formData: FormData) => Promise<void>;
};

const STORAGE_KEY = 'replaytrove_selected_club_id';

export default function AddCourtForm({ clubs, action }: Props) {
  const [selectedClubId, setSelectedClubId] = useState('');
  const [courtName, setCourtName] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load saved selection
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved && clubs.find((c) => c.id === saved)) {
      setSelectedClubId(saved);
    } else if (clubs.length > 0) {
      setSelectedClubId(clubs[0].id);
    }
  }, [clubs]);

  function handleClubChange(value: string) {
    setSelectedClubId(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      try {
        await action(formData);
        setCourtName(''); // reset ONLY court name
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add court');
      }
    });
  }

  return (
    <form action={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
      {/* CLUB SELECT */}
      <div>
        <label style={label}>Club</label>
        <select
          name="club_id"
          value={selectedClubId || ''}
          onChange={(e) => handleClubChange(e.target.value)}
          required
          style={input}
        >
          <option value="" disabled>
            Select a club
          </option>
          {clubs.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name || 'Unnamed Club'}
            </option>
          ))}
        </select>
      </div>

      {/* COURT NAME */}
      <div>
        <label style={label}>Court Name</label>
        <input
          name="court_name"
          value={courtName}
          onChange={(e) => setCourtName(e.target.value)}
          placeholder="Court 1"
          required
          style={input}
        />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <button type="submit" style={button} disabled={isPending}>
        {isPending ? 'Adding...' : 'Add Court'}
      </button>
    </form>
  );
}

/* ---------- styles ---------- */

const label: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: 600,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: '1px solid #d6d6d6',
};

const button: React.CSSProperties = {
  padding: '12px',
  borderRadius: '10px',
  border: 'none',
  background: '#111',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  padding: '10px',
  background: '#ffeaea',
  border: '1px solid #ffbdbd',
  borderRadius: '8px',
  color: '#a10000',
};