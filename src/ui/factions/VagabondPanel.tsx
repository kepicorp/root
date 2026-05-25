import type { GameState, Action } from '../../engine/types';
import { itemArt } from '../../assets';
import { CraftedCards } from './CraftedCards';

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

const REL_LABEL: Record<string, string> = {
  hostile: 'hostile',
  indifferent: '–',
  '1': 'I',
  '2': 'II',
  '3': 'III',
  allied: 'allied',
};

export function VagabondPanel({ state }: Props) {
  const v = state.factions.vagabond;
  if (!v) return null;
  return (
    <div className="faction-panel vagabond">
      <h3>Vagabond — {v.character}</h3>
      <div className="vagabond-line">
        <span className="dim">clearing</span> {v.clearing}
        <span className="dim"> · ruins</span> {v.ruinsExplored}/4
        <span className="dim"> · quests</span> {v.completedQuests.length}
      </div>
      <div className="vagabond-items" aria-label="Vagabond items">
        {v.items.map((it, idx) => {
          const art = itemArt(it.kind);
          return (
            <div
              key={idx}
              className={`vagabond-item ${it.state} ${it.exhausted ? 'exhausted' : ''}`}
              title={`${it.kind} · ${it.state}${it.exhausted ? ' · exhausted' : ''}`}
            >
              {art ? <img src={art} alt={it.kind} /> : <span>{it.kind[0]}</span>}
            </div>
          );
        })}
      </div>
      <div className="vagabond-rel">
        <span className="dim">rel:</span>
        {(['marquise', 'eyrie', 'alliance'] as const).map(f => (
          <span key={f} className={`rel rel-${String(v.relationships[f])}`}>
            {f[0].toUpperCase()}:{REL_LABEL[String(v.relationships[f])] ?? v.relationships[f]}
          </span>
        ))}
      </div>
      <CraftedCards state={state} faction="vagabond" />
    </div>
  );
}
