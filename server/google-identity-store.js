import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const cleanSubject = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,255}$/.test(value) ? value : null;
const validTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

/**
 * Persistent one-to-one mapping between verified Google OIDC subjects and P27 accounts.
 * Callers MUST verify the Google ID token (signature, issuer, audience, expiry, nonce
 * and transaction binding) before passing googleIdentityVerified=true.
 */
export class JsonGoogleIdentityStore {
  constructor(directory, { now = () => Date.now() } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'google-identities.json');
    this.now = now;
    mkdirSync(this.directory, { recursive: true });
    this.state = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.links) || !Array.isArray(parsed.audit)) throw new Error('bad schema');
      const links = parsed.links.filter(row =>
        row && validUuid(row.accountId) && cleanSubject(row.googleSubject) &&
        validTimestamp(row.linkedAt)
      );
      const audit = parsed.audit.filter(row =>
        row && validUuid(row.id) && validUuid(row.accountId) &&
        ['google_linked', 'google_transferred'].includes(row.type) && validTimestamp(row.at) &&
        (row.type !== 'google_transferred' ||
          (cleanSubject(row.previousSubject) && cleanSubject(row.newSubject) && row.previousSubject !== row.newSubject))
      );
      if (links.length !== parsed.links.length || audit.length !== parsed.audit.length ||
          new Set(links.map(row => row.accountId)).size !== links.length ||
          new Set(links.map(row => row.googleSubject)).size !== links.length) throw new Error('invalid or duplicate identity rows');
      return { version: 1, links, audit: audit.slice(-10_000) };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, links: [], audit: [] };
      throw new Error('GOOGLE_IDENTITY_STORE_CORRUPT');
    }
  }

  persist() {
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
  }

  transaction(mutator) {
    const previous = this.state;
    this.state = structuredClone(previous);
    try {
      const result = mutator();
      this.persist();
      return result;
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }

  getByGoogleSubject(googleSubject) {
    const subject = cleanSubject(googleSubject);
    if (!subject) return null;
    const link = this.state.links.find(row => row.googleSubject === subject);
    return link ? { accountId: link.accountId, linkedAt: link.linkedAt } : null;
  }

  getByAccountId(accountId) {
    if (!validUuid(accountId)) return null;
    const link = this.state.links.find(row => row.accountId === accountId);
    return link ? { googleSubject: link.googleSubject, linkedAt: link.linkedAt } : null;
  }

  linkInitial({ accountId, googleSubject, googleIdentityVerified = false } = {}) {
    const subject = cleanSubject(googleSubject);
    if (!validUuid(accountId)) throw new Error('INVALID_ACCOUNT_ID');
    if (!subject) throw new Error('INVALID_GOOGLE_SUBJECT');
    if (googleIdentityVerified !== true) throw new Error('GOOGLE_IDENTITY_NOT_VERIFIED');
    return this.transaction(() => {
      if (this.state.links.some(row => row.accountId === accountId)) throw new Error('ACCOUNT_ALREADY_LINKED');
      if (this.state.links.some(row => row.googleSubject === subject)) throw new Error('GOOGLE_ALREADY_LINKED');
      const linkedAt = new Date(this.now()).toISOString();
      this.state.links.push({ accountId, googleSubject: subject, linkedAt });
      this.state.audit.push({ id: randomUUID(), accountId, type: 'google_linked', at: linkedAt });
      this.state.audit = this.state.audit.slice(-10_000);
      return { accountId, linkedAt };
    });
  }

  transfer({
    accountId, currentGoogleSubject, newGoogleSubject,
    currentIdentityVerified = false, newIdentityVerified = false,
    confirmed = false
  } = {}) {
    const currentSubject = cleanSubject(currentGoogleSubject);
    const newSubject = cleanSubject(newGoogleSubject);
    if (!validUuid(accountId)) throw new Error('INVALID_ACCOUNT_ID');
    if (!currentSubject || !newSubject) throw new Error('INVALID_GOOGLE_SUBJECT');
    if (currentIdentityVerified !== true || newIdentityVerified !== true) throw new Error('GOOGLE_IDENTITY_NOT_VERIFIED');
    if (confirmed !== true) throw new Error('GOOGLE_TRANSFER_NOT_CONFIRMED');
    if (currentSubject === newSubject) throw new Error('GOOGLE_IDENTITY_UNCHANGED');

    return this.transaction(() => {
      const current = this.state.links.find(row => row.accountId === accountId);
      if (!current || current.googleSubject !== currentSubject) throw new Error('CURRENT_GOOGLE_MISMATCH');
      if (this.state.links.some(row => row.googleSubject === newSubject)) throw new Error('GOOGLE_ALREADY_LINKED');
      const transferredAt = new Date(this.now()).toISOString();
      current.googleSubject = newSubject;
      current.linkedAt = transferredAt;
      this.state.audit.push({
        id: randomUUID(), accountId, type: 'google_transferred',
        previousSubject: currentSubject, newSubject, at: transferredAt
      });
      this.state.audit = this.state.audit.slice(-10_000);
      return { accountId, linkedAt: transferredAt };
    });
  }
}
