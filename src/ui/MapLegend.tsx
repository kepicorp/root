// HTML legend pinned to the top-left of the board pane — stays in place
// when the player pans / zooms the map (similar to the zoom controls).

import { warriorArt, factionIcon } from '../assets';
import type { Faction } from '../engine/types';

const FACTION_LABEL: Record<Faction, string> = {
  marquise: 'Marquise',
  eyrie:    'Eyrie',
  alliance: 'Alliance',
  vagabond: 'Vagabond',
};
const FACTION_COLOR: Record<Faction, string> = {
  marquise: '#c03428',
  eyrie:    '#5aabaa',
  alliance: '#f0c030',
  vagabond: '#e0d4b0',
};
const SUIT_COLOR: Record<string, string> = {
  fox: '#c03428',
  mouse: '#e07858',
  rabbit: '#f0c030',
};

interface MapLegendProps {
  open: boolean;
  onToggle: () => void;
}

export function MapLegend({ open, onToggle }: MapLegendProps) {
  return (
    <div className={`map-legend ${open ? 'open' : 'closed'}`} role="group" aria-label="Map legend">
      <button className="map-legend-toggle" onClick={onToggle} type="button">
        <span className="map-legend-toggle-label">LEGEND</span>
        <span className="map-legend-toggle-icon">{open ? '×' : '▸'}</span>
      </button>
      {open && (
        <div className="map-legend-body">
          <div className="map-legend-section">
            <div className="map-legend-section-title">Suits</div>
            {(['fox', 'mouse', 'rabbit'] as const).map((s) => (
              <div key={s} className="map-legend-row">
                <span className="map-legend-dot" style={{ background: SUIT_COLOR[s] }} />
                <span>{s[0].toUpperCase() + s.slice(1)}</span>
              </div>
            ))}
          </div>

          <div className="map-legend-section">
            <div className="map-legend-section-title">Factions</div>
            {(Object.keys(FACTION_LABEL) as Faction[]).map((f) => {
              const icon = factionIcon(f) ?? warriorArt(f);
              return (
                <div key={f} className="map-legend-row">
                  {icon ? (
                    <img src={icon} alt="" className="map-legend-icon" />
                  ) : (
                    <span className="map-legend-dot" style={{ background: FACTION_COLOR[f] }} />
                  )}
                  <span>{FACTION_LABEL[f]}</span>
                </div>
              );
            })}
          </div>

          <div className="map-legend-section">
            <div className="map-legend-section-title">Tokens</div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: '#7c5c2e' }} />
              <span>Wood</span>
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot sympathy" />
              <span>Sympathy (Alliance)</span>
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot keep" />
              <span>Marquise keep</span>
            </div>
          </div>

          <div className="map-legend-section">
            <div className="map-legend-section-title">Other</div>
            <div className="map-legend-row">
              <span className="map-legend-dot ruin" />
              <span>Ruin (Vagabond can explore)</span>
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot target" />
              <span>Valid move target (click)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
