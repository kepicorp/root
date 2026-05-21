import { describe, it, expect } from 'vitest';
import { Room } from '../room';

function sub() { return { send: () => { /* noop */ } }; }

describe('Room — rejoin tokens', () => {
  it('issues a token on claimSeat and surfaces it via snapshotFor', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    expect(room.snapshotFor('c1').rejoinToken).toBeNull();

    expect(room.claimSeat('c1', 'marquise')).toBeNull();
    const snap = room.snapshotFor('c1');
    expect(snap.yourFaction).toBe('marquise');
    expect(snap.rejoinToken).toBeTruthy();
    expect(typeof snap.rejoinToken).toBe('string');
  });

  it('lobby disconnect frees the seat (no stickiness before startGame)', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.claimSeat('c1', 'marquise');
    room.disconnect('c1');
    room.connect('c2', 'Bob', sub());
    expect(room.snapshotFor('c2').lobby.seats.marquise).toBeNull();
  });

  it('in-game disconnect keeps the seat reserved and hides the offline ghost from the lobby broadcast', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.connect('c2', 'Bob', sub());
    room.claimSeat('c1', 'marquise');
    room.claimSeat('c2', 'eyrie');
    expect(room.startGame()).toBeNull();

    room.disconnect('c1');
    const bobSnap = room.snapshotFor('c2');
    expect(bobSnap.lobby.seats.marquise).toBe('c1');                      // seat still held
    expect(bobSnap.lobby.players.find(p => p.clientId === 'c1')).toBeUndefined(); // ghost filtered
  });

  it('reconnect with the right token rebinds the seat under a fresh clientId', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.connect('c2', 'Bob', sub());
    room.claimSeat('c1', 'marquise');
    room.claimSeat('c2', 'eyrie');
    const aliceToken = room.snapshotFor('c1').rejoinToken!;
    room.startGame();
    room.disconnect('c1');

    room.connect('c99', 'Alice-reloaded', sub(), aliceToken);
    const snap = room.snapshotFor('c99');
    expect(snap.yourFaction).toBe('marquise');
    expect(snap.rejoinToken).toBe(aliceToken);
    expect(snap.lobby.seats.marquise).toBe('c99');
    // The old clientId is no longer in the players map.
    expect(room.snapshotFor('c1').yourFaction).toBeNull();
  });

  it('reconnect without a token (or with a wrong token) gets a fresh identity, no seat', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.connect('c2', 'Bob', sub());
    room.claimSeat('c1', 'marquise');
    room.claimSeat('c2', 'eyrie');
    room.startGame();
    room.disconnect('c1');

    room.connect('c99', 'Stranger', sub()); // no token
    expect(room.snapshotFor('c99').yourFaction).toBeNull();
    expect(room.snapshotFor('c99').rejoinToken).toBeNull();

    room.connect('c100', 'Wrong-token', sub(), 'a'.repeat(32)); // bogus token of correct length
    expect(room.snapshotFor('c100').yourFaction).toBeNull();
  });

  it('releaseSeat invalidates the token so a follow-up rejoin doesn’t rebind', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.claimSeat('c1', 'marquise');
    const token = room.snapshotFor('c1').rejoinToken!;
    room.releaseSeat('c1');
    expect(room.snapshotFor('c1').rejoinToken).toBeNull();

    room.disconnect('c1');
    room.connect('c2', 'Alice-back', sub(), token);
    expect(room.snapshotFor('c2').yourFaction).toBeNull();
  });

  it('toSnapshot → fromSnapshot preserves the seat token, and reconnect with it rebinds', () => {
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.connect('c2', 'Bob', sub());
    room.claimSeat('c1', 'marquise');
    room.claimSeat('c2', 'eyrie');
    const token = room.snapshotFor('c1').rejoinToken!;
    room.startGame();

    const persisted = room.toSnapshot();
    expect(persisted.seats.marquise).toEqual({ token, displayName: 'Alice' });

    const revived = Room.fromSnapshot(persisted);
    revived.connect('cFresh', 'Outsider', sub());
    expect(revived.snapshotFor('cFresh').yourFaction).toBeNull(); // no token → no seat

    revived.connect('cAlice2', 'Alice', sub(), token);
    expect(revived.snapshotFor('cAlice2').yourFaction).toBe('marquise');
  });

  it('old-format snapshots (string | null seats) load without crashing and grant no identity', () => {
    // Simulate a pre-rejoin-token snapshot where seats were ClientId strings.
    const room = new Room('test');
    room.connect('c1', 'Alice', sub());
    room.claimSeat('c1', 'marquise');
    room.startGame();
    const fresh = room.toSnapshot();
    const legacy = {
      ...fresh,
      seats: { marquise: 'c1', eyrie: null, alliance: null, vagabond: null } as unknown as typeof fresh.seats,
    };
    const revived = Room.fromSnapshot(legacy);
    revived.connect('cAny', 'Anyone', sub());
    expect(revived.snapshotFor('cAny').yourFaction).toBeNull();
  });
});
