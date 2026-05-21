import { useState } from 'react';
import { Board, type MapIntent } from './ui/Board';
import { Hand } from './ui/Hand';
import { ActionBar } from './ui/ActionBar';
import { Log } from './ui/Log';
import { Scoreboard } from './ui/Scoreboard';
import { SetupWizard } from './ui/SetupWizard';
import { AssetStatus } from './ui/AssetStatus';
import { PhaseHeader } from './ui/PhaseHeader';
import { Lobby } from './ui/Lobby';
import { Home } from './ui/Home';
import { Admin } from './ui/Admin';
import { useGame } from './ui/store';
import { useNetGame, useNetBridge } from './ui/networkStore';
import { netClient } from './ui/network';
import { FactionPanels } from './ui/factions';
import { ALL_FACTIONS } from './engine/types';

export function App() {
  // Admin page lives outside the game state machine entirely.
  if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
    return <Admin />;
  }

  useNetBridge();
  const [offlineRequested, setOfflineRequested] = useState(false);
  const [mapIntent, setMapIntent] = useState<MapIntent | null>(null);

  const localState = useGame((s) => s.state);
  const localPlayerFaction = useGame((s) => s.playerFaction);
  const localDispatch = useGame((s) => s.dispatch);
  const begin = useGame((s) => s.begin);
  const reset = useGame((s) => s.reset);

  const net = useNetGame((s) => s.net);
  const netState = useNetGame((s) => s.state);
  const netDispatch = useNetGame((s) => s.dispatch);

  const online = net.mode !== 'off' && net.mode !== 'disconnected';

  // Landing page: shown when offline and the user hasn't chosen to play solo yet.
  if (!online && !offlineRequested && localState.phase === 'setup') {
    return (
      <div className="app setup-only">
        <Home onStartOffline={() => setOfflineRequested(true)} />
      </div>
    );
  }

  // Lobby (connected but game not started).
  if (online && net.mode !== 'in-game') {
    return (
      <div className="app setup-only">
        <header className="app-header">
          <h1>Root</h1>
          <p className="subtitle">
            Room <code className="room-code">{net.roomId}</code> · {net.mode}
          </p>
        </header>
        <Lobby />
      </div>
    );
  }

  const state = online ? netState : localState;
  const playerFaction = online ? net.yourFaction : localPlayerFaction;
  const dispatch = online ? netDispatch : localDispatch;

  if (!state || state.phase === 'setup') {
    return (
      <div className="app setup-only">
        <header className="app-header">
          <h1>Root</h1>
          <p className="subtitle">Solo against AI opponents</p>
          <button className="btn ghost small" onClick={() => setOfflineRequested(false)}>← back</button>
        </header>
        <SetupWizard />
      </div>
    );
  }

  return (
    <div className="app app-game">
      <header className="app-header">
        <div className="header-left">
          <h1>Root</h1>
          <p className="subtitle">
            {state.phase === 'gameOver'
              ? <strong>Game over — {state.winner?.faction} wins via {state.winner?.via}.</strong>
              : <>playing as <strong>{playerFaction}</strong></>}
          </p>
        </div>
        <Scoreboard state={state} />
        <div className="header-right">
          <AssetStatus />
          <button
            className="btn ghost"
            onClick={() => {
              if (online) netClient.newGame();
              else reset(Math.floor(Math.random() * 1e9));
            }}
          >
            new game
          </button>
          {online && (
            <span className="online-pill" title={`Room ${net.roomId}`}>
              ● {net.roomId}
            </span>
          )}
        </div>
      </header>

      <PhaseHeader state={state} playerFaction={playerFaction} />

      <div className="board-pane">
        <Board
          state={state}
          playerFaction={playerFaction}
          dispatch={dispatch}
          mapIntent={mapIntent}
          setMapIntent={setMapIntent}
        />
      </div>

      <aside className="right-pane">
        <ActionBar
          state={state}
          playerFaction={playerFaction}
          dispatch={dispatch}
          onBegin={begin}
          mapIntent={mapIntent}
          setMapIntent={setMapIntent}
        />
        <div className="faction-panels">
          {ALL_FACTIONS.filter((f) => state.factions[f]).map((f) => {
            const Panel = FactionPanels[f];
            return (
              <Panel
                key={f}
                state={state}
                isHuman={f === playerFaction}
                dispatch={dispatch}
              />
            );
          })}
        </div>
      </aside>

      <div className="bottom-pane">
        <div className="log-pane">
          <Log state={state} />
        </div>
        <div className="hand-pane">
          <Hand state={state} faction={playerFaction} />
        </div>
      </div>
    </div>
  );
}
