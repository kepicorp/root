import { useState } from 'react';
import { AUTUMN_MAP, getAdjacent } from '../engine/map';
import type { ClearingId, Suit } from '../engine/types';

const BOARD_W = 1000;
const BOARD_H = 800;

const SUIT_COLOR: Record<Suit, string> = {
  fox:    '#d97a3c',
  mouse:  '#e6c34a',
  rabbit: '#9bbd58',
};

interface BoardProps {
  /** Optional URL to a board background image (PNG/JPG). Drop the real Root board here. */
  backgroundSrc?: string;
}

export function Board({ backgroundSrc }: BoardProps) {
  const [hovered, setHovered] = useState<ClearingId | null>(null);

  const adjacentToHovered = hovered ? new Set(getAdjacent(AUTUMN_MAP, hovered)) : null;

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      className="board"
      role="img"
      aria-label="Root autumn map"
    >
      {/* Background — either the scanned board image or a forest-toned fallback. */}
      {backgroundSrc ? (
        <image href={backgroundSrc} x={0} y={0} width={BOARD_W} height={BOARD_H} />
      ) : (
        <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#2f4a2a" />
      )}

      {/* Paths between clearings */}
      <g className="paths">
        {AUTUMN_MAP.paths.map(([a, b]) => {
          const ca = AUTUMN_MAP.clearings.find(c => c.id === a)!;
          const cb = AUTUMN_MAP.clearings.find(c => c.id === b)!;
          const highlighted =
            hovered != null && (a === hovered || b === hovered);
          return (
            <line
              key={`${a}-${b}`}
              x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
              stroke={highlighted ? '#f3e3a8' : '#8a7045'}
              strokeWidth={highlighted ? 6 : 3}
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
          return (
            <g
              key={c.id}
              transform={`translate(${c.x}, ${c.y})`}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered(h => (h === c.id ? null : h))}
              style={{ cursor: 'pointer' }}
            >
              <circle
                r={isHovered ? 56 : 50}
                fill={SUIT_COLOR[c.suit]}
                stroke={isHovered ? '#fff' : isAdjacent ? '#f3e3a8' : '#3b2a18'}
                strokeWidth={isHovered ? 5 : isAdjacent ? 4 : 3}
              />
              {c.hasRuin && (
                <text
                  y={-10}
                  textAnchor="middle"
                  fontSize={18}
                  fontWeight={700}
                  fill="#3b2a18"
                >
                  ruin
                </text>
              )}
              <text
                y={c.hasRuin ? 18 : 8}
                textAnchor="middle"
                fontSize={28}
                fontWeight={700}
                fill="#3b2a18"
              >
                {c.id}
              </text>
              <text
                y={c.hasRuin ? 36 : 30}
                textAnchor="middle"
                fontSize={11}
                fill="#3b2a18"
              >
                {`${c.suit} · ${c.buildingSlots} slot${c.buildingSlots > 1 ? 's' : ''}`}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
