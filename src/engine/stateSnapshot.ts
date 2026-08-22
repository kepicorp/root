import type { Faction, GameState } from './types';

export const STATE_SNAPSHOT_FORMAT = 'root-state-v1';

export interface StateSnapshotContext {
  source: 'offline' | 'online';
  playerFaction: Faction | null;
  roomId?: string | null;
  autoFillBots?: boolean;
}

export interface StateSnapshotFile {
  format: typeof STATE_SNAPSHOT_FORMAT;
  version: 1;
  savedAt: string;
  context: StateSnapshotContext;
  state: GameState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFactionOrNull(value: unknown): value is Faction | null {
  return value === null || value === 'marquise' || value === 'eyrie' || value === 'alliance' || value === 'vagabond';
}

function isLikelyGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  if (typeof value.seed !== 'number') return false;
  if (typeof value.turn !== 'number') return false;
  if (typeof value.activeIndex !== 'number') return false;
  if (!Array.isArray(value.factionOrder)) return false;
  if (!isRecord(value.factions)) return false;
  if (!isRecord(value.map)) return false;
  if (!isRecord((value.map as Record<string, unknown>).clearings)) return false;
  if (!isRecord(value.hands)) return false;
  if (!isRecord(value.scores)) return false;
  if (!Array.isArray(value.pendingPrompts)) return false;
  if (!Array.isArray(value.log)) return false;
  if (!Array.isArray(value.deck)) return false;
  if (!Array.isArray(value.discard)) return false;
  return true;
}

export function buildStateSnapshot(
  state: GameState,
  context: StateSnapshotContext,
  savedAt = new Date().toISOString(),
): StateSnapshotFile {
  return {
    format: STATE_SNAPSHOT_FORMAT,
    version: 1,
    savedAt,
    context,
    state,
  };
}

function coerceSnapshot(input: unknown): StateSnapshotFile {
  if (isLikelyGameState(input)) {
    return {
      format: STATE_SNAPSHOT_FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      context: { source: 'offline', playerFaction: null },
      state: input,
    };
  }

  if (!isRecord(input)) {
    throw new Error('Snapshot must be a JSON object.');
  }
  if (input.format !== STATE_SNAPSHOT_FORMAT) {
    throw new Error(`Unsupported snapshot format: ${String(input.format)}.`);
  }
  if (input.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${String(input.version)}.`);
  }
  if (!isLikelyGameState(input.state)) {
    throw new Error('Snapshot is missing a valid game state.');
  }
  if (!isRecord(input.context)) {
    throw new Error('Snapshot context is missing.');
  }
  const source = input.context.source;
  if (source !== 'offline' && source !== 'online') {
    throw new Error('Snapshot context source must be "offline" or "online".');
  }
  if (!isFactionOrNull(input.context.playerFaction)) {
    throw new Error('Snapshot playerFaction is invalid.');
  }

  const roomId = input.context.roomId;
  if (roomId !== undefined && roomId !== null && typeof roomId !== 'string') {
    throw new Error('Snapshot roomId must be a string when provided.');
  }
  const autoFillBots = input.context.autoFillBots;
  if (autoFillBots !== undefined && typeof autoFillBots !== 'boolean') {
    throw new Error('Snapshot autoFillBots must be a boolean when provided.');
  }

  return {
    format: STATE_SNAPSHOT_FORMAT,
    version: 1,
    savedAt: typeof input.savedAt === 'string' ? input.savedAt : new Date().toISOString(),
    context: {
      source,
      playerFaction: input.context.playerFaction,
      roomId: typeof roomId === 'string' ? roomId : null,
      autoFillBots,
    },
    state: input.state,
  };
}

export function parseStateSnapshotPayload(input: unknown): StateSnapshotFile {
  return coerceSnapshot(input);
}

export function parseStateSnapshotText(text: string): StateSnapshotFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Snapshot file is not valid JSON.');
  }
  return coerceSnapshot(parsed);
}

export function serializeStateSnapshot(snapshot: StateSnapshotFile): string {
  return JSON.stringify(snapshot, null, 2);
}
