const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

export function readGoogleOidcConfig(env = process.env) {
  const clientId = typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID.trim() : '';
  const clientSecret = typeof env.GOOGLE_CLIENT_SECRET === 'string' ? env.GOOGLE_CLIENT_SECRET.trim() : '';
  const redirectUri = typeof env.GOOGLE_REDIRECT_URI === 'string' ? env.GOOGLE_REDIRECT_URI.trim() : '';
  const missing = [];
  const invalid = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  else if (!clientId.endsWith('.apps.googleusercontent.com')) invalid.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!redirectUri) missing.push('GOOGLE_REDIRECT_URI');
  else {
    try {
      const parsed = new URL(redirectUri);
      const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) invalid.push('GOOGLE_REDIRECT_URI');
      if (parsed.username || parsed.password || parsed.hash) invalid.push('GOOGLE_REDIRECT_URI');
    } catch { invalid.push('GOOGLE_REDIRECT_URI'); }
  }
  const configured = missing.length === 0 && invalid.length === 0;
  return {
    configured,
    clientId: configured ? clientId : null,
    clientSecret: configured ? clientSecret : null,
    redirectUri: configured ? redirectUri : null,
    issuer: GOOGLE_ISSUER,
    authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    jwksUri: GOOGLE_JWKS_URI,
    publicStatus: {
      configured,
      status: configured ? 'configured-awaiting-oidc-integration' : 'not-configured',
      missing,
      invalid
    }
  };
}
