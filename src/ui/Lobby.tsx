// Multiplayer lobby UI. Shown when connected to a server, before the game
// starts. Each connected player can claim one faction seat; unclaimed seats
// will be filled by AI bots.

import { useEffect, useState } from 'react';
import type { Faction } from '../engine/types';
import { ALL_FACTIONS } from '../engine/types';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
import { netClient } from './network';
import { useNetGame } from './networkStore';
import { factionIcon } from './../assets';

const FACTION_LABEL: Record<Faction, string> = {
  marquise: 'Marquise de Cat',
  eyrie:    'Eyrie Dynasties',
  alliance: 'Woodland Alliance',
  vagabond: 'Vagabond',
};
const FACTION_COLOR: Record<Faction, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
};
const CHARACTERS: VagabondCharacter[] = ['thief', 'tinker', 'ranger'];

export function Lobby() {
  const net = useNetGame((s) => s.net);
  const [showVagabondPicker, setShowVagabondPicker] = useState(false);
  const [draftName, setDraftName] = useState('');
  const lobby = net.lobby;
  const myId = net.clientId;
  const yourFaction = net.yourFaction;
  const me = myId && lobby ? lobby.players.find((p) => p.clientId === myId) : null;
  const currentName = me?.displayName ?? 'Player';
  useEffect(() => {
    setDraftName(currentName);
  }, [currentName]);
  if (!lobby) return null;
  const claimedCount = Object.values(lobby.seats).filter((seat) => seat !== null).length;
  const canStart = claimedCount > 0;

  return (
    <div className="lobby">
      <h2>Lobby</h2>
      <p className="lobby-endpoint">
        Connected to <code>{net.endpoint}</code>
        <button className="btn ghost small" onClick={() => netClient.disconnect()}>
          disconnect
        </button>
      </p>

      <div className="lobby-players">
        <div className="lobby-section-label">Your name</div>
        <div className="character-row">
          <input
            className="home-input"
            value={draftName}
            maxLength={32}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Choose a name"
            aria-label="Your display name"
          />
          <button
            className="btn"
            onClick={() => {
              netClient.setDisplayName(draftName);
            }}
            disabled={draftName.trim().length === 0 || draftName.trim() === currentName}
          >
            Save name
          </button>
        </div>
        <div className="lobby-section-label">Players</div>
        {lobby.players.length === 0 && <em className="dim">no players yet</em>}
        {lobby.players.map((p) => (
          <div key={p.clientId} className={`lobby-player ${p.clientId === myId ? 'me' : ''}`}>
            <span className="lobby-player-name">{p.displayName}</span>
            {p.faction && (
              <span className="lobby-player-faction" style={{ color: FACTION_COLOR[p.faction] }}>
                {p.faction}
              </span>
            )}
            {p.clientId === myId && <span className="badge me-badge">YOU</span>}
          </div>
        ))}
      </div>

      <div className="lobby-section-label">Pick a faction</div>
      <div className="lobby-mode">
        <span className="lobby-section-label">Empty seats</span>
        <label className="home-toggle">
          <input
            type="checkbox"
            checked={lobby.autoFillBots}
            disabled={lobby.started}
            onChange={(e) => netClient.setAutoFillBots(e.target.checked)}
          />
          Auto-fill with bots
        </label>
      </div>
      <div className="lobby-seats">
        {ALL_FACTIONS.map((f) => {
          const claimedBy = net.lobby!.seats[f];
          const claimedByMe = claimedBy === myId;
          const claimedByOther = claimedBy && claimedBy !== myId;
          const claimingPlayer = net.lobby!.players.find(p => p.clientId === claimedBy);
          return (
            <button
              key={f}
              className={`lobby-seat faction-${f} ${claimedByMe ? 'mine' : ''} ${claimedByOther ? 'taken' : ''}`}
              disabled={!!claimedByOther}
              onClick={() => {
                if (claimedByMe) {
                  netClient.releaseSeat();
                  setShowVagabondPicker(false);
                } else {
                  if (f === 'vagabond') {
                    netClient.claimSeat(f, net.lobby!.vagabondCharacter);
                    setShowVagabondPicker(true);
                  } else {
                    netClient.claimSeat(f);
                    setShowVagabondPicker(false);
                  }
                }
              }}
            >
              {factionIcon(f) && <img src={factionIcon(f)!} alt="" />}
              <div>
                <div className="lobby-seat-name">{FACTION_LABEL[f]}</div>
                <div className="lobby-seat-state">
                  {claimedByMe ? 'you' : claimedByOther ? `taken: ${claimingPlayer?.displayName ?? '?'}` : lobby.autoFillBots ? 'AI bot will fill' : 'empty seat'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {(yourFaction === 'vagabond' || showVagabondPicker) && lobby.seats.vagabond === myId && (
        <div className="lobby-character">
          <div className="lobby-section-label">Vagabond character</div>
          <div className="character-row">
            {CHARACTERS.map((c) => (
              <button
                key={c}
                className={`btn ${net.lobby!.vagabondCharacter === c ? 'selected' : ''}`}
                onClick={() => netClient.chooseVagabondCharacter(c)}
              >{c}</button>
            ))}
          </div>
        </div>
      )}

      <div className="lobby-controls">
        <button
          className="btn primary"
          onClick={() => netClient.startGame()}
          disabled={!canStart}
        >
          Start game
        </button>
        <span className="dim">
          {lobby.autoFillBots
            ? 'Any unclaimed faction becomes a bot.'
            : 'Empty seats stay empty.'}
        </span>
      </div>

      {lobby.hasLoadedState && (
        <div className="home-success">
          A state file is loaded for this room. Press Start game to resume from that snapshot.
        </div>
      )}

      {net.lastError && <div className="lobby-error">{net.lastError}</div>}
    </div>
  );
}
