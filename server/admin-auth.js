import { timingSafeEqual } from 'node:crypto';

export function isAdminTokenConfigured(expected = process.env.P27_ADMIN_TOKEN) {
  return typeof expected === 'string' && Buffer.byteLength(expected, 'utf8') >= 32;
}

export function isValidAdminToken(candidate, expected = process.env.P27_ADMIN_TOKEN) {
  if (typeof candidate !== 'string' || !isAdminTokenConfigured(expected)) return false;
  const supplied = Buffer.from(candidate, 'utf8');
  const configured = Buffer.from(expected, 'utf8');
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}
