// Landing page when the user isn't connected to a room. Two paths:
//   • Create a new game (POST /api/rooms, then navigate to /r/<id>)
//   • Join an existing game (paste a code or URL)
//
// A third option — single-player offline — is shown below, since the engine
// works fine without a server connection.

import { useState } from 'react';
import { createRoom, checkRoomExists, navigateToRoom } from './network';

interface Props {
  onStartOffline: () => void;
}

export function Home({ onStartOffline }: Props) {
  const [busy, setBusy] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const id = await createRoom();
      navigateToRoom(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onJoin() {
    setBusy(true);
    setError(null);
    // Accept either a bare code or a full URL containing /r/<id>.
    const trimmed = joinValue.trim();
    const match = trimmed.match(/\/r\/([a-z0-9]+)\/?$/i);
    const code = match ? match[1]! : trimmed.toLowerCase();
    if (!code) { setError('Enter a room code or URL.'); setBusy(false); return; }
    try {
      const ok = await checkRoomExists(code);
      if (!ok) { setError(`Room "${code}" not found.`); setBusy(false); return; }
      navigateToRoom(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <h1 className="home-title">Root</h1>
      <p className="home-tagline">A woodland faction war. AI plays the empty seats.</p>

      <div className="home-cards">
        <div className="home-card primary">
          <h2>Host a new game</h2>
          <p>Create a room, then share the link. Up to 4 humans + AI fillers.</p>
          <button className="btn primary" onClick={onCreate} disabled={busy}>
            {busy ? '…' : 'Create game'}
          </button>
        </div>

        <div className="home-card">
          <h2>Join a game</h2>
          <p>Paste a room code or the full link from a host.</p>
          <input
            className="home-input"
            value={joinValue}
            onChange={(e) => setJoinValue(e.target.value)}
            placeholder="e.g. abc234 or https://…/r/abc234"
            onKeyDown={(e) => { if (e.key === 'Enter') onJoin(); }}
            autoFocus
          />
          <button className="btn" onClick={onJoin} disabled={busy || !joinValue.trim()}>
            {busy ? '…' : 'Join'}
          </button>
        </div>

        <div className="home-card secondary">
          <h2>Play offline</h2>
          <p>Solo against three AI factions on this device. No connection needed.</p>
          <button className="btn ghost" onClick={onStartOffline}>Play solo</button>
        </div>
      </div>

      {error && <div className="home-error">{error}</div>}

      <footer className="home-footer">
        <p>
          Rooms are kept on the server until they've been idle for 90 days,
          then automatically removed.
        </p>
      </footer>
    </div>
  );
}
