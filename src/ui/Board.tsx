import { useState, useEffect } from 'react';
import { AUTUMN_MAP, getAdjacent } from '../engine/map';
import type { ClearingId, Suit, Action } from '../engine/types';
import { useGame } from './store';
import { getLegalActions } from '../engine/legal';
import { activeFaction } from '../engine/loop';

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

interface BoardProps {
  backgroundSrc?: string;
}

/** Movement-like actions that should be driven by clicking the map. */
function getMovementActions(actions: Action[]): Action[] {
  return actions.filter(a =>
    a.kind === 'marquise.march' ||
    a.kind === 'vagabond.move' ||
    a.kind === 'vagabond.slip'
  );
}

function actionFromTo(a: Action): { from: ClearingId | null; to: ClearingId } | null {
  if (a.kind === 'marquise.march') return { from: a.from, to: a.to };
  if (a.kind === 'vagabond.move')  return { from: null, to: a.to };
  if (a.kind === 'vagabond.slip')  return { from: null, to: a.to };
  return null;
}

export function Board({ backgroundSrc }: BoardProps) {
  const state = useGame((s) => s.state);
  const playerFaction = useGame((s) => s.playerFaction);
  const dispatch = useGame((s) => s.dispatch);
  const [hovered, setHovered] = useState<ClearingId | null>(null);
  const [selected, setSelected] = useState<ClearingId | null>(null);

  // Reset selection when turn changes.
  useEffect(() => { setSelected(null); }, [state.activeIndex, state.phase]);

  const isHuman = state.phase !== 'setup' && state.phase !== 'gameOver'
    && activeFaction(state) === playerFaction;
  const legals = isHuman ? getLegalActions(state) : [];
  const moveActions = getMovementActions(legals);

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
    if (!isHuman) return;
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
        dispatch(a);
        setSelected(null);
        return;
      }
    }
    // Not a valid target → try to reselect if id is a valid source.
    if (validSources.has(id)) setSelected(id);
    else setSelected(null);
  }

  const adjacentToHovered = hovered ? new Set(getAdjacent(AUTUMN_MAP, hovered)) : null;

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      className="board"
      role="img"
      aria-label="Root autumn map"
    >
      {backgroundSrc ? (
        <image href={backgroundSrc} x={0} y={0} width={BOARD_W} height={BOARD_H} />
      ) : (
        <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#2f4a2a" />
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
      <g className="clearings">
        {AUTUMN_MAP.clearings.map(c => {
          const isHovered = c.id === hovered;
          const isAdjacent = adjacentToHovered?.has(c.id) ?? false;
          const isSelected = c.id === selected;
          const isValidTarget = validTargets.has(c.id);
          const isValidSource = isHuman && selected == null && validSources.has(c.id);
          const cl = state.map.clearings[c.id]!;

          let strokeColor = '#3b2a18';
          let strokeWidth = 3;
          if (isSelected)         { strokeColor = '#fff';    strokeWidth = 7; }
          else if (isValidTarget) { strokeColor = '#88e08a'; strokeWidth = 6; }
          else if (isValidSource) { strokeColor = '#f3e3a8'; strokeWidth = 5; }
          else if (isHovered)     { strokeColor = '#fff';    strokeWidth = 5; }
          else if (isAdjacent)    { strokeColor = '#f3e3a8'; strokeWidth = 4; }

          return (
            <g
              key={c.id}
              transform={`translate(${c.x}, ${c.y})`}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(h => (h === c.id ? null : h))}
              onClick={() => handleClearingClick(c.id)}
              style={{ cursor: isHuman ? 'pointer' : 'default' }}
              role="button"
              aria-label={`Clearing ${c.id}, ${c.suit}${c.hasRuin ? ', has ruin' : ''}`}
            >
              <circle
                r={isHovered || isSelected ? 56 : 50}
                fill={SUIT_COLOR[c.suit]}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                className={isValidTarget ? 'pulse' : ''}
              />
              {c.hasRuin && (
                <text y={-32} textAnchor="middle" fontSize={11} fontWeight={700} fill="#3b2a18">
                  ruin
                </text>
              )}
              <text y={-15} textAnchor="middle" fontSize={22} fontWeight={700} fill="#3b2a18">
                {c.id}
              </text>

              {/* Warrior stacks per faction */}
              <g transform="translate(0, 5)">
                {(['marquise', 'eyrie', 'alliance', 'vagabond'] as const).map((f, i) => {
                  const count = cl.warriors[f] ?? 0;
                  if (count <= 0) return null;
                  return (
                    <g key={f} transform={`translate(${-30 + i * 20}, 0)`}>
                      <circle r={8} fill={FACTION_COLOR[f]} stroke="#3b2a18" strokeWidth={1.5} />
                      <text y={3} textAnchor="middle" fontSize={10} fontWeight={700} fill="#3b2a18">
                        {count}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Building stack (squares) + tokens */}
              <g transform="translate(0, 23)">
                {cl.buildings.map((b, idx) => (
                  <rect
                    key={idx}
                    x={-30 + idx * 13} y={-6} width={11} height={11}
                    fill={FACTION_COLOR[b.faction]}
                    stroke="#3b2a18" strokeWidth={1.5}
                  />
                ))}
                {cl.tokens.filter(t => t.kind === 'wood').slice(0, 4).map((_, idx) => (
                  <circle
                    key={`w${idx}`}
                    cx={20 + idx * 6} cy={0} r={3.5}
                    fill="#7c5c2e" stroke="#3b2a18" strokeWidth={1}
                  />
                ))}
                {cl.tokens.filter(t => t.kind === 'sympathy').map((_, idx) => (
                  <polygon
                    key={`s${idx}`}
                    points={`-20,${-12 - idx*8} -14,${-2 - idx*8} -26,${-2 - idx*8}`}
                    fill="#9bbd58" stroke="#3b2a18" strokeWidth={1}
                  />
                ))}
                {cl.tokens.filter(t => t.kind === 'keep').length > 0 && (
                  <text x={32} y={2} textAnchor="middle" fontSize={9} fill="#3b2a18" fontWeight={700}>
                    K
                  </text>
                )}
              </g>

              {/* Vagabond pawn */}
              {cl.vagabondHere && (
                <circle
                  cx={0} cy={36} r={6}
                  fill={FACTION_COLOR.vagabond}
                  stroke="#3b2a18" strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
