// Info panel showing everything on a selected clearing. Renders as an HTML
// overlay docked in the lower-left of the board pane.

import { AUTUMN_MAP } from '../engine/map';
import type { ClearingId, GameState, Faction } from '../engine/types';
import { warriorArt, buildingArt, factionIcon } from '../assets';

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
const BUILDING_LABEL: Record<string, string> = {
  sawmill:      'Sawmill',
  workshop:     'Workshop',
  recruiter:    'Recruiter',
  roost:        'Roost',
  'base-fox':   'Base (fox)',
  'base-mouse': 'Base (mouse)',
  'base-rabbit':'Base (rabbit)',
};

interface Props {
  state: GameState;
  clearingId: ClearingId;
  isSelectedAsSource: boolean;
  onClose: () => void;
}

export function ClearingInfo({ state, clearingId, isSelectedAsSource, onClose }: Props) {
  const meta = AUTUMN_MAP.clearings.find(c => c.id === clearingId);
  const cl = state.map.clearings[clearingId];
  if (!meta || !cl) return null;

  const usedSlots = cl.buildings.length + cl.tokens.filter(t => t.kind === 'keep').length;
  const freeSlots = meta.buildingSlots - usedSlots;

  const factionsHere = (['marquise', 'eyrie', 'alliance', 'vagabond'] as const).filter(f => {
    const hasWarriors = (cl.warriors[f] ?? 0) > 0;
    const hasBuilding = cl.buildings.some(b => b.faction === f);
    const hasToken = cl.tokens.some(t => t.faction === f);
    const isVagabond = f === 'vagabond' && cl.vagabondHere;
    return hasWarriors || hasBuilding || hasToken || isVagabond;
  });

  const woodCount = cl.tokens.filter(t => t.kind === 'wood').length;
  const sympathyHere = cl.tokens.some(t => t.kind === 'sympathy');
  const keepHere = cl.tokens.some(t => t.kind === 'keep');

  return (
    <div className="clearing-info" role="dialog" aria-label={`Clearing ${meta.id} details`}>
      <div className="clearing-info-head" style={{ borderColor: suitColor(meta.suit) }}>
        <span className="clearing-info-num" style={{ background: suitColor(meta.suit) }}>
          {meta.id}
        </span>
        <span className="clearing-info-suit">{meta.suit}</span>
        {meta.hasRuin && <span className="badge ruin">ruin</span>}
        {isSelectedAsSource && <span className="badge source">move source</span>}
        <button
          className="clearing-info-close"
          onClick={onClose}
          aria-label="Close clearing info"
          title="Close (Esc)"
        >×</button>
      </div>

      <div className="clearing-info-row">
        <span className="dim">slots</span>
        <span className="slots-strip" aria-label={`${usedSlots} of ${meta.buildingSlots} slots used`}>
          {Array.from({ length: meta.buildingSlots }).map((_, i) => (
            <span key={i} className={`slot-dot ${i < usedSlots ? 'used' : 'free'}`} />
          ))}
        </span>
        <span>{usedSlots} / {meta.buildingSlots} <span className="dim">({freeSlots} free)</span></span>
      </div>

      {factionsHere.length === 0 ? (
        <div className="clearing-info-empty">No factions here.</div>
      ) : (
        <div className="clearing-info-factions">
          {factionsHere.map(f => {
            const icon = factionIcon(f) ?? warriorArt(f);
            const warriors = cl.warriors[f] ?? 0;
            const bldgs = cl.buildings.filter(b => b.faction === f);
            return (
              <div key={f} className="clearing-info-faction">
                <div className="clearing-info-faction-head" style={{ color: FACTION_COLOR[f] }}>
                  {icon && <img src={icon} alt="" />}
                  <span>{FACTION_LABEL[f]}</span>
                </div>
                <div className="clearing-info-faction-body">
                  {warriors > 0 && (
                    <div className="line">
                      {warriorArt(f) && <img src={warriorArt(f)!} alt="" className="tiny" />}
                      <span>{warriors} warrior{warriors === 1 ? '' : 's'}</span>
                    </div>
                  )}
                  {bldgs.map((b, idx) => {
                    const art = buildingArt(f, b.kind);
                    return (
                      <div key={idx} className="line">
                        {art && <img src={art} alt="" className="tiny" />}
                        <span>{BUILDING_LABEL[b.kind] ?? b.kind}</span>
                      </div>
                    );
                  })}
                  {f === 'vagabond' && cl.vagabondHere && (
                    <div className="line dim">pawn present</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(woodCount > 0 || sympathyHere || keepHere) && (
        <div className="clearing-info-tokens">
          {woodCount > 0 && <span className="badge wood">{woodCount} wood</span>}
          {sympathyHere && <span className="badge sympathy">sympathy</span>}
          {keepHere && <span className="badge keep">keep</span>}
        </div>
      )}
    </div>
  );
}

function suitColor(s: string): string {
  if (s === 'fox') return '#c03428';
  if (s === 'mouse') return '#e07858';
  return '#f0c030';
}
