import { randomBytes } from 'node:crypto';
import { verifyGoogleIdToken } from './google-id-token-verifier.js';

const validCode = value => typeof value === 'string' && value.length >= 8 && value.length <= 4096 && !/\\s/.test(value);

export function createGoogleAuthorizationUrl({ config, transactionStore, accountId, sessionBinding }) {
  if (!config?.configured || !config.clientId || !config.redirectUri) throw new Error('GOOGLE_OIDC_NOT_CONFIGURED');
  const transaction = transactionStore.create({ accountId, sessionBinding });
  const url = new URL(config.authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account'
  }).toString();
  return { authorizationUrl: url.toString(), expiresAt: transaction.expiresAt };
}

export async function completeGoogleAuthorization({
  config, transactionStore, identityStore, state, code, sessionBinding,
  fetchImpl = globalThis.fetch, jwksCache, now = () => Date.now(), verifyToken = verifyGoogleIdToken
} = {}) {
  if (!config?.configured || !config.clientId || !config.clientSecret || !config.redirectUri) throw new Error('GOOGLE_OIDC_NOT_CONFIGURED');
  if (!validCode(code)) throw new Error('GOOGLE_OIDC_CODE_INVALID');
  if (typeof fetchImpl !== 'function') throw new Error('GOOGLE_OIDC_FETCH_UNAVAILABLE');
  const transaction = transactionStore.consume({ state, sessionBinding });
  if (!transaction?.accountId) throw new Error('GOOGLE_OIDC_TRANSACTION_INVALID');
  const response = await fetchImpl(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      code, client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code',
      code_verifier: transaction.codeVerifier
    }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('GOOGLE_OIDC_TOKEN_EXCHANGE_FAILED');
  const tokens = await response.json();
  if (!tokens || typeof tokens.id_token !== 'string' || tokens.id_token.length > 16_384) throw new Error('GOOGLE_OIDC_ID_TOKEN_MISSING');
  const identity = await verifyToken(tokens.id_token, {
    clientId: config.clientId, expectedNonce: transaction.nonce, jwksCache, now
  });
  const linked = identityStore.linkInitial({
    accountId: transaction.accountId,
    googleSubject: identity.googleSubject,
    googleIdentityVerified: true
  });
  return { linked: true, accountId: linked.accountId, linkedAt: linked.linkedAt };
}

export function createGoogleBrowserBinding() {
  return randomBytes(32).toString('base64url');
}
