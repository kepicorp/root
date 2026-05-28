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

const REL_STEPS = ['hostile', 'indifferent', 1, 2, 3, 'allied'] as const;
const REL_LABEL: Record<string, string> = {
  hostile: 'Hostile',
  indifferent: 'Indiff.',
  '1': 'I',
  '2': 'II',
  '3': 'III',
  allied: 'Allied',
};

function aidsToNextLevel(rel: string | number): number | null {
  // hostile can only be repaired by aiding; find position
  const idx = REL_STEPS.indexOf(rel as never);
  if (idx < 0 || idx === REL_STEPS.length - 1) return null;
  return 1; // each aid bumps one step
}

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

interface ItemGroupProps {
  label: string;
  items: { kind: string; state: string; exhausted: boolean }[];
  stateClass: string;
}

function ItemGroup({ label, items, stateClass }: ItemGroupProps) {
  if (items.length === 0) return null;
  return (
    <div className={`item-group item-group-${stateClass}`}>
      <span className="item-group-label">{label}</span>
      <div className="item-group-row">
        {items.map((it, idx) => {
          const art = itemArt(it.kind as never);
          return (
            <div key={idx} className={`vagabond-item ${stateClass}`} title={it.kind}>
              {art ? <img src={art} alt={it.kind} /> : <span>{it.kind[0]!.toUpperCase()}</span>}
              <span className="vagabond-item-name">{it.kind}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
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
        <span className="dim"> · ruins</span> {v.exploredRuins.length}/4
        <span className="dim"> · quests done</span> {v.completedQuests.length}
      </div>
      <div className="vagabond-item-track" aria-label="Vagabond items">
        <ItemGroup label="Ready" items={v.items.filter(it => it.state === 'face-up' && !it.exhausted)} stateClass="ready" />
        <ItemGroup label="Exhausted" items={v.items.filter(it => it.state === 'face-up' && it.exhausted)} stateClass="exhausted" />
        <ItemGroup label="Satchel" items={v.items.filter(it => it.state === 'face-down')} stateClass="satchel" />
        <ItemGroup label="Damaged" items={v.items.filter(it => it.state === 'damaged')} stateClass="damaged" />
      </div>
      {(() => {
        const TRACK_ITEMS = ['torch', 'crossbow', 'bag'] as const;
        const faceUpTrack = TRACK_ITEMS.reduce((s, k) => s + v.items.filter(i => i.kind === k && i.state === 'face-up').length, 0);
        const cap = 6 + 2 * faceUpTrack;
        const used = v.items.filter(i => i.state === 'face-down' || i.state === 'damaged').length;
        const over = used > cap;
        return (
          <div className={`vagabond-capacity${over ? ' over' : ''}`}>
            <span className="dim">Satchel+Damaged:</span> {used}/{cap}
            {over && <span className="vagabond-capacity-warn"> ⚠ remove {used - cap}</span>}
          </div>
        );
      })()}
      <div className="vagabond-relationships">
        <div className="vagabond-rel-title">Relationships</div>
        {(['marquise', 'eyrie', 'alliance'] as const).map(f => {
          const rel = v.relationships[f];
          const relStr = String(rel);
          const curIdx = REL_STEPS.indexOf(rel as never);
          const toNext = aidsToNextLevel(relStr);
          const isAllied = rel === 'allied';
          return (
            <div key={f} className={`vagabond-rel-row rel-${relStr}`}>
              <span className="vagabond-rel-faction">{f[0]!.toUpperCase() + f.slice(1)}</span>
              <div className="vagabond-rel-ladder">
                {REL_STEPS.map((step, i) => (
                  <span
                    key={String(step)}
                    className={`vagabond-rel-step ${i === curIdx ? 'current' : ''} ${i < curIdx ? 'past' : ''}`}
                    title={String(REL_LABEL[String(step)] ?? step)}
                  >
                    {REL_LABEL[String(step)] ?? String(step)}
                  </span>
                ))}
              </div>
              <span className="vagabond-rel-hint dim">
                {isAllied
                  ? '✓ free move, no hostile extra boot'
                  : toNext != null
                    ? `+${toNext} aid → next`
                    : ''}
              </span>
            </div>
          );
        })}
        <div className="vagabond-rel-legend dim">
          Hostile: +1 VP on kill · Allied: free movement · Attacking = hostile
        </div>
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
