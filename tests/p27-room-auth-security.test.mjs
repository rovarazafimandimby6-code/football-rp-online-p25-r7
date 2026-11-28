import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/room-manager.js';

const joinHuman = (manager, roomId, displayName, accountId) =>
  manager.join(roomId, { displayName, accountId });

test('P27 sécurité des salons : les vues publiques ne divulguent aucun secret de contrôle', () => {
  const manager = new RoomManager();
  const room = manager.create({ name: 'Audit confidentialité' });
  const joined = joinHuman(manager, room.id, 'Joueur privé', 'account-private');

  const publicStates = [
    manager.get(room.id),
    manager.getDelta(room.id).state,
    joined.state,
  ];
  for (const state of publicStates) {
    const player = state.players.find(item => item.id === joined.playerId);
    assert.ok(player);
    for (const field of ['token', 'tokenHash', 'accountId', 'careerPlayerId', 'input', 'lastInputSequence', 'lastSeen', 'disconnectedAt', 'lastActionAt']) {
      assert.equal(Object.hasOwn(player, field), false, `champ privé exposé : ${field}`);
    }
  }

  const listed = manager.list().find(item => item.id === room.id);
  assert.ok(listed);
  for (const field of ['token', 'accountId', 'players', 'careerPlayerId']) {
    assert.equal(Object.hasOwn(listed, field), false, `métadonnée privée exposée : ${field}`);
  }
});

test('P27 sécurité des salons : un jeton invalide ne peut agir sur aucune route de contrôle', () => {
  const manager = new RoomManager();
  const room = manager.create({ name: 'Audit authentification' });
  const joined = joinHuman(manager, room.id, 'Joueur titulaire', 'account-owner');
  const invalidToken = 'x'.repeat(joined.token.length);
  const player = manager.rooms.get(room.id).players.get(joined.playerId);
  const before = {
    connected: player.connected,
    aiControlled: player.aiControlled,
    sequence: player.lastInputSequence,
    input: { ...player.input },
  };

  assert.throws(() => manager.submitInput(room.id, invalidToken, { x: 1, z: 0, sequence: 1 }), /UNAUTHORIZED/);
  assert.throws(() => manager.reconnect(room.id, invalidToken), /UNAUTHORIZED/);
  assert.throws(() => manager.heartbeat(room.id, invalidToken), /UNAUTHORIZED/);
  assert.throws(() => manager.rotate(room.id, invalidToken, { outgoingId: joined.playerId, incomingId: 'bot' }), /UNAUTHORIZED/);
  assert.throws(() => manager.leave(room.id, invalidToken), /UNAUTHORIZED/);

  assert.equal(player.connected, before.connected);
  assert.equal(player.aiControlled, before.aiControlled);
  assert.equal(player.lastInputSequence, before.sequence);
  assert.deepEqual(player.input, before.input);
});

test('P27 sécurité des salons : une reconnexion valide reprend le même avatar sans créer de doublon', () => {
  const manager = new RoomManager();
  const room = manager.create({ name: 'Reconnexion légitime' });
  const joined = joinHuman(manager, room.id, 'Joueur de retour', 'account-returning');
  const internal = manager.rooms.get(room.id);
  const original = internal.players.get(joined.playerId);

  manager.leave(room.id, joined.token);
  assert.equal(original.connected, false);
  assert.equal(original.aiControlled, true);

  const resumed = manager.reconnect(room.id, joined.token);
  assert.equal(resumed.reconnected, true);
  assert.equal(resumed.state.players.filter(player => player.id === joined.playerId).length, 1);
  assert.equal(internal.players.get(joined.playerId), original);
  assert.equal(original.connected, true);
  assert.equal(original.aiControlled, false);
  assert.equal(original.controlMode, 'human');
  assert.equal(resumed.nextSequence, Math.max(1, original.lastInputSequence + 1));
});

test('P27 sécurité des salons : un compte ou un joueur de carrière ne peut créer deux avatars dans le même match', () => {
  const manager = new RoomManager();
  const room = manager.create({ name: 'Un joueur, un avatar' });
  const first = manager.join(room.id, {
    displayName: 'Joueur titulaire',
    accountId: 'account-unique',
    careerPlayerId: 'FRP-123456',
  });
  assert.throws(() => manager.join(room.id, {
    displayName: 'Deuxième appareil',
    accountId: 'account-unique',
    careerPlayerId: 'FRP-654321',
  }), /PLAYER_ALREADY_IN_ROOM/);
  assert.throws(() => manager.join(room.id, {
    displayName: 'Deuxième compte',
    accountId: 'account-other',
    careerPlayerId: 'FRP-123456',
  }), /PLAYER_ALREADY_IN_ROOM/);
  const players = [...manager.rooms.get(room.id).players.values()].filter(player => !player.isBot);
  assert.equal(players.length, 1);
  assert.equal(players[0].id, first.playerId);
});
