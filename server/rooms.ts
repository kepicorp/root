// RoomManager: owns the set of live rooms, persists them to disk, and prunes
// stale ones. Each room is one JSON file under `dataDir/<id>.json`.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Room, type RoomSnapshot } from './room';

const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no l, i, o, 0, 1 to avoid confusion
const ROOM_ID_LEN = 6;
const PERSIST_DEBOUNCE_MS = 500;

export interface RoomManagerOptions {
  dataDir: string;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private pendingPersist = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly dataDir: string;

  constructor(opts: RoomManagerOptions) {
    this.dataDir = resolve(opts.dataDir);
    mkdirSync(this.dataDir, { recursive: true });
    this.loadAll();
  }

  // ─── ID generation ───────────────────────────────────────────────────────

  private generateId(): string {
    let id = '';
    const bytes = randomBytes(ROOM_ID_LEN);
    for (let i = 0; i < ROOM_ID_LEN; i++) {
      id += ROOM_ID_ALPHABET[bytes[i]! % ROOM_ID_ALPHABET.length];
    }
    return id;
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────

  create(): Room {
    let id = this.generateId();
    while (this.rooms.has(id)) id = this.generateId();
    const room = new Room(id);
    room.onPersist((r) => this.schedulePersist(r));
    this.rooms.set(id, room);
    this.schedulePersist(room);
    return room;
  }

  get(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }

  delete(id: string): boolean {
    const r = this.rooms.get(id);
    if (!r) return false;
    r.dispose();
    this.rooms.delete(id);
    const file = this.fileFor(id);
    try { if (existsSync(file)) unlinkSync(file); } catch { /* ignore */ }
    const pending = this.pendingPersist.get(id);
    if (pending) { clearTimeout(pending); this.pendingPersist.delete(id); }
    return true;
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  private fileFor(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  private schedulePersist(room: Room): void {
    const existing = this.pendingPersist.get(room.id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.pendingPersist.delete(room.id);
      this.persistNow(room);
    }, PERSIST_DEBOUNCE_MS);
    this.pendingPersist.set(room.id, t);
  }

  private persistNow(room: Room): void {
    try {
      const snap = room.toSnapshot();
      writeFileSync(this.fileFor(room.id), JSON.stringify(snap));
    } catch (e) {
      console.error(`Failed to persist room ${room.id}:`, e);
    }
  }

  /** Persist all pending rooms immediately (e.g., on shutdown). */
  flush(): void {
    for (const [id, t] of this.pendingPersist) {
      clearTimeout(t);
      const room = this.rooms.get(id);
      if (room) this.persistNow(room);
    }
    this.pendingPersist.clear();
  }

  private loadAll(): void {
    if (!existsSync(this.dataDir)) return;
    const files = readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
    let loaded = 0;
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.dataDir, file), 'utf8');
        const snap = JSON.parse(raw) as RoomSnapshot;
        if (!snap.id) continue;
        const room = Room.fromSnapshot(snap);
        room.onPersist((r) => this.schedulePersist(r));
        this.rooms.set(snap.id, room);
        loaded += 1;
      } catch (e) {
        console.warn(`Skipping unreadable room file ${file}:`, e);
      }
    }
    if (loaded > 0) console.log(`Loaded ${loaded} room${loaded === 1 ? '' : 's'} from ${this.dataDir}`);
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  /**
   * Remove rooms whose lastActivityAt is older than `maxAgeMs` AND have no
   * connected subscribers. Returns the number of rooms removed.
   */
  pruneStale(maxAgeMs: number): { removed: string[]; kept: number } {
    const cutoff = Date.now() - maxAgeMs;
    const removed: string[] = [];
    for (const [id, room] of this.rooms) {
      if (room.hasActiveSubscribers()) continue;
      if (room.lastActivityAt < cutoff) {
        this.delete(id);
        removed.push(id);
      }
    }
    return { removed, kept: this.rooms.size };
  }
}

export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
