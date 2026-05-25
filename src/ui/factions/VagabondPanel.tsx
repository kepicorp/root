import type { GameState, Action } from '../../engine/types';
import { itemArt } from '../../assets';
import { activeFaction } from '../../engine/loop';
import { AUTUMN_MAP } from '../../engine/map';
import { QUEST_DECK, getQuest } from '../../engine/factions/vagabond/quests';
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

const SUIT_COLOR: Record<string, string> = {
  fox:    '#d97a3c',
  mouse:  '#e6c34a',
  rabbit: '#9bbd58',
  bird:   '#7da3c9',
};

const QUEST_NAMES: Record<string, string> = {
  'q-fox-1':    'Errand',
  'q-fox-2':    'Escort',
  'q-fox-3':    'Delivery',
  'q-mouse-1':  'Night Errand',
  'q-mouse-2':  'Repair Job',
  'q-mouse-3':  'Protection',
  'q-rabbit-1': 'Guard Duty',
  'q-rabbit-2': 'Herbalism',
  'q-rabbit-3': 'Message Run',
};

function ItemIcon({ kind }: { kind: string }) {
  const art = itemArt(kind as never);
  return art
    ? <img src={art} alt={kind} className="quest-item-icon" title={kind} />
    : <span className="quest-item-text">{kind}</span>;
}

export function VagabondPanel({ state, isHuman, dispatch }: Props) {
  const v = state.factions.vagabond;
  if (!v) return null;

  const active = activeFaction(state);
  const canAct = isHuman && active === 'vagabond' && state.phase === 'daylight' && v.daylightActionsLeft > 0;

  const clearingMeta = v.clearing != null
    ? AUTUMN_MAP.clearings.find(c => c.id === v.clearing)
    : undefined;

  function canCompleteQuest(questId: string): boolean {
    if (!canAct || !clearingMeta) return false;
    const q = getQuest(questId);
    if (clearingMeta.suit !== q.suit) return false;
    const freeItems = (kind: string) =>
      v!.items.filter(i => i.kind === kind && i.state === 'face-up' && !i.exhausted).length;
    if (q.item1 === q.item2) return freeItems(q.item1) >= 2;
    return freeItems(q.item1) >= 1 && freeItems(q.item2) >= 1;
  }

  const completedByQuest = Object.fromEntries(
    QUEST_DECK.map(q => [q.id, v.completedQuests.filter(id => id === q.id).length])
  );

  return (
    <div className="faction-panel vagabond">
      <h3>Vagabond — {v.character}</h3>
      <div className="vagabond-line">
        <span className="dim">clearing</span> {v.clearing ?? '—'}
        <span className="dim"> · ruins</span> {v.ruinsExplored}/4
        <span className="dim"> · quests done</span> {v.completedQuests.length}
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

      {v.questDisplay.length > 0 && (
        <div className="quest-display">
          <div className="quest-display-title">
            Available quests
            <span className="dim"> ({v.questDeck.length} in deck)</span>
          </div>
          {v.questDisplay.map(questId => {
            const q = getQuest(questId);
            const completable = canCompleteQuest(questId);
            const timesCompleted = completedByQuest[questId] ?? 0;
            const vpReward = q.baseVp + v.completedQuests.filter(id => id !== questId && getQuest(id).suit === q.suit).length;
            return (
              <div key={questId} className={`quest-card ${completable ? 'completable' : ''}`} style={{ borderColor: SUIT_COLOR[q.suit] }}>
                <div className="quest-card-header">
                  <span className="quest-suit-dot" style={{ background: SUIT_COLOR[q.suit] }} />
                  <span className="quest-suit-label" style={{ color: SUIT_COLOR[q.suit] }}>{q.suit}</span>
                  <span className="quest-name">{QUEST_NAMES[questId] ?? questId}</span>
                  <span className="quest-vp dim">+{vpReward} VP{timesCompleted > 0 && ` (done ×${timesCompleted})`}</span>
                </div>
                <div className="quest-items">
                  <ItemIcon kind={q.item1} />
                  <span className="quest-items-sep">+</span>
                  <ItemIcon kind={q.item2} />
                </div>
                {completable && (
                  <button
                    type="button"
                    className="btn primary small quest-complete-btn"
                    onClick={() => dispatch({ kind: 'vagabond.completeQuest', questId })}
                  >
                    Complete quest
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CraftedCards state={state} faction="vagabond" />
    </div>
  );
}
