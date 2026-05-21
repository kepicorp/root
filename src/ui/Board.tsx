import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { AUTUMN_MAP, getAdjacent } from '../engine/map';
import type { ClearingId, Suit, Action, Faction, GameState } from '../engine/types';
import { getLegalActions } from '../engine/legal';
import { activeFaction } from '../engine/loop';
import { boardArt, warriorArt, buildingArt } from '../assets';
import { Trees } from './Trees';
import { MapLegend } from './MapLegend';
import { ClearingInfo } from './ClearingInfo';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

const BOARD_W = 1000;
const BOARD_H = 800;

const SUIT_COLOR: Record<Suit, string> = {
  fox:    '#d97a3c',
  mouse:  '#e6c34a',
  rabbit: '#9bbd58',
};

const FACTION_COLOR: Record<string, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#e0d4b0',
};

/** A map-targeted intent the player has armed from the ActionBar. The Board
 *  highlights valid targets and applies the action on click. */
export type MapIntent =
  | { kind: 'build'; building: 'sawmill' | 'workshop' | 'recruiter' }
  | { kind: 'marquise.overwork'; cardId: string }
  | { kind: 'marquise.battle'; defender: Faction }
  | { kind: 'alliance.spreadSympathy' }
  | { kind: 'alliance.revolt' }
  | { kind: 'alliance.organize' }
  | { kind: 'alliance.battle'; defender: Faction }
  | { kind: 'vagabond.strike'; defender: Faction }
  | { kind: 'eyrie.executeRecruit' }
  | { kind: 'eyrie.executeBattle'; defender: Faction }
  | { kind: 'eyrie.executeBuild' };

interface BoardProps {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (action: Action) => void;
  mapIntent: MapIntent | null;
  setMapIntent: (intent: MapIntent | null) => void;
  backgroundSrc?: string;
}

// Pre-resolved per-faction warrior art (null if file missing).
const WARRIOR_ART: Record<Faction, string | null> = {
  marquise: warriorArt('marquise'),
  eyrie:    warriorArt('eyrie'),
  alliance: warriorArt('alliance'),
  vagabond: warriorArt('vagabond'),
};

/** Movement-like actions that should be driven by clicking the map. */
function getMovementActions(actions: Action[]): Action[] {
  return actions.filter(a =>
    a.kind === 'marquise.march' ||
    a.kind === 'vagabond.move' ||
    a.kind === 'vagabond.slip' ||
    a.kind === 'eyrie.executeMove'
  );
}

function actionFromTo(a: Action): { from: ClearingId | null; to: ClearingId } | null {
  if (a.kind === 'marquise.march')     return { from: a.from, to: a.to };
  if (a.kind === 'eyrie.executeMove')  return { from: a.from, to: a.to };
  if (a.kind === 'vagabond.move')      return { from: null, to: a.to };
  if (a.kind === 'vagabond.slip')      return { from: null, to: a.to };
  return null;
}

export function Board({ state, playerFaction, dispatch, mapIntent, setMapIntent, backgroundSrc }: BoardProps) {
  const [hovered, setHovered] = useState<ClearingId | null>(null);
  const [selected, setSelected] = useState<ClearingId | null>(null);
  const [infoClearing, setInfoClearing] = useState<ClearingId | null>(null);
  // Set when the player clicks a destination on a multi-warrior move so we
  // can ask "how many?" before dispatching the action.
  const [pendingMove, setPendingMove] = useState<{
    from: ClearingId;
    to: ClearingId;
    max: number;
    action: Action; // the original legal action (carries the kind + max count)
    pick: number;
  } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number } } | null>(null);
  const bgSrc = backgroundSrc ?? boardArt() ?? undefined;

  // viewBox: zoom shrinks the visible area, pan offsets its center.
  const vbW = BOARD_W / zoom;
  const vbH = BOARD_H / zoom;
  const vbX = (BOARD_W / 2) + pan.x - vbW / 2;
  const vbY = (BOARD_H / 2) + pan.y - vbH / 2;

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const maxX = (BOARD_W - BOARD_W / z) / 2;
    const maxY = (BOARD_H - BOARD_H / z) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, p.x)),
      y: Math.max(-maxY, Math.min(maxY, p.y)),
    };
  }, []);

  const setZoomClamped = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    setZoom(clamped);
    setPan(p => {
      if (anchor) {
        // Keep `anchor` (in SVG user units) stable under cursor.
        const dx = anchor.x - (BOARD_W / 2 + p.x);
        const dy = anchor.y - (BOARD_H / 2 + p.y);
        const scale = 1 - zoom / clamped;
        return clampPan({ x: p.x + dx * scale, y: p.y + dy * scale }, clamped);
      }
      return clampPan(p, clamped);
    });
  }, [zoom, clampPan]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse-wheel zoom around the cursor.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const pt = clientToSvg(el, e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setZoomClamped(zoom * factor, pt);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, setZoomClamped]);

  // Keyboard: + / - / 0, and Space to enable drag-to-pan.
  useEffect(() => {
    const isFormField = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (isFormField(e.target)) return;
      if (e.key === '+' || e.key === '=') setZoomClamped(zoom * ZOOM_STEP);
      else if (e.key === '-' || e.key === '_') setZoomClamped(zoom / ZOOM_STEP);
      else if (e.key === '0') resetView();
      else if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        // If a drag was in progress when space was released, end it.
        if (dragRef.current) {
          dragRef.current = null;
          setDragging(false);
        }
      }
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [zoom, setZoomClamped, resetView]);

  // Pan via right-mouse drag, shift+left-drag, or space+left-drag.
  // Left-click without modifier still selects clearings for movement.
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const isDragInput =
      e.button === 2 ||
      (e.button === 0 && e.shiftKey) ||
      (e.button === 0 && spaceHeld);
    if (!isDragInput) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...pan } };
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.startX) * (BOARD_W / rect.width) / zoom;
    const dy = (e.clientY - d.startY) * (BOARD_H / rect.height) / zoom;
    setPan(clampPan({ x: d.startPan.x - dx, y: d.startPan.y - dy }, zoom));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      dragRef.current = null;
      setDragging(false);
    }
  }

  // Reset selection when turn changes.
  useEffect(() => { setSelected(null); }, [state.activeIndex, state.phase]);

  // Esc closes the clearing info popup.
  useEffect(() => {
    if (infoClearing == null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setInfoClearing(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [infoClearing]);

  const isHuman = state.phase !== 'setup' && state.phase !== 'gameOver'
    && activeFaction(state) === playerFaction;
  const legals = isHuman ? getLegalActions(state) : [];
  const moveActions = getMovementActions(legals);

  // When the player has armed a map-targeted action, figure out which
  // clearings would satisfy it. We match against legals so the engine
  // stays the source of truth for what's allowed.
  const intentTargets = new Set<ClearingId>();
  const intentDispatch: Map<ClearingId, Action> = new Map();
  if (mapIntent && isHuman) {
    for (const a of legals) {
      const target = matchIntent(mapIntent, a);
      if (target == null) continue;
      intentTargets.add(target);
      if (!intentDispatch.has(target)) intentDispatch.set(target, a);
    }
  }

  // Escape cancels any armed map intent or pending move.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (pendingMove) setPendingMove(null);
      else if (mapIntent) setMapIntent(null);
      else if (selected != null) setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingMove, mapIntent, selected, setMapIntent]);

  // Compute valid sources (clearings where a move can originate) and, given selection,
  // valid targets to highlight.
  const validSources = new Set<ClearingId>();
  for (const a of moveActions) {
    const ft = actionFromTo(a);
    if (!ft) continue;
    if (ft.from != null) validSources.add(ft.from);
    else if (state.factions.vagabond) validSources.add(state.factions.vagabond.clearing);
  }
  const validTargets = new Set<ClearingId>();
  if (selected != null) {
    for (const a of moveActions) {
      const ft = actionFromTo(a);
      if (!ft) continue;
      const from = ft.from ?? state.factions.vagabond?.clearing ?? -1;
      if (from === selected) validTargets.add(ft.to);
    }
  }

  function handleClearingClick(id: ClearingId) {
    // Always show / toggle the info popup for the clicked clearing.
    setInfoClearing(prev => (prev === id ? null : id));

    if (!isHuman) return;

    // Map-targeted intent (e.g. Build): consume the click here.
    if (mapIntent) {
      const a = intentDispatch.get(id);
      if (a) {
        dispatch(a);
        setMapIntent(null);
        setInfoClearing(null);
      }
      // Click on a non-target clearing just shows its info; intent stays armed.
      return;
    }

    if (selected == null) {
      if (validSources.has(id)) setSelected(id);
      return;
    }
    if (id === selected) { setSelected(null); return; }
    // Try to dispatch a movement action from selected → id
    for (const a of moveActions) {
      const ft = actionFromTo(a);
      if (!ft) continue;
      const from = ft.from ?? state.factions.vagabond?.clearing ?? -1;
      if (from === selected && ft.to === id) {
        // If the action carries a `count` (Marquise march) and there's
        // more than one warrior available, ask the player how many to
        // move instead of always shipping the maximum.
        const max = a.kind === 'marquise.march' ? a.count : 1;
        if (max > 1) {
          setPendingMove({ from: selected, to: id, max, action: a, pick: max });
          return;
        }
        dispatch(a);
        setSelected(null);
        setInfoClearing(null);
        return;
      }
    }
    // Not a valid target → try to reselect if id is a valid source.
    if (validSources.has(id)) setSelected(id);
    else setSelected(null);
  }

  const adjacentToHovered = hovered ? new Set(getAdjacent(AUTUMN_MAP, hovered)) : null;

  const panCursor = dragging ? 'grabbing' : spaceHeld ? 'grab' : undefined;

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="board"
        role="img"
        aria-label="Root autumn map"
        style={panCursor ? { cursor: panCursor } : undefined}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
      {bgSrc ? (
        <image href={bgSrc} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          {/* Mossy forest floor */}
          <defs>
            <radialGradient id="forestGradient" cx="50%" cy="50%" r="75%">
              <stop offset="0%" stopColor="#3a5a2a" />
              <stop offset="100%" stopColor="#1a2814" />
            </radialGradient>
            <pattern id="grassPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <rect width="20" height="20" fill="transparent" />
              <line x1="2" y1="18" x2="4" y2="14" stroke="#2c4520" strokeWidth="0.8" />
              <line x1="14" y1="19" x2="16" y2="15" stroke="#2c4520" strokeWidth="0.8" />
              <line x1="8" y1="6" x2="9" y2="2" stroke="#2c4520" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="url(#forestGradient)" />
          <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="url(#grassPattern)" opacity="0.5" />
          <Trees />
        </>
      )}

      {/* Paths */}
      <g className="paths">
        {AUTUMN_MAP.paths.map(([a, b]) => {
          const ca = AUTUMN_MAP.clearings.find(c => c.id === a)!;
          const cb = AUTUMN_MAP.clearings.find(c => c.id === b)!;
          const highlighted = hovered != null && (a === hovered || b === hovered);
          const isMovePath = selected != null &&
            ((a === selected && validTargets.has(b)) || (b === selected && validTargets.has(a)));
          return (
            <line
              key={`${a}-${b}`}
              x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
              stroke={isMovePath ? '#88e08a' : highlighted ? '#f3e3a8' : '#8a7045'}
              strokeWidth={isMovePath ? 7 : highlighted ? 6 : 3}
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}
      </g>

      {/* Clearings */}
      <g className="clearings" style={{ pointerEvents: 'auto' }}>
        {AUTUMN_MAP.clearings.map(c => {
          const isHovered = c.id === hovered;
          const isAdjacent = adjacentToHovered?.has(c.id) ?? false;
          const isSelected = c.id === selected;
          const isValidTarget = validTargets.has(c.id);
          const isValidSource = isHuman && selected == null && validSources.has(c.id);
          const isIntentTarget = mapIntent != null && intentTargets.has(c.id);
          // When an intent is armed, clearings that wouldn't satisfy it
          // get dimmed so it's obvious which ones the player can click.
          const isIntentDimmed = mapIntent != null && !isIntentTarget;
          const cl = state.map.clearings[c.id]!;

          let strokeColor = '#3b2a18';
          let strokeWidth = 3;
          if (isSelected)          { strokeColor = '#fff';    strokeWidth = 7; }
          else if (isIntentTarget) { strokeColor = '#f0c060'; strokeWidth = 6; }
          else if (isValidTarget)  { strokeColor = '#88e08a'; strokeWidth = 6; }
          else if (isValidSource)  { strokeColor = '#f3e3a8'; strokeWidth = 5; }
          else if (isHovered)      { strokeColor = '#fff';    strokeWidth = 5; }
          else if (isAdjacent)     { strokeColor = '#f3e3a8'; strokeWidth = 4; }

          return (
            <g
              key={c.id}
              transform={`translate(${c.x}, ${c.y})`}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(h => (h === c.id ? null : h))}
              onClick={() => handleClearingClick(c.id)}
              style={{ cursor: isHuman ? 'pointer' : 'default', opacity: isIntentDimmed ? 0.3 : 1 }}
              role="button"
              aria-label={`Clearing ${c.id}, ${c.suit}${c.hasRuin ? ', has ruin' : ''}`}
            >
              {/* Outer earth ring (the cleared dirt around the village) */}
              <circle
                r={isHovered || isSelected ? 72 : 66}
                fill="#6b4f2a"
                stroke="#3b2a18"
                strokeWidth={2}
                opacity={0.95}
              />
              {/* Suit-colored village center */}
              <circle
                r={isHovered || isSelected ? 60 : 54}
                fill={SUIT_COLOR[c.suit]}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                className={isValidTarget || isIntentTarget ? 'pulse' : ''}
              />
              {/* Ruin marker (a small broken column near the top) */}
              {c.hasRuin && (
                <g transform="translate(-38 -38)" aria-hidden>
                  <rect x={-6} y={-2} width={12} height={12} fill="#cdc3a8" stroke="#3b2a18" strokeWidth={1.5} />
                  <rect x={-4} y={-10} width={8} height={8} fill="#cdc3a8" stroke="#3b2a18" strokeWidth={1.5} />
                  <line x1={-6} y1={4} x2={6} y2={4} stroke="#3b2a18" strokeWidth={1} />
                </g>
              )}
              {/* Clearing number badge */}
              <g transform="translate(0 -34)">
                <circle r={13} fill="#3b2a18" stroke="#f5e9d0" strokeWidth={1.5} />
                <text y={4} textAnchor="middle" fontSize={16} fontWeight={800} fill="#f5e9d0">
                  {c.id}
                </text>
              </g>
              {/* Slot indicator (empty plots shown as outlined squares; filled overlays appear below) */}
              {(() => {
                const usedSlots = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
                const free = Math.max(0, c.buildingSlots - usedSlots);
                const dotR = 4;
                const totalWidth = (c.buildingSlots - 1) * 12;
                return (
                  <g transform={`translate(${-totalWidth / 2} -16)`} aria-label={`${usedSlots} of ${c.buildingSlots} slots used`}>
                    {Array.from({ length: c.buildingSlots }).map((_, i) => {
                      const filled = i < usedSlots;
                      return (
                        <circle
                          key={i}
                          cx={i * 12}
                          cy={0}
                          r={dotR}
                          fill={filled ? '#3b2a18' : '#f5e9d0'}
                          stroke="#3b2a18"
                          strokeWidth={1.5}
                          opacity={filled ? 0.85 : 0.75}
                        />
                      );
                    })}
                    {free > 0 && (
                      <text x={totalWidth + 14} y={4} fontSize={10} fill="#3b2a18" fontWeight={700}>
                        {free} free
                      </text>
                    )}
                  </g>
                );
              })()}

              {/* Warriors: only render factions that have any here, centered. */}
              {(() => {
                const present = (['marquise', 'eyrie', 'alliance', 'vagabond'] as const)
                  .filter(f => (cl.warriors[f] ?? 0) > 0);
                const size = 38;
                const gap = 4;
                const total = present.length * size + Math.max(0, present.length - 1) * gap;
                const startX = -total / 2 + size / 2;
                return (
                  <g transform="translate(0, 4)">
                    {present.map((f, i) => {
                      const count = cl.warriors[f] ?? 0;
                      const art = WARRIOR_ART[f];
                      const cx = startX + i * (size + gap);
                      return (
                        <g key={f} transform={`translate(${cx}, 0)`}>
                          {art ? (
                            <image href={art} x={-size/2} y={-size/2} width={size} height={size} />
                          ) : (
                            <circle r={size/2 - 2} fill={FACTION_COLOR[f]} stroke="#3b2a18" strokeWidth={2} />
                          )}
                          <g transform={`translate(${size/2 - 4}, ${size/2 - 4})`}>
                            <circle r={9} fill="#1a1410" stroke="#fff" strokeWidth={1.5} />
                            <text y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#fff">
                              {count}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

              {/* Buildings + tokens row */}
              {(() => {
                const size = 28;
                const gap = 2;
                const bldgs = cl.buildings;
                const total = bldgs.length * size + Math.max(0, bldgs.length - 1) * gap;
                const startX = -total / 2 + size / 2;
                return (
                  <g transform="translate(0, 42)">
                    {bldgs.map((b, idx) => {
                      const art = buildingArt(b.faction, b.kind);
                      const cx = startX + idx * (size + gap);
                      return art ? (
                        <image key={idx} href={art} x={cx - size/2} y={-size/2} width={size} height={size} />
                      ) : (
                        <rect
                          key={idx}
                          x={cx - size/2} y={-size/2} width={size} height={size}
                          fill={FACTION_COLOR[b.faction]}
                          stroke="#3b2a18" strokeWidth={1.5}
                        />
                      );
                    })}
                  </g>
                );
              })()}

              {/* Wood tokens, sympathy, keep — small overlays on the side */}
              <g>
                {cl.tokens.filter(t => t.kind === 'wood').slice(0, 5).map((_, idx) => (
                  <circle
                    key={`w${idx}`}
                    cx={42} cy={-14 + idx * 9} r={6}
                    fill="#7c5c2e" stroke="#3b2a18" strokeWidth={1.2}
                  />
                ))}
                {cl.tokens.filter(t => t.kind === 'sympathy').map((_, idx) => {
                  const art = buildingArt('alliance', 'sympathy');
                  return art ? (
                    <image key={`s${idx}`} href={art} x={-52} y={-14 + idx * 24} width={24} height={24} />
                  ) : (
                    <polygon
                      key={`s${idx}`}
                      points={`-30,${-12 + idx*18 - 8} -22,${-12 + idx*18 + 4} -38,${-12 + idx*18 + 4}`}
                      fill="#9bbd58" stroke="#3b2a18" strokeWidth={1}
                    />
                  );
                })}
                {cl.tokens.filter(t => t.kind === 'keep').length > 0 && (() => {
                  const art = buildingArt('marquise', 'keep');
                  return art ? (
                    <image href={art} x={30} y={-50} width={28} height={28} />
                  ) : (
                    <text x={36} y={-30} textAnchor="middle" fontSize={11} fill="#3b2a18" fontWeight={800}>
                      K
                    </text>
                  );
                })()}
              </g>

              {/* Vagabond pawn */}
              {cl.vagabondHere && (() => {
                const art = warriorArt('vagabond');
                return art ? (
                  <image href={art} x={-52} y={20} width={36} height={36} />
                ) : (
                  <circle cx={-34} cy={38} r={13} fill={FACTION_COLOR.vagabond} stroke="#3b2a18" strokeWidth={2} />
                );
              })()}
            </g>
          );
        })}
      </g>

      </svg>

      {/* Legend overlay — pinned to the top-left of the board pane in
          screen space (HTML, not inside the SVG) so panning/zooming the
          map doesn't shove it around. */}
      <MapLegend open={legendOpen} onToggle={() => setLegendOpen(o => !o)} />

      {/* Clearing info popup (lower-left of board) */}
      {infoClearing != null && (
        <ClearingInfo
          state={state}
          clearingId={infoClearing}
          isSelectedAsSource={selected === infoClearing}
          onClose={() => setInfoClearing(null)}
        />
      )}

      {/* Banner — shown when a map-targeted action is armed from the
          ActionBar. Tells the player what they're placing and gives a
          clear way to back out without making a choice. */}
      {mapIntent && (
        <div className="map-intent-banner" role="status">
          <span>{intentBannerText(mapIntent, intentTargets.size)}</span>
          <button className="btn ghost small" onClick={() => setMapIntent(null)}>
            Cancel (Esc)
          </button>
        </div>
      )}

      {/* Count picker — shown after the player clicks a destination on a
          multi-warrior move, so they can choose how many to march. */}
      {pendingMove && (
        <div className="count-picker" role="dialog" aria-label="Choose how many warriors to move">
          <div className="count-picker-title">
            March from <strong>{pendingMove.from}</strong> → <strong>{pendingMove.to}</strong>
          </div>
          <div className="count-picker-row">
            <button
              className="btn ghost small"
              onClick={() => setPendingMove(p => p ? { ...p, pick: Math.max(1, p.pick - 1) } : null)}
              disabled={pendingMove.pick <= 1}
              aria-label="One fewer"
            >−</button>
            <span className="count-picker-value">{pendingMove.pick}</span>
            <span className="count-picker-max">/ {pendingMove.max}</span>
            <button
              className="btn ghost small"
              onClick={() => setPendingMove(p => p ? { ...p, pick: Math.min(p.max, p.pick + 1) } : null)}
              disabled={pendingMove.pick >= pendingMove.max}
              aria-label="One more"
            >+</button>
          </div>
          <input
            type="range" min={1} max={pendingMove.max} value={pendingMove.pick}
            onChange={(e) => setPendingMove(p => p ? { ...p, pick: Number(e.target.value) } : null)}
            aria-label="How many to move"
          />
          <div className="count-picker-actions">
            <button
              className="btn ghost"
              onClick={() => { setPendingMove(null); setSelected(null); }}
            >Cancel</button>
            <button
              className="btn primary"
              onClick={() => {
                if (!pendingMove) return;
                const a = pendingMove.action;
                if (a.kind === 'marquise.march') {
                  dispatch({ ...a, count: pendingMove.pick });
                } else {
                  dispatch(a);
                }
                setPendingMove(null);
                setSelected(null);
                setInfoClearing(null);
              }}
            >March {pendingMove.pick}</button>
          </div>
        </div>
      )}

      {/* Zoom controls overlay */}
      <div className="zoom-controls" role="group" aria-label="Map zoom">
        <button
          className="zoom-btn"
          onClick={() => setZoomClamped(zoom * ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
          title="Zoom in (+)"
        >＋</button>
        <button
          className="zoom-btn"
          onClick={() => setZoomClamped(zoom / ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
          title="Zoom out (−)"
        >−</button>
        <button
          className="zoom-btn"
          onClick={resetView}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          aria-label="Reset view"
          title="Reset view (0)"
        >⟲</button>
        <div className="zoom-readout" aria-live="polite">{Math.round(zoom * 100)}%</div>
      </div>
    </div>
  );
}

/** Human-readable banner copy for an armed intent. */
function intentBannerText(intent: MapIntent, targets: number): ReactNode {
  const tail = targets === 0 ? ' — no legal targets' : '';
  switch (intent.kind) {
    case 'build':                    return <>Click a clearing to place a <strong>{intent.building}</strong>{tail}.</>;
    case 'marquise.overwork':        return <>Click a matching-suit sawmill clearing to <strong>overwork</strong>{tail}.</>;
    case 'marquise.battle':          return <>Click a clearing to attack the <strong>{intent.defender}</strong>{tail}.</>;
    case 'alliance.spreadSympathy':  return <>Click a clearing to <strong>spread sympathy</strong>{tail}.</>;
    case 'alliance.revolt':          return <>Click a clearing to <strong>revolt</strong>{tail}.</>;
    case 'alliance.organize':        return <>Click a clearing to <strong>organize</strong>{tail}.</>;
    case 'alliance.battle':          return <>Click a clearing to attack the <strong>{intent.defender}</strong>{tail}.</>;
    case 'vagabond.strike':          return <>Click your clearing to <strong>strike</strong> the <strong>{intent.defender}</strong>{tail}.</>;
    case 'eyrie.executeRecruit':     return <>Click a matching-suit roost to <strong>recruit</strong>{tail}.</>;
    case 'eyrie.executeBattle':      return <>Click a clearing to attack the <strong>{intent.defender}</strong>{tail}.</>;
    case 'eyrie.executeBuild':       return <>Click a ruled clearing to <strong>build a roost</strong>{tail}.</>;
  }
}

/** Returns the target clearing if `action` satisfies `intent`, otherwise null. */
function matchIntent(intent: MapIntent, action: Action): ClearingId | null {
  switch (intent.kind) {
    case 'build':
      return action.kind === 'marquise.build' && action.building === intent.building ? action.clearing : null;
    case 'marquise.overwork':
      return action.kind === 'marquise.overwork' && action.cardId === intent.cardId ? action.clearing : null;
    case 'marquise.battle':
      return action.kind === 'marquise.battle' && action.defender === intent.defender ? action.clearing : null;
    case 'alliance.spreadSympathy':
      return action.kind === 'alliance.spreadSympathy' ? action.clearing : null;
    case 'alliance.revolt':
      return action.kind === 'alliance.revolt' ? action.clearing : null;
    case 'alliance.organize':
      return action.kind === 'alliance.organize' ? action.clearing : null;
    case 'alliance.battle':
      return action.kind === 'alliance.battle' && action.defender === intent.defender ? action.clearing : null;
    case 'vagabond.strike':
      return action.kind === 'vagabond.strike' && action.faction === intent.defender ? action.clearing : null;
    case 'eyrie.executeRecruit':
      return action.kind === 'eyrie.executeRecruit' ? action.clearing : null;
    case 'eyrie.executeBattle':
      return action.kind === 'eyrie.executeBattle' && action.defender === intent.defender ? action.clearing : null;
    case 'eyrie.executeBuild':
      return action.kind === 'eyrie.executeBuild' ? action.clearing : null;
  }
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return {
    x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
    y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
  };
}
