// Shown on the setup screen: lets the user either join an existing LAN game
// or read the instructions for hosting one.

import { useState } from 'react';
import { netClient } from './network';

export function HostBanner() {
  const [showJoin, setShowJoin] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [name, setName] = useState('Player');

  return (
    <div className="host-banner">
      <div className="host-banner-row">
        <button className="btn ghost" onClick={() => setShowJoin(s => !s)}>
          {showJoin ? '× cancel' : 'Join LAN game'}
        </button>
        <details className="host-banner-help">
          <summary>Host a LAN game</summary>
          <div className="host-banner-howto">
            Run <code>npm run host</code> in your terminal. Vite + the LAN
            server start side-by-side; the server prints a URL that other
            players on the same Wi-Fi can paste into <strong>Join LAN game</strong>.
          </div>
        </details>
      </div>

      {showJoin && (
        <div className="host-banner-form">
          <label>
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Server URL</span>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="ws://192.168.x.x:8787"
            />
          </label>
          <button
            className="btn primary"
            disabled={!endpoint || !name}
            onClick={() => netClient.connect(endpoint.trim(), name.trim() || 'Player')}
          >
            Connect
          </button>
        </div>
      )}
    </div>
  );
}
