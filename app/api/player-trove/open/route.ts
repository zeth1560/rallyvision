import { NextRequest, NextResponse } from 'next/server';
import {
  getPlayerTrovePublicBaseUrl,
  PLAYER_TROVE_TOKEN_COOKIE,
  PLAYER_TROVE_TOKEN_COOKIE_MAX_AGE,
} from '@/lib/player-trove-auth';
import { verifyPlayerTroveToken } from '@/lib/player-trove-token';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim();
  const baseUrl = getPlayerTrovePublicBaseUrl();

  if (!token) {
    return NextResponse.redirect(new URL('/player-trove/request', baseUrl));
  }

  const verified = verifyPlayerTroveToken(token);
  if (!verified) {
    return NextResponse.redirect(
      new URL('/player-trove/request?error=expired', baseUrl)
    );
  }

  const redirectUrl = new URL('/player-trove', baseUrl);
  redirectUrl.searchParams.set('token', token);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(PLAYER_TROVE_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: PLAYER_TROVE_TOKEN_COOKIE_MAX_AGE,
    path: '/',
  });

  return response;
}
