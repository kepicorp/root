// In-SVG legend in the upper-left of the board. Collapsible.

import { warriorArt, factionIcon } from '../assets';
import type { Faction } from '../engine/types';

const FACTION_LABEL: Record<Faction, string> = {
  marquise: 'Marquise',
  eyrie:    'Eyrie',
  alliance: 'Alliance',
  vagabond: 'Vagabond',
};
const FACTION_COLOR: Record<Faction, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#e0d4b0',
};
const SUIT_COLOR: Record<string, string> = {
  fox: '#d97a3c',
  mouse: '#e6c34a',
  rabbit: '#9bbd58',
};

interface MapLegendProps {
  open: boolean;
  onToggle: () => void;
}

export function MapLegend({ open, onToggle }: MapLegendProps) {
  const W = open ? 240 : 110;
  const H = open ? 380 : 28;

  return (
    <g transform="translate(12 12)" className="legend">
      {/* Background panel */}
      <rect
        x={0} y={0} width={W} height={H} rx={8}
        fill="#1d1610" stroke="#c9892f" strokeWidth={2}
        opacity={0.94}
      />

      {/* Header / toggle button */}
      <g style={{ cursor: 'pointer' }} onClick={onToggle} role="button" aria-label="Toggle legend">
        <rect x={0} y={0} width={W} height={28} rx={8} fill="#2a1d10" />
        <text x={12} y={19} fontSize={13} fontWeight={700} fill="#c9892f" letterSpacing={2}>
          {open ? 'LEGEND' : 'LEGEND ▸'}
        </text>
        {open && (
          <text x={W - 14} y={19} textAnchor="end" fontSize={13} fontWeight={700} fill="#c9892f">
            ×
          </text>
        )}
      </g>

      {open && (
        <g transform="translate(12 44)" fontSize={11} fill="#f5e9d0" fontFamily="Iowan Old Style, Georgia, serif">
          <text y={0} fontSize={11} fontWeight={700} fill="#c9892f" letterSpacing={1}>SUITS</text>
          {(['fox', 'mouse', 'rabbit'] as const).map((s, i) => (
            <g key={s} transform={`translate(0 ${12 + i * 18})`}>
              <circle cx={8} cy={6} r={6} fill={SUIT_COLOR[s]} stroke="#3b2a18" strokeWidth={1.5} />
              <text x={22} y={10}>{s[0].toUpperCase() + s.slice(1)}</text>
            </g>
          ))}

          <text y={84} fontSize={11} fontWeight={700} fill="#c9892f" letterSpacing={1}>FACTIONS</text>
          {(Object.keys(FACTION_LABEL) as Faction[]).map((f, i) => {
            const icon = factionIcon(f) ?? warriorArt(f);
            return (
              <g key={f} transform={`translate(0 ${96 + i * 18})`}>
                {icon ? (
                  <image href={icon} x={-2} y={-4} width={20} height={20} />
                ) : (
                  <circle cx={8} cy={6} r={6} fill={FACTION_COLOR[f]} stroke="#3b2a18" strokeWidth={1.5} />
                )}
                <text x={22} y={10}>{FACTION_LABEL[f]}</text>
              </g>
            );
          })}

          <text y={180} fontSize={11} fontWeight={700} fill="#c9892f" letterSpacing={1}>TOKENS</text>
          <g transform="translate(0 192)">
            <circle cx={8} cy={6} r={5} fill="#7c5c2e" stroke="#3b2a18" strokeWidth={1} />
            <text x={22} y={10}>Wood</text>
          </g>
          <g transform="translate(0 210)">
            <path d="M2 4 Q6 1 10 4 Q14 2 14 6 Q16 10 10 12 Q4 12 2 8 Z" fill="#d97a3c" stroke="#3b2a18" strokeWidth={1} />
            <text x={22} y={10}>Sympathy (Alliance)</text>
          </g>
          <g transform="translate(0 228)">
            <rect x={2} y={1} width={13} height={11} fill="#d97a3c" stroke="#3b2a18" strokeWidth={1} />
            <rect x={3.5} y={2.5} width={2.5} height={2.5} fill="#3b2a18" />
            <rect x={10} y={2.5} width={2.5} height={2.5} fill="#3b2a18" />
            <text x={22} y={10}>Marquise keep</text>
          </g>

          <text y={258} fontSize={11} fontWeight={700} fill="#c9892f" letterSpacing={1}>SLOTS</text>
          <g transform="translate(0 270)">
            <circle cx={4} cy={6} r={4} fill="#3b2a18" stroke="#3b2a18" strokeWidth={1.5} opacity={0.85} />
            <circle cx={16} cy={6} r={4} fill="#f5e9d0" stroke="#3b2a18" strokeWidth={1.5} opacity={0.75} />
            <text x={28} y={10}>Used / free building slot</text>
          </g>

          <text y={302} fontSize={11} fontWeight={700} fill="#c9892f" letterSpacing={1}>OTHER</text>
          <g transform="translate(0 314)">
            <rect x={1} y={4} width={10} height={8} fill="#cdc3a8" stroke="#3b2a18" strokeWidth={1} />
            <rect x={3} y={-2} width={6} height={6} fill="#cdc3a8" stroke="#3b2a18" strokeWidth={1} />
            <text x={22} y={10}>Ruin (Vagabond can explore)</text>
          </g>
          <g transform="translate(0 332)">
            <circle cx={8} cy={6} r={2} fill="#88e08a" />
            <circle cx={8} cy={6} r={5.5} fill="none" stroke="#88e08a" strokeWidth={1.5} />
            <text x={22} y={10}>Valid move target (click)</text>
          </g>
        </g>
      )}
    </g>
  );
}
