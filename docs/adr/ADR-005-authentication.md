# ADR-005: Authentication and Channel Linking

**Status:** Accepted
**Date:** 2026-07-18

## Context

The design mandates passwordless/OAuth where practical, short-lived access tokens, rotated refresh tokens (§9.1), and channel identities linked only via one-time codes generated inside the authenticated app (§4.2). The product is Android-first with Thai users, where LINE login is ubiquitous.

## Decision

### Primary sign-in

- **Google Sign-In** (Android-native) and **email OTP** (6-digit, 10-minute expiry, rate-limited) for Phase 1.
- Apple Sign-In is added when the iOS build ships (App Store requirement), not before.
- No passwords are ever stored.

### Tokens

- **Access token:** JWT, 15-minute lifetime, `ES256`, containing only `sub` (userId), `sid` (sessionId), and `iat/exp`. No profile data in the token.
- **Refresh token:** opaque 256-bit random value, stored hashed (SHA-256) in `auth_sessions`, 30-day sliding lifetime, **rotated on every use**; reuse of a rotated token revokes the whole session family (theft detection).
- Mobile stores tokens in Expo SecureStore only.

### Channel linking (LINE / Telegram)

1. Authenticated app requests a link code: 8-character, single-use, 5-minute expiry, stored hashed.
2. User sends `/link <code>` (Telegram) or a link keyword + code (LINE) to the bot.
3. Channel Gateway verifies the code, binds `provider_user_id` to the CherryFin user in `auth_identities`, and both sides get a confirmation message.
4. Identity is never inferred from display names (§4.2). Unlink is available from the app and revokes the binding immediately.

### Google Drive OAuth

- Standard authorization-code flow with PKCE from the mobile app; scope `drive.file` only.
- Refresh tokens encrypted at rest with a KMS-style data key (AES-256-GCM, key id recorded per row) in `connections`.

## Consequences

- Losing the signing key invalidates access tokens only (15-minute blast radius); refresh flow re-issues against the DB.
- Email OTP requires an outbound mail provider from day one — a deliberately boring dependency (SES or Resend).
