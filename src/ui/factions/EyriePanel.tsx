// Eyrie faction panel — info only. Shows leader, decree slot counts with
// suit-pip breakdown, and daylight resolution progress. All interactive
// birdsong controls (add to decree, choose leader) live in ActionBar.

import type { GameState, Action, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';
import { activeFaction } from '../../engine/loop';
import type { DecreeSlot, EyrieLeader } from '../../engine/factions/eyrie/state';
import { CraftedCards } from './CraftedCards';

const LEADER_VIZIERS: Record<EyrieLeader, string> = {
  despot:      'Move + Build',
  commander:   'Move + Battle',
  charismatic: 'Recruit + Battle',
  builder:     'Recruit + Move',
};

const LEADER_ABILITY: Record<EyrieLeader, string> = {
  despot:      'Score 1 VP per enemy building/token removed in battle.',
  commander:   '+1 hit when attacking.',
  charismatic: 'Recruit places 2 warriors instead of 1.',
  builder:     'Ignore Disdain for Trade when Crafting.',
};

interface Props {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

const SLOT_ORDER: DecreeSlot[] = ['recruit', 'move', 'battle', 'build'];
const SLOT_LABEL: Record<DecreeSlot, string> = {
  recruit: 'Recruit',
  move:    'Move',
  battle:  'Battle',
  build:   'Build',
};
const SLOT_GLYPH: Record<DecreeSlot, string> = {
  recruit: '👥',
  move:    '➜',
  battle:  '⚔',
  build:   '⌂',
};
const SUIT_COLOR: Record<CardSuit, string> = {
  fox:    '#c03428',
  mouse:  '#e07858',
  rabbit: '#f0c030',
  bird:   '#5aabaa',
};
const SUIT_ORDER: CardSuit[] = ['fox', 'mouse', 'rabbit', 'bird'];

export function EyriePanel({ state, isHuman, dispatch: _dispatch }: Props) {
  const e = state.factions.eyrie;
  if (!e) return null;
  const active = activeFaction(state);
  const isEyrieBirdsong = isHuman && active === 'eyrie' && state.phase === 'birdsong';

  function pipsForSlot(slot: DecreeSlot): Record<CardSuit, number> {
    const counts: Record<CardSuit, number> = { fox: 0, mouse: 0, rabbit: 0, bird: 0 };
    for (const id of e!.decree[slot]) counts[getCard(id).suit] += 1;
    return counts;
  }

  return (
    <div className="faction-panel eyrie">
      <h3>Eyrie Dynasties</h3>
      <div className="eyrie-stats">
        <span>Warriors: <strong>{e.warriorSupply}</strong></span>
        <span>Roosts: <strong>{e.roosts.length}/7</strong></span>
        <span>Leader: <strong>{e.leader}</strong>
          {e.leader && <span className="eyrie-leader-viziers"> · {LEADER_VIZIERS[e.leader]}</span>}
        </span>
      </div>
      {e.leader && (
        <div className="eyrie-leader-ability">{LEADER_ABILITY[e.leader]}</div>
      )}

      {isEyrieBirdsong && e.needsLeaderChoice && (
        <div className="eyrie-choose-leader-hint">Choose your leader in the action panel →</div>
      )}

      <div className="decree-grid">
        {SLOT_ORDER.map(slot => {
          const pips = pipsForSlot(slot);
          const count = e.decree[slot].length;
          return (
            <div
              key={slot}
              className="decree-slot"
              title={`${SLOT_LABEL[slot]} (${count} cards)`}
            >
              <span className="decree-slot-glyph" aria-hidden>{SLOT_GLYPH[slot]}</span>
              <span className="decree-slot-name">{SLOT_LABEL[slot]}</span>
              <span className="decree-slot-count">{count}</span>
              <span className="decree-slot-pips">
                {SUIT_ORDER.map(s => pips[s] > 0 ? (
                  <span key={s} className="decree-pip-group" title={`${pips[s]} ${s}`}>
                    {Array.from({ length: pips[s] }).map((_, i) => (
                      <span key={i} className="decree-pip" style={{ background: SUIT_COLOR[s] }} />
                    ))}
                  </span>
                ) : null)}
              </span>
            </div>
          );
        })}
      </div>

      {e.cardsAddedThisBirdsong > 0 && isEyrieBirdsong && (
        <div className="dim eyrie-progress">
          Added {e.cardsAddedThisBirdsong} card{e.cardsAddedThisBirdsong === 1 ? '' : 's'} this birdsong.
        </div>
      )}

      {isHuman && active === 'eyrie' && state.phase === 'daylight' && e.resolutionLeft && (
        <div className="eyrie-resolution">
          <div className="eyrie-resolution-title">Resolving Decree</div>
          <div className="eyrie-resolution-row">
            {SLOT_ORDER.map(s => (
              <span key={s} className={`eyrie-res-step ${e.resolutionLeft![s] > 0 ? 'todo' : 'done'}`}>
                <span className="eyrie-res-step-glyph">{SLOT_GLYPH[s]}</span>
                {SLOT_LABEL[s]}: <strong>{e.decree[s].length - e.resolutionLeft![s]}/{e.decree[s].length}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
      <CraftedCards state={state} faction="eyrie" />
    </div>
  );
}
