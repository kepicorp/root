import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Board, type MapIntent } from './ui/Board';
import { Hand } from './ui/Hand';
import { DiscardPicker } from './ui/DiscardPicker';
import { AmbushPrompt } from './ui/AmbushPrompt';
import { BattleOverlay } from './ui/BattleOverlay';
import { CombatOptionalPrompt } from './ui/CombatOptionalPrompt';
import { CombatFieldHospitalsPrompt, CombatRemovalOrderPrompt } from './ui/CombatBattlePrompts';
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
import { autoConnectFromUrl, netClient } from './ui/network';
import { buildStateSnapshot, serializeStateSnapshot, type StateSnapshotFile } from './engine/stateSnapshot';
import { FactionPanels } from './ui/factions';
import { ALL_FACTIONS } from './engine/types';
import { useSiteAuth } from './ui/siteAuth';
import { useUserAssetPackVersion } from './assets/user-pack';

export function App() {
  // Admin page lives outside the game state machine entirely.
  if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
    return <Admin />;
  }

  useNetBridge();
  const site = useSiteAuth();
  useUserAssetPackVersion();
  const [offlineRequested, setOfflineRequested] = useState(false);
  const [completedBattleOverlayId, setCompletedBattleOverlayId] = useState<string | null>(null);
  const [mapIntent, setMapIntent] = useState<MapIntent | null>(null);
  const [rightPaneWidth, setRightPaneWidth] = useState(380);
  const [handPaneWidth, setHandPaneWidth] = useState(420);
  const resizeRef = useRef<{ kind: 'right' | 'hand'; startX: number; startSize: number } | null>(null);

  const localState = useGame((s) => s.state);
  const localPlayerFaction = useGame((s) => s.playerFaction);
  const localDispatch = useGame((s) => s.dispatch);
  const undo = useGame((s) => s.undo);
  const canUndo = useGame((s) => s.history.length > 0);
  const reset = useGame((s) => s.reset);
  const loadSnapshot = useGame((s) => s.loadSnapshot);

  const net = useNetGame((s) => s.net);
  const netState = useNetGame((s) => s.state);
  const netDispatch = useNetGame((s) => s.dispatch);

  const online = net.mode !== 'off' && net.mode !== 'disconnected';

  async function saveStateToTextFile(): Promise<void> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fileName = `root-state-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.txt`;

    const text = online
      ? await netClient.exportState()
      : serializeStateSnapshot(buildStateSnapshot(localState, {
        source: 'offline',
        playerFaction: localPlayerFaction,
      }));

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function startOffline(snapshot?: StateSnapshotFile): void {
    if (snapshot) {
      loadSnapshot(snapshot.state, snapshot.context.playerFaction);
    }
    setOfflineRequested(true);
  }

  function beginResize(kind: 'right' | 'hand', clientX: number): void {
    resizeRef.current = {
      kind,
      startX: clientX,
      startSize: kind === 'right' ? rightPaneWidth : handPaneWidth,
    };
  }

  useEffect(() => {
    function onMove(ev: PointerEvent): void {
      const r = resizeRef.current;
      if (!r) return;
      const dx = ev.clientX - r.startX;
      if (r.kind === 'right') {
        const next = Math.max(300, Math.min(700, r.startSize - dx));
        setRightPaneWidth(next);
      } else {
        const maxHand = Math.max(280, Math.floor(window.innerWidth * 0.7));
        const next = Math.max(260, Math.min(maxHand, r.startSize - dx));
        setHandPaneWidth(next);
      }
    }

    function onUp(): void {
      resizeRef.current = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [handPaneWidth, rightPaneWidth]);

  useEffect(() => {
    if (!site.checking && site.authed) autoConnectFromUrl();
  }, [site.authed, site.checking]);

  if (site.checking) {
    return (
      <div className="app setup-only">
        <div className="home loading">
          <h1 className="home-title">Root</h1>
          <p className="home-tagline">Checking site access…</p>
        </div>
      </div>
    );
  }

  // Landing page: shown when offline and the user hasn't chosen to play solo yet.
  if (!site.authed || (!online && !offlineRequested && localState.phase === 'setup')) {
    return (
      <div className="app setup-only">
        <Home onStartOffline={startOffline} site={site} />
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
  const activeTurnName = (() => {
    if (!online || !state || !net.lobby) return null;
    const active = state.factionOrder[state.activeIndex];
    const seatClientId = net.lobby.seats[active];
    if (!seatClientId) return 'AI';
    return net.lobby.players.find(p => p.clientId === seatClientId)?.displayName ?? 'AI';
  })();
  const isPaused = online && net.lobby?.paused === true;

  if (!state || (!online && localPlayerFaction == null && state.phase === 'setup')) {
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
    <div
      className="app app-game"
      style={{
        '--right-pane-w': `${rightPaneWidth}px`,
        '--hand-pane-w': `${handPaneWidth}px`,
      } as CSSProperties}
    >
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

      <div
        className="pane-resizer pane-resizer-vertical"
        onPointerDown={(e) => beginResize('right', e.clientX)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />

      <aside className="right-pane">
        <ActionBar
          state={state}
          playerFaction={playerFaction}
          activeTurnName={activeTurnName}
          dispatch={dispatch}
          mapIntent={mapIntent}
          setMapIntent={setMapIntent}
          onUndo={online ? undefined : undo}
          canUndo={!online && canUndo}
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
          <Log state={state} onSaveState={saveStateToTextFile} />
        </div>
        <div
          className="pane-resizer pane-resizer-horizontal"
          onPointerDown={(e) => beginResize('hand', e.clientX)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize hand"
        />
        <div className="hand-pane">
          <Hand state={state} faction={playerFaction} />
        </div>
      </div>

      <DiscardPicker state={state} playerFaction={playerFaction} dispatch={dispatch} />
      <AmbushPrompt state={state} playerFaction={playerFaction} dispatch={dispatch} />
      <BattleOverlay state={state} onComplete={setCompletedBattleOverlayId} />
      <CombatOptionalPrompt state={state} playerFaction={playerFaction} dispatch={dispatch} />
      <CombatRemovalOrderPrompt state={state} playerFaction={playerFaction} dispatch={dispatch} />
      {state.battleOverlay?.id === completedBattleOverlayId && (
        <CombatFieldHospitalsPrompt state={state} playerFaction={playerFaction} dispatch={dispatch} />
      )}
      {isPaused && (
        <div className="paused-overlay" role="alert" aria-live="assertive">
          <div className="paused-overlay-card">Paused</div>
        </div>
      )}
    </div>
  );
}
