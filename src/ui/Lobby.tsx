// Multiplayer lobby UI. Shown before game start. The room host controls seat
// plans (human/AI/empty), and can assign connected humans to faction seats.

import { useEffect, useState } from 'react';
import type { Faction } from '../engine/types';
import { ALL_FACTIONS } from '../engine/types';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
import type { SeatAssignment } from '../../server/protocol';
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
const ASSIGNMENTS: SeatAssignment[] = ['human', 'bot', 'open'];

function assignmentLabel(v: SeatAssignment): string {
  if (v === 'human') return 'Human';
  if (v === 'bot') return 'AI';
  return 'Empty';
}

export function Lobby() {
  const net = useNetGame((s) => s.net);
  const [showVagabondPicker, setShowVagabondPicker] = useState(false);
  const [draftName, setDraftName] = useState('');
  const lobby = net.lobby;
  const myId = net.clientId;
  const yourFaction = net.yourFaction;
  const isHost = !!myId && lobby?.hostClientId === myId;
  const me = myId && lobby ? lobby.players.find((p) => p.clientId === myId) : null;
  const currentName = me?.displayName ?? 'Player';
  useEffect(() => {
    setDraftName(currentName);
  }, [currentName]);
  if (!lobby) return null;
  const activeLobby = lobby;

  const plannedHumans = ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] === 'human').length;
  const plannedBots = ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] === 'bot').length;
  const plannedTotal = plannedHumans + plannedBots;
  const unfilledHumans = ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] === 'human' && activeLobby.seats[f] === null).length;
  const canStart = plannedTotal > 0 && unfilledHumans === 0;

  function applySeatCounts(nextHumans: number, nextBots: number): void {
    const next: Record<Faction, SeatAssignment> = {
      marquise: 'open', eyrie: 'open', alliance: 'open', vagabond: 'open',
    };
    const humanPriority = [
      ...ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] === 'human'),
      ...ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] !== 'human'),
    ];
    let humanLeft = nextHumans;
    for (const f of humanPriority) {
      if (humanLeft <= 0) break;
      next[f] = 'human';
      humanLeft -= 1;
    }
    const botPriority = [
      ...ALL_FACTIONS.filter((f) => activeLobby.seatPlans[f] === 'bot' && next[f] === 'open'),
      ...ALL_FACTIONS.filter((f) => next[f] === 'open'),
    ];
    let botLeft = nextBots;
    for (const f of botPriority) {
      if (botLeft <= 0) break;
      next[f] = 'bot';
      botLeft -= 1;
    }
    for (const f of ALL_FACTIONS) {
      if (next[f] !== activeLobby.seatPlans[f]) netClient.setSeatPlan(f, next[f]);
    }
  }

  return (
    <div className="lobby">
      <h2>Lobby</h2>
      <p className="lobby-endpoint">
        Connected to <code>{net.endpoint}</code>
        <button className="btn ghost small" onClick={() => netClient.disconnect()}>
          disconnect
        </button>
      </p>

      <div className="lobby-meta">
        <span className="badge">Host: {lobby.hostClientId === myId ? 'you' : (lobby.players.find((p) => p.clientId === lobby.hostClientId)?.displayName ?? 'offline')}</span>
        <span className="badge">Planned seats: {plannedTotal}/4</span>
        <span className="badge">Humans: {plannedHumans}</span>
        <span className="badge">AI: {plannedBots}</span>
      </div>

      {isHost && (
        <div className="lobby-plan-controls">
          <label>
            Human players
            <select
              className="home-input"
              value={plannedHumans}
              onChange={(e) => {
                const nextHumans = Number(e.target.value);
                const maxBots = 4 - nextHumans;
                applySeatCounts(nextHumans, Math.min(plannedBots, maxBots));
              }}
            >
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            AI players
            <select
              className="home-input"
              value={plannedBots}
              onChange={(e) => applySeatCounts(plannedHumans, Number(e.target.value))}
            >
              {Array.from({ length: 5 - plannedHumans }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      )}

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

      <div className="lobby-section-label">Seat assignments</div>
      <div className="lobby-seats">
        {ALL_FACTIONS.map((f) => {
          const assignment = lobby.seatPlans[f];
          const claimedBy = net.lobby!.seats[f];
          const claimedByMe = claimedBy === myId;
          const claimedByOther = claimedBy && claimedBy !== myId;
          const claimingPlayer = net.lobby!.players.find((p) => p.clientId === claimedBy);
          const seatLockedForAI = assignment === 'bot';
          const isAvailableHumanSeat = assignment === 'human' || assignment === 'open';
          return (
            <div key={f} className={`lobby-seat faction-${f} ${claimedByMe ? 'mine' : ''} ${claimedByOther ? 'taken' : ''}`}>
              {factionIcon(f) && <img src={factionIcon(f)!} alt="" />}
              <div className="lobby-seat-main">
                <div className="lobby-seat-name">{FACTION_LABEL[f]}</div>
                <div className="lobby-seat-state">
                  {claimedByMe
                    ? 'you'
                    : claimedByOther
                      ? `taken: ${claimingPlayer?.displayName ?? '?'}`
                      : assignment === 'bot'
                        ? 'AI player'
                        : assignment === 'human'
                          ? 'waiting for human'
                          : 'empty'}
                </div>
                <div className="lobby-seat-plan">Plan: {assignmentLabel(assignment)}</div>
              </div>

              {!lobby.started && isHost && (
                <div className="lobby-seat-controls">
                  <div className="lobby-seat-plan-picker">
                    {ASSIGNMENTS.map((a) => (
                      <button
                        key={a}
                        className={`btn small ${assignment === a ? 'selected' : ''}`}
                        onClick={() => netClient.setSeatPlan(f, a)}
                      >
                        {assignmentLabel(a)}
                      </button>
                    ))}
                  </div>
                  {assignment === 'human' && (
                    <select
                      className="home-input"
                      value={claimedBy ?? ''}
                      onChange={(e) => netClient.assignSeat(f, e.target.value ? e.target.value : null)}
                    >
                      <option value="">Unassigned</option>
                      {lobby.players.map((p) => (
                        <option key={p.clientId} value={p.clientId}>{p.displayName}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {!lobby.started && !isHost && isAvailableHumanSeat && (
                <button
                  className="btn small"
                  disabled={!!claimedByOther || seatLockedForAI}
                  onClick={() => {
                    if (claimedByMe) {
                      netClient.releaseSeat();
                      setShowVagabondPicker(false);
                      return;
                    }
                    if (f === 'vagabond') {
                      netClient.claimSeat(f, net.lobby!.vagabondCharacter);
                      setShowVagabondPicker(true);
                    } else {
                      netClient.claimSeat(f);
                      setShowVagabondPicker(false);
                    }
                  }}
                >
                  {claimedByMe ? 'Leave seat' : 'Take seat'}
                </button>
              )}
            </div>
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
          disabled={!canStart || (!isHost && !lobby.started)}
        >
          Start game
        </button>
        <span className="dim">
          {unfilledHumans > 0
            ? `${unfilledHumans} human seat${unfilledHumans === 1 ? '' : 's'} still unassigned.`
            : 'All human seats are assigned.'}
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
