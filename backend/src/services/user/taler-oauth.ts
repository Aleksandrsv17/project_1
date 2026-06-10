/**
 * Taler ID OAuth bridge. The Bersenev customer app runs the Authorization Code
 * + PKCE flow and sends { code, code_verifier, redirect_uri } here; we exchange
 * the code (client_secret stays server-side), read the user's claims, upsert a
 * Bersenev user linked by taler_sub, and issue the normal Bersenev session.
 *
 * Env: TALER_CLIENT_ID, TALER_CLIENT_SECRET, optional TALER_TOKEN_ENDPOINT,
 * TALER_USERINFO_ENDPOINT.
 */
import { query } from '../../db';
import { signAccessToken, signRefreshToken, generateJti, hashToken, getRefreshTokenExpiresAt } from '../../utils/jwt';
import { toPublicUser, User, PublicUser } from './user.model';
import { AuthTokens } from './user.model';

const TOKEN_ENDPOINT = process.env.TALER_TOKEN_ENDPOINT || 'https://id.taler.tirol/oauth/token';
const USERINFO_ENDPOINT = process.env.TALER_USERINFO_ENDPOINT || 'https://id.taler.tirol/oauth/me';

interface TalerClaims {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  kyc_status?: string;
}

export async function talerOAuthLogin(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const clientId = process.env.TALER_CLIENT_ID;
  const clientSecret = process.env.TALER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Taler OAuth not configured');

  // 1. Exchange the authorization code (client auth = HTTP Basic).
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  if (!tokenRes.ok) throw new Error(`Taler token exchange failed (${tokenRes.status})`);
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  // 2. Read the user's claims.
  const meRes = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
  if (!meRes.ok) throw new Error(`Taler userinfo failed (${meRes.status})`);
  const claims = (await meRes.json()) as TalerClaims;

  const fullName =
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(' ') ||
    (claims.email ? claims.email.split('@')[0] : 'Taler User');
  const [firstName, ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(' ') || firstName;

  // 3. Upsert by taler_sub first, then by email — INCLUDING soft-deleted rows.
  // The unique index on taler_sub (and email) still covers a soft-deleted row,
  // so inserting a fresh one after the user deleted their account would 409.
  // Instead we find the existing (possibly deleted) row and REACTIVATE it.
  let row: User | undefined =
    (await query<User>(`SELECT * FROM users WHERE taler_sub = $1 LIMIT 1`, [claims.sub])).rows[0] ??
    (claims.email
      ? (await query<User>(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [claims.email])).rows[0]
      : undefined);

  if (row) {
    // Re-login with Taler restores a soft-deleted account (clears deleted_at).
    row = (await query<User>(
      `UPDATE users SET taler_sub = $1, deleted_at = NULL, phone = COALESCE(phone, $2),
         kyc_status = COALESCE($3, kyc_status), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [claims.sub, claims.phone_number ?? null, claims.kyc_status?.toLowerCase() ?? null, row.id]
    )).rows[0];
  } else {
    row = (await query<User>(
      `INSERT INTO users (first_name, last_name, email, phone, role, taler_sub, kyc_status, password_hash)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6, '') RETURNING *`,
      [
        firstName,
        lastName,
        claims.email ?? `${claims.sub}@taler.local`,
        claims.phone_number ?? null,
        claims.sub,
        claims.kyc_status?.toLowerCase() ?? 'pending',
      ]
    )).rows[0];
  }

  if (!row) throw new Error('Failed to upsert Taler user');

  // 4. Issue a Bersenev session (mirrors generateAndStoreTokens).
  const jti = generateJti();
  const accessToken = signAccessToken({ sub: row.id, email: row.email, role: row.role });
  const refreshToken = signRefreshToken(row.id, jti);
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    row.id,
    hashToken(refreshToken),
    getRefreshTokenExpiresAt(),
  ]);

  return {
    user: toPublicUser(row),
    tokens: { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 15 * 60 },
  };
}
