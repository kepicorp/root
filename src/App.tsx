import { Board } from './ui/Board';
import { Hand } from './ui/Hand';
import { ActionBar } from './ui/ActionBar';
import { Log } from './ui/Log';
import { Scoreboard } from './ui/Scoreboard';
import { SetupWizard } from './ui/SetupWizard';
import { AssetStatus } from './ui/AssetStatus';
import { PhaseHeader } from './ui/PhaseHeader';
import { Lobby } from './ui/Lobby';
import { HostBanner } from './ui/HostBanner';
import { useGame } from './ui/store';
import { useNetGame, useNetBridge } from './ui/networkStore';
import { netClient } from './ui/network';
import { FactionPanels } from './ui/factions';
import { ALL_FACTIONS } from './engine/types';

export function App() {
  useNetBridge();
  const localState = useGame((s) => s.state);
  const localPlayerFaction = useGame((s) => s.playerFaction);
  const localDispatch = useGame((s) => s.dispatch);
  const begin = useGame((s) => s.begin);
  const reset = useGame((s) => s.reset);

  const net = useNetGame((s) => s.net);
  const netState = useNetGame((s) => s.state);
  const netDispatch = useNetGame((s) => s.dispatch);

  const online = net.mode !== 'off' && net.mode !== 'disconnected';

  // Lobby screen when connected but the server hasn't started a game yet.
  if (online && net.mode !== 'in-game') {
    return (
      <div className="app setup-only">
        <header className="app-header">
          <h1>Root</h1>
          <p className="subtitle">LAN multiplayer · {net.mode}</p>
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
          <p className="subtitle">A woodland faction war, against three AI opponents</p>
        </header>
        <HostBanner />
        <SetupWizard />
      </div>
    );
  }

  return (
    <div className="app app-game">
      <header className="app-header">
        <h1>Root</h1>
        <p className="subtitle">
          {state.phase === 'gameOver'
            ? <strong>Game over — {state.winner?.faction} wins via {state.winner?.via}.</strong>
            : <>playing as <strong>{playerFaction}</strong></>}
        </p>
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
        {online && <span className="online-pill" title="LAN multiplayer">● LAN</span>}
      </header>

      <PhaseHeader state={state} playerFaction={playerFaction} />

      <div className="board-pane">
        <Board />
      </div>

      <aside className="right-pane">
        <Scoreboard state={state} />
        <ActionBar
          state={state}
          playerFaction={playerFaction}
          dispatch={dispatch}
          onBegin={begin}
        />
        <Hand state={state} faction={playerFaction} />
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

      <div className="log-pane">
        <Log state={state} />
      </div>
    </div>
  );
}
