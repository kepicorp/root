// Admin page at /admin. Password-gated (server enforces; we just send the
// token in Authorization: Bearer). Lets the operator list rooms, delete
// individual rooms, and trigger a stale-room prune with custom day cutoff.

import { useEffect, useState } from 'react';
import type { Faction } from '../engine/types';

const TOKEN_KEY = 'root-admin-token';

interface RoomInfo {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  started: boolean;
  hasActiveSubscribers: boolean;
  claimedFactions: Faction[];
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function fmtRel(when: number): string {
  return `${formatDuration(Date.now() - when)} ago`;
}

function fmtAbs(when: number): string {
  return new Date(when).toLocaleString();
}

const FACTION_COLOR: Record<Faction, string> = {
  marquise: '#d97a3c', eyrie: '#7da3c9', alliance: '#9bbd58', vagabond: '#b8a37a',
};

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

export function Admin() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [passwordInput, setPasswordInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [serverDisabled, setServerDisabled] = useState(false);

  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pruneDays, setPruneDays] = useState(90);
  const [pruneDry, setPruneDry] = useState(true);
  const [pruneResult, setPruneResult] = useState<string | null>(null);

  // Validate the stored token on mount.
  useEffect(() => {
    if (!token) { setAuthed(false); setChecking(false); return; }
    api('/api/admin/check', token, { method: 'POST' }).then(async (r) => {
      if (r.status === 503) {
        setServerDisabled(true);
        setAuthed(false);
      } else if (r.ok) {
        setAuthed(true);
        refresh();
      } else {
        setAuthed(false);
        localStorage.removeItem(TOKEN_KEY);
      }
    }).finally(() => setChecking(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(): Promise<void> {
    setError(null);
    const r = await api('/api/admin/check', passwordInput, { method: 'POST' });
    if (r.status === 503) {
      setServerDisabled(true);
      setError('Admin is disabled on this server (no ADMIN_PASSWORD set).');
      return;
    }
    if (r.ok) {
      localStorage.setItem(TOKEN_KEY, passwordInput);
      setToken(passwordInput);
      setAuthed(true);
      setPasswordInput('');
      refresh();
    } else {
      setError('Wrong password.');
    }
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setAuthed(false);
    setRooms([]);
  }

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const r = await api('/api/admin/rooms', localStorage.getItem(TOKEN_KEY) ?? token);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json() as { rooms: RoomInfo[] };
      setRooms(body.rooms);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoom(id: string): Promise<void> {
    if (!confirm(`Delete room ${id}? This cannot be undone.`)) return;
    const r = await api(`/api/admin/rooms/${id}`, token, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) { setError(`Failed to delete ${id}`); return; }
    refresh();
  }

  async function prune(): Promise<void> {
    setPruneResult(null);
    const r = await api('/api/admin/prune', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: pruneDays, dryRun: pruneDry }),
    });
    if (!r.ok) { setError(`Prune failed: HTTP ${r.status}`); return; }
    const body = await r.json() as {
      dryRun: boolean; removed?: string[]; wouldRemove?: string[]; kept: number;
    };
    const list = body.dryRun ? body.wouldRemove ?? [] : body.removed ?? [];
    setPruneResult(
      body.dryRun
        ? `Would remove ${list.length} room(s): ${list.join(', ') || '(none)'}`
        : `Removed ${list.length} room(s): ${list.join(', ') || '(none)'}`,
    );
    if (!body.dryRun) refresh();
  }

  if (checking) {
    return <div className="admin-page"><div className="admin-loading">Checking…</div></div>;
  }

  if (serverDisabled) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h2>Admin disabled</h2>
          <p>Set <code>ADMIN_PASSWORD</code> on the server to enable this page.</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin-page">
        <div className="admin-card">
          <h2>Admin login</h2>
          <input
            type="password"
            className="admin-input"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') login(); }}
            placeholder="password"
            autoFocus
          />
          <button className="btn primary" onClick={login} disabled={!passwordInput}>
            Sign in
          </button>
          {error && <div className="admin-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin</h1>
        <div className="admin-header-actions">
          <button className="btn ghost" onClick={refresh} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
          <button className="btn ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="admin-section">
        <h2>Prune stale rooms</h2>
        <div className="admin-prune">
          <label>
            Idle longer than
            <input
              type="number"
              min={0}
              value={pruneDays}
              onChange={(e) => setPruneDays(Number(e.target.value))}
            />
            days
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={pruneDry} onChange={(e) => setPruneDry(e.target.checked)} />
            dry-run
          </label>
          <button className="btn primary" onClick={prune}>
            {pruneDry ? 'Preview' : 'Prune now'}
          </button>
        </div>
        {pruneResult && <div className="admin-result">{pruneResult}</div>}
      </section>

      <section className="admin-section">
        <h2>Rooms ({rooms.length})</h2>
        {error && <div className="admin-error">{error}</div>}
        {rooms.length === 0 && !loading ? (
          <p className="dim">No rooms.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>State</th>
                <th>Created</th>
                <th>Last activity</th>
                <th>Live</th>
                <th>Seats</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td><code>{r.id}</code></td>
                  <td>{r.started ? <span className="pill pill-active">in-game</span> : <span className="pill pill-idle">lobby</span>}</td>
                  <td title={fmtAbs(r.createdAt)}>{fmtRel(r.createdAt)}</td>
                  <td title={fmtAbs(r.lastActivityAt)}>{fmtRel(r.lastActivityAt)}</td>
                  <td>{r.hasActiveSubscribers ? <span className="dot dot-live" /> : <span className="dot dot-cold" />}</td>
                  <td>
                    {r.claimedFactions.length === 0 ? <span className="dim">all bots</span> :
                      r.claimedFactions.map((f) => (
                        <span key={f} className="seat-chip" style={{ background: FACTION_COLOR[f] }}>
                          {f[0]!.toUpperCase()}
                        </span>
                      ))}
                  </td>
                  <td>
                    <button className="btn danger" onClick={() => deleteRoom(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
