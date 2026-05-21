import { Board } from './ui/Board';
import { Hand } from './ui/Hand';
import { ActionBar } from './ui/ActionBar';
import { Log } from './ui/Log';
import { Scoreboard } from './ui/Scoreboard';
import { SetupWizard } from './ui/SetupWizard';
import { AssetStatus } from './ui/AssetStatus';
import { useGame } from './ui/store';
import { FactionPanels } from './ui/factions';
import { ALL_FACTIONS } from './engine/types';

export function App() {
  const state = useGame((s) => s.state);
  const playerFaction = useGame((s) => s.playerFaction);
  const dispatch = useGame((s) => s.dispatch);
  const begin = useGame((s) => s.begin);
  const reset = useGame((s) => s.reset);

  if (state.phase === 'setup') {
    return (
      <div className="app setup-only">
        <header className="app-header">
          <h1>Root</h1>
          <p className="subtitle">A woodland faction war, against three AI opponents</p>
        </header>
        <SetupWizard />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Root</h1>
        <p className="subtitle">
          {state.phase === 'gameOver'
            ? <strong>Game over — {state.winner?.faction} wins via {state.winner?.via}.</strong>
            : <>playing as <strong>{playerFaction}</strong></>}
        </p>
        <AssetStatus />
        <button className="btn ghost" onClick={() => reset(Math.floor(Math.random() * 1e9))}>
          new game
        </button>
      </header>
      <Scoreboard state={state} />
      <main className="app-main">
        <Board />
        <aside className="sidebar">
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
      </main>
      <ActionBar
        state={state}
        playerFaction={playerFaction}
        dispatch={dispatch}
        onBegin={begin}
      />
      <Log state={state} />
    </div>
  );
}
