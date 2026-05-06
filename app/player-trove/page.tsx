'use client';

import { Suspense } from 'react';
import PlayerTroveContent from './PlayerTroveContent';

export default function PlayerTrovePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayerTroveContent />
    </Suspense>
  );
}