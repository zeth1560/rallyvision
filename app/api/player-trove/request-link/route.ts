import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  // TODO: Implement magic-link authentication for PlayerTrove
  // For now, return a placeholder response

  return NextResponse.json({
    message: 'Magic-link authentication for PlayerTrove will be implemented next. For development, use GET /api/player-trove?email=...',
    status: 'not_implemented'
  });
}