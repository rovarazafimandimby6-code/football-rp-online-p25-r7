import { readJsonWithBackup, writeJsonWithBackup } from './persistent-json.js';

const STORAGE_KEY = 'football-rp-online.player-profile.v1';
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(n)) ? Number(n) : min));
const cleanText = (value, fallback, max = 24) => String(value ?? fallback).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) || fallback;

export const DEFAULT_ATTRIBUTES = Object.freeze({ pace: 55, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 });
export const KIT_PALETTES = Object.freeze({
  emerald: { primary: '#16834a', secondary: '#0b452b' },
  crimson: { primary: '#dc3a32', secondary: '#551b25' },
  gold: { primary: '#d7a928', secondary: '#514018' },
  violet: { primary: '#8054c7', secondary: '#35204f' },
  monochrome: { primary: '#e5e7eb', secondary: '#30343b' }
});

export function createDefaultProfile() {
  return {
    schemaVersion: 1,
    identity: { displayName: 'Nouveau joueur', number: 10, preferredFoot: 'right', role: 'MID' },
    appearance: { kit: 'emerald', skinTone: 'medium', hairStyle: 'short', hairColor: 'dark', bodyBuild: 'athletic', faceShape:'oval', eyeShape:'almond' },
    progression: { level: 1, experience: 0, coins: 250, trainingPoints: 0, attributes: { ...DEFAULT_ATTRIBUTES } },
    appliedMatchIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function validateProfile(input) {
  const base = createDefaultProfile();
  const p = input && typeof input === 'object' ? input : {};
  const identity = p.identity || {};
  const appearance = p.appearance || {};
  const progression = p.progression || {};
  const attrs = progression.attributes || {};
  return {
    schemaVersion: 1,
    identity: {
      displayName: cleanText(identity.displayName, base.identity.displayName, 20),
      number: Math.round(clamp(identity.number, 1, 99)),
      preferredFoot: ['left', 'right', 'both'].includes(identity.preferredFoot) ? identity.preferredFoot : 'right',
      role: ['GK', 'DEF', 'MID', 'FWD'].includes(identity.role) ? identity.role : 'MID'
    },
    appearance: {
      kit: Object.hasOwn(KIT_PALETTES, appearance.kit) ? appearance.kit : 'emerald',
      skinTone: ['light', 'medium', 'dark'].includes(appearance.skinTone) ? appearance.skinTone : 'medium',
      hairStyle: ['short', 'curly', 'shaved', 'fade', 'afro'].includes(appearance.hairStyle) ? appearance.hairStyle : 'short',
      hairColor: ['dark', 'brown', 'blond'].includes(appearance.hairColor) ? appearance.hairColor : 'dark',
      bodyBuild: ['lean', 'athletic', 'strong'].includes(appearance.bodyBuild) ? appearance.bodyBuild : 'athletic',
      faceShape: ['oval','round','angular','long','square'].includes(appearance.faceShape) ? appearance.faceShape : 'oval',
      eyeShape: ['almond','round','hooded'].includes(appearance.eyeShape) ? appearance.eyeShape : 'almond'
    },
    progression: {
      level: Math.round(clamp(progression.level, 1, 99)),
      experience: Math.round(clamp(progression.level >= 99 ? 0 : progression.experience, 0, 1_000_000_000)),
      coins: Math.round(clamp(progression.coins, 0, 1_000_000_000)),
      trainingPoints: Math.round(clamp(progression.trainingPoints, 0, 100_000)),
      attributes: Object.fromEntries(Object.keys(DEFAULT_ATTRIBUTES).map(k => [k, Math.round(clamp(attrs[k] ?? DEFAULT_ATTRIBUTES[k], 1, 99))]))
    },
    appliedMatchIds: Array.isArray(p.appliedMatchIds) ? [...new Set(p.appliedMatchIds.filter(id => typeof id === 'string' && id.trim()).map(id => id.slice(0, 64)))].slice(-2000) : [],
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : base.createdAt,
    updatedAt: new Date().toISOString()
  };
}

const normalizeStoredProfile = value => value && typeof value === 'object' && !Array.isArray(value) && value.identity && value.progression ? validateProfile(value) : null;

export class PlayerProfileStore {
  constructor(storage, key = STORAGE_KEY) {
    if (storage === undefined) {
      try { storage = globalThis.localStorage; } catch (_) { storage = null; }
    }
    this.storage = storage;
    this.key = key;
    this.profile = createDefaultProfile();
    this.load();
  }
  load() {
    this.profile = readJsonWithBackup(this.storage, this.key, normalizeStoredProfile) || createDefaultProfile();
    return this.profile;
  }
  save(profile = this.profile) {
    this.profile = validateProfile(profile);
    return writeJsonWithBackup(this.storage, this.key, this.profile, normalizeStoredProfile);
  }
  updateIdentity(changes = {}) {
    return this.save({ ...this.profile, identity: { ...this.profile.identity, ...changes } });
  }
  updateAppearance(changes = {}) {
    return this.save({ ...this.profile, appearance: { ...this.profile.appearance, ...changes } });
  }
  grantMatchRewards({ experience = 0, coins = 0, matchId = null } = {}) {
    const id = typeof matchId === 'string' ? matchId.trim().slice(0, 64) : '';
    if (id && this.profile.appliedMatchIds.includes(id)) return { ok: true, duplicate: true, progression: this.profile.progression };
    const p = structuredClone(this.profile);
    p.progression.experience += Math.round(clamp(experience, 0, 100_000));
    p.progression.coins = Math.min(1_000_000_000, p.progression.coins + Math.round(clamp(coins, 0, 100_000)));
    while (p.progression.level < 99 && p.progression.experience >= p.progression.level * 100) {
      p.progression.experience -= p.progression.level * 100;
      p.progression.level++;
      p.progression.trainingPoints += 2;
      p.progression.coins = Math.min(1_000_000_000, p.progression.coins + 50);
    }
    if (p.progression.level >= 99) p.progression.experience = 0;
    if (id) { p.appliedMatchIds.push(id); p.appliedMatchIds = p.appliedMatchIds.slice(-2000); }
    this.save(p);
    return { ok: true, duplicate: false, progression: this.profile.progression };
  }
  addExperience(amount) {
    const p = structuredClone(this.profile);
    if (p.progression.level >= 99) {
      p.progression.experience = 0;
      this.save(p);
      return this.profile.progression;
    }
    p.progression.experience += Math.round(clamp(amount, 0, 100_000));
    let needed = p.progression.level * 100;
    while (p.progression.level < 99 && p.progression.experience >= needed) {
      p.progression.experience -= needed;
      p.progression.level++;
      p.progression.trainingPoints += 2;
      p.progression.coins += 50;
      needed = p.progression.level * 100;
    }
    if (p.progression.level >= 99) p.progression.experience = 0;
    this.save(p);
    return this.profile.progression;
  }
  practice(attribute, amount = 1) {
    if (!Object.hasOwn(DEFAULT_ATTRIBUTES, attribute)) return { ok: false, reason: 'invalid-attribute' };
    const p = structuredClone(this.profile);
    const points = Math.round(clamp(amount, 1, 3));
    const current = p.progression.attributes[attribute];
    const cost = points * 80;
    if (current + points > 99) return { ok: false, reason: 'attribute-cap' };
    if (p.progression.coins < cost) return { ok: false, reason: 'insufficient-coins' };
    p.progression.coins -= cost;
    p.progression.attributes[attribute] += points;
    p.progression.experience += points * 25;
    while (p.progression.level < 99 && p.progression.experience >= p.progression.level * 100) {
      p.progression.experience -= p.progression.level * 100;
      p.progression.level++;
      p.progression.trainingPoints += 2;
      p.progression.coins += 50;
    }
    this.save(p);
    return { ok: true, attribute, value: this.profile.progression.attributes[attribute], spentCoins: cost, progression: this.profile.progression };
  }
  train(attribute, amount = 1) {
    if (!Object.hasOwn(DEFAULT_ATTRIBUTES, attribute)) return { ok: false, reason: 'invalid-attribute' };
    const p = structuredClone(this.profile);
    const points = Math.round(clamp(amount, 1, 5));
    const current = p.progression.attributes[attribute];
    const cost = points * 40;
    if (current + points > 99) return { ok: false, reason: 'attribute-cap' };
    if (p.progression.trainingPoints < points || p.progression.coins < cost) return { ok: false, reason: 'insufficient-resources' };
    p.progression.trainingPoints -= points;
    p.progression.coins -= cost;
    p.progression.attributes[attribute] += points;
    this.save(p);
    return { ok: true, attribute, value: this.profile.progression.attributes[attribute], spentCoins: cost };
  }
  reset() { this.profile = createDefaultProfile(); this.save(); return this.profile; }
}
