// HTML legend pinned to the top-left of the board pane — stays in place
// when the player pans / zooms the map (similar to the zoom controls).

import { warriorArt, buildingArt, woodArt } from '../assets';
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
  mouse: '#D68860',
  rabbit: '#f0c030',
};

function PieceImage({ src, label, fallbackColor }: { src: string | null; label: string; fallbackColor: string }) {
  return src ? (
    <img src={src} alt={label} className="map-legend-piece" />
  ) : (
    <span className="map-legend-piece map-legend-piece-fallback" style={{ background: fallbackColor }} />
  );
}

function WoodImage() {
  const src = woodArt();
  return src ? (
    <img src={src} alt="Wood" className="map-legend-wood" />
  ) : (
    <span className="map-legend-wood map-legend-wood-fallback" aria-hidden="true" />
  );
}

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
              const warrior = warriorArt(f);
              const color = FACTION_COLOR[f];
              return (
                <div key={f} className="map-legend-piece-group">
                  <div className="map-legend-row map-legend-row-title">
                    <span>{FACTION_LABEL[f]}</span>
                  </div>
                  <div className="map-legend-piece-rows">
                    <div className="map-legend-row map-legend-row-subtle">
                      <PieceImage src={warrior} label={`${FACTION_LABEL[f]} warrior`} fallbackColor={color} />
                      <span>Warrior</span>
                    </div>
                    {f === 'marquise' && (
                      <>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('marquise', 'sawmill')} label="Sawmill" fallbackColor={color} />
                          <span>Sawmill</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('marquise', 'workshop')} label="Workshop" fallbackColor={color} />
                          <span>Workshop</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('marquise', 'recruiter')} label="Recruiter" fallbackColor={color} />
                          <span>Recruiter</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('marquise', 'keep')} label="Keep" fallbackColor={color} />
                          <span>Keep</span>
                        </div>
                      </>
                    )}
                    {f === 'eyrie' && (
                      <div className="map-legend-row map-legend-row-subtle">
                        <PieceImage src={buildingArt('eyrie', 'roost')} label="Roost" fallbackColor={color} />
                        <span>Roost</span>
                      </div>
                    )}
                    {f === 'alliance' && (
                      <>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('alliance', 'base-fox')} label="Base (fox)" fallbackColor={color} />
                          <span>Base (fox)</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('alliance', 'base-mouse')} label="Base (mouse)" fallbackColor={color} />
                          <span>Base (mouse)</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('alliance', 'base-rabbit')} label="Base (rabbit)" fallbackColor={color} />
                          <span>Base (rabbit)</span>
                        </div>
                        <div className="map-legend-row map-legend-row-subtle">
                          <PieceImage src={buildingArt('alliance', 'sympathy')} label="Sympathy" fallbackColor={color} />
                          <span>Sympathy</span>
                        </div>
                      </>
                    )}
                    {f === 'vagabond' && (
                      <div className="map-legend-row map-legend-row-subtle">
                        <PieceImage src={warrior} label="Vagabond pawn" fallbackColor={color} />
                        <span>Pawn</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="map-legend-section">
            <div className="map-legend-section-title">Tokens</div>
            <div className="map-legend-row">
              <WoodImage />
              <span>Wood</span>
            </div>
            <div className="map-legend-row">
              <PieceImage src={buildingArt('alliance', 'sympathy')} label="Sympathy token" fallbackColor={FACTION_COLOR.alliance} />
              <span>Sympathy (Alliance)</span>
            </div>
            <div className="map-legend-row">
              <PieceImage src={buildingArt('marquise', 'keep')} label="Keep token" fallbackColor={FACTION_COLOR.marquise} />
              <span>Marquise keep</span>
            </div>
          </div>

          <div className="map-legend-section">
            <div className="map-legend-section-title">Clearing spaces</div>
            <div className="map-legend-row">
              <span className="map-legend-slot ruin" />
              <span>Ruin-filled slot</span>
            </div>
            <div className="map-legend-row">
              <span className="map-legend-slot empty" />
              <span>Empty slot</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
