import { useState, useEffect } from 'react';
import { AUTUMN_MAP, getAdjacent } from '../engine/map';
import type { ClearingId, Suit, Action, Faction } from '../engine/types';
import { useGame } from './store';
import { getLegalActions } from '../engine/legal';
import { activeFaction } from '../engine/loop';
import { boardArt, warriorArt, buildingArt } from '../assets';

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
  const bgSrc = backgroundSrc ?? boardArt() ?? undefined;

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
      {bgSrc ? (
        <image href={bgSrc} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" />
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
                r={isHovered || isSelected ? 68 : 62}
                fill={SUIT_COLOR[c.suit]}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                className={isValidTarget ? 'pulse' : ''}
              />
              {c.hasRuin && (
                <text y={-44} textAnchor="middle" fontSize={12} fontWeight={700} fill="#3b2a18">
                  ruin
                </text>
              )}
              <text y={-22} textAnchor="middle" fontSize={26} fontWeight={800} fill="#3b2a18">
                {c.id}
              </text>

              {/* Warriors: only render factions that have any here, centered. */}
              {(() => {
                const present = (['marquise', 'eyrie', 'alliance', 'vagabond'] as const)
                  .filter(f => (cl.warriors[f] ?? 0) > 0);
                const size = 30;
                const gap = 4;
                const total = present.length * size + Math.max(0, present.length - 1) * gap;
                const startX = -total / 2 + size / 2;
                return (
                  <g transform="translate(0, 12)">
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
                const size = 22;
                const gap = 2;
                const bldgs = cl.buildings;
                const total = bldgs.length * size + Math.max(0, bldgs.length - 1) * gap;
                const startX = -total / 2 + size / 2;
                return (
                  <g transform="translate(0, 38)">
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
                    cx={36} cy={-12 + idx * 7} r={4.5}
                    fill="#7c5c2e" stroke="#3b2a18" strokeWidth={1.2}
                  />
                ))}
                {cl.tokens.filter(t => t.kind === 'sympathy').map((_, idx) => {
                  const art = buildingArt('alliance', 'sympathy');
                  return art ? (
                    <image key={`s${idx}`} href={art} x={-46} y={-12 + idx * 18} width={18} height={18} />
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
                    <image href={art} x={28} y={-44} width={22} height={22} />
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
                  <image href={art} x={-44} y={20} width={28} height={28} />
                ) : (
                  <circle cx={-30} cy={34} r={10} fill={FACTION_COLOR.vagabond} stroke="#3b2a18" strokeWidth={2} />
                );
              })()}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
