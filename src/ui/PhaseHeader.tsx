import type { GameState, Faction, Phase } from '../engine/types';
import { activeFaction } from '../engine/loop';
import { factionIcon } from '../assets';

const PHASES: readonly Phase[] = ['birdsong', 'daylight', 'evening'];

const FACTION_COLOR: Record<Faction, string> = {
  marquise: '#d97a3c',
  eyrie:    '#7da3c9',
  alliance: '#9bbd58',
  vagabond: '#b8a37a',
};

const FACTION_LABEL: Record<Faction, string> = {
  marquise: 'Marquise de Cat',
  eyrie:    'Eyrie Dynasties',
  alliance: 'Woodland Alliance',
  vagabond: 'Vagabond',
};

const PHASE_LABEL: Record<Phase, string> = {
  setup: 'Setup',
  birdsong: 'Birdsong',
  daylight: 'Daylight',
  evening: 'Evening',
  gameOver: 'Game over',
};

const PHASE_DESC: Record<Faction, Record<Phase, string>> = {
  marquise: {
    setup: '',
    birdsong: 'Place 1 wood at every Marquise sawmill on the board.',
    daylight: 'Take up to 3 actions: build, recruit (once), march, battle, overwork, craft. Spend a bird card for an extra action.',
    evening: 'Draw 1 card (+1 per 3 workshops), then discard down to 5.',
    gameOver: '',
  },
  eyrie: {
    setup: '',
    birdsong: 'Emergency-draw if hand is empty, then add up to 2 cards from hand into the Decree slots.',
    daylight: 'Resolve the Decree in order: Recruit → Move → Battle → Build. Each card needs a matching-suit clearing or you fall into Turmoil.',
    evening: 'Score VP based on roost count, draw cards, then discard down to 5.',
    gameOver: '',
  },
  alliance: {
    setup: '',
    birdsong: 'Revolt in sympathetic clearings (pay supporters) and spread sympathy to new clearings.',
    daylight: 'Take 2 + officer-count actions: mobilize, train, move, battle, recruit, organize.',
    evening: 'Draw 1 card (+1 per base), then discard down to 5.',
    gameOver: '',
  },
  vagabond: {
    setup: '',
    birdsong: 'Optionally slip to an adjacent clearing, then refresh up to (3 + face-up tea) items.',
    daylight: 'Move, battle, explore ruins, aid, quest, strike, repair, craft — each costs item exhaustion.',
    evening: 'Draw 1 card (+1 per face-up coin), then discard down to (5 + face-up bag).',
    gameOver: '',
  },
};

interface Props {
  state: GameState;
  playerFaction: Faction | null;
}

export function PhaseHeader({ state, playerFaction }: Props) {
  if (state.phase === 'setup' || state.phase === 'gameOver') return null;

  const f = activeFaction(state);
  const isHuman = f === playerFaction;
  const color = FACTION_COLOR[f];
  const icon = factionIcon(f);
  const currentIdx = PHASES.indexOf(state.phase);

  return (
    <div className={`phase-header ${isHuman ? 'human' : 'ai'}`} style={{ borderColor: color }}>
      <div className="phase-header-left">
        <div className="phase-turn">Turn {state.turn}</div>
        <div className="phase-active" style={{ color }}>
          {icon && <img src={icon} alt="" />}
          <span>{FACTION_LABEL[f]}</span>
          <span className={`turn-pill ${isHuman ? 'you' : 'cpu'}`}>
            {isHuman ? 'YOUR TURN' : 'AI'}
          </span>
        </div>
      </div>

      <div className="phase-strip" role="group" aria-label="Phase progression">
        {PHASES.map((p, i) => {
          const status = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'upcoming';
          return (
            <div key={p} className={`phase-step ${status}`} aria-current={status === 'active'}>
              <span className="phase-step-num">{i + 1}</span>
              <span className="phase-step-name">{PHASE_LABEL[p]}</span>
            </div>
          );
        })}
      </div>

      <div className="phase-desc">
        <span className="phase-desc-label">{PHASE_LABEL[state.phase]}</span>
        <span className="phase-desc-text">{PHASE_DESC[f][state.phase]}</span>
      </div>
    </div>
  );
}
