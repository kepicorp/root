// Eyrie faction panel. Shows the four Decree slots with card counts +
// suit-pip breakdown, and (when the panel belongs to the human player and
// the phase is birdsong) makes each slot clickable so the Eyrie can pick
// a card from hand to add. Replaces the previous wall of per-(card, slot)
// ActionBar buttons.

import { useEffect, useState } from 'react';
import type { GameState, Action, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';
import { activeFaction } from '../../engine/loop';
import type { DecreeSlot, EyrieLeader } from '../../engine/factions/eyrie/state';
import { CraftedCards } from './CraftedCards';

const LEADERS: EyrieLeader[] = ['despot', 'commander', 'charismatic', 'builder'];

const LEADER_DESC: Record<EyrieLeader, string> = {
  despot:      'Viziers: Move + Build. In battle, score 1 VP when you remove any enemy building or token.',
  commander:   'Viziers: Move + Battle. As the attacker in battle, deal +1 hit.',
  charismatic: 'Viziers: Recruit + Battle. When you Recruit, place 2 warriors instead of 1.',
  builder:     'Viziers: Recruit + Move. When you Craft, ignore Disdain for Trade (score full VP).',
};

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
  fox:    '#d97a3c',
  mouse:  '#e6c34a',
  rabbit: '#9bbd58',
  bird:   '#7da3c9',
};
const SUIT_ORDER: CardSuit[] = ['fox', 'mouse', 'rabbit', 'bird'];

export function EyriePanel({ state, isHuman, dispatch }: Props) {
  const e = state.factions.eyrie;
  const [pickingSlot, setPickingSlot] = useState<DecreeSlot | null>(null);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setPickingSlot(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!e) return null;
  const active = activeFaction(state);
  const isEyrieBirdsong = isHuman && active === 'eyrie' && state.phase === 'birdsong';
  // canAdd requires: it's Eyrie birdsong, leader has been confirmed, and no card added yet this turn.
  const canAdd = isEyrieBirdsong && !e.needsLeaderChoice && e.cardsAddedThisBirdsong < 2;
  const hand = state.hands.eyrie ?? [];

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

      {isEyrieBirdsong && e!.needsLeaderChoice && (
        <div className="eyrie-leader-picker eyrie-leader-required">
          <div className="eyrie-leader-picker-label">
            <strong>Choose your leader</strong> before adding to the Decree:
          </div>
          <div className="eyrie-leader-cards">
            {LEADERS.map(l => {
              const isCurrent = l === e!.leader;
              return (
                <button
                  key={l}
                  type="button"
                  className={`eyrie-leader-card ${isCurrent ? 'current' : ''}`}
                  onClick={() => dispatch({ kind: 'eyrie.chooseLeader', leader: l })}
                >
                  <span className="eyrie-leader-card-name">
                    {l}{isCurrent && <span className="eyrie-leader-default"> (current)</span>}
                  </span>
                  <span className="eyrie-leader-card-desc">{LEADER_DESC[l]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="decree-grid">
        {SLOT_ORDER.map(slot => {
          const pips = pipsForSlot(slot);
          const count = e.decree[slot].length;
          const armed = pickingSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              className={`decree-slot ${armed ? 'armed' : ''}`}
              onClick={() => canAdd ? setPickingSlot(s => s === slot ? null : slot) : undefined}
              disabled={!canAdd || hand.length === 0}
              title={canAdd ? `Click to add a card to ${SLOT_LABEL[slot]}` : `${SLOT_LABEL[slot]} (${count} cards)`}
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
            </button>
          );
        })}
      </div>

      {pickingSlot && canAdd && (
        <div className="decree-picker" role="dialog" aria-label={`Pick a card to add to ${SLOT_LABEL[pickingSlot]}`}>
          <div className="decree-picker-title">
            Add to <strong>{SLOT_LABEL[pickingSlot]}</strong>
            <button className="btn ghost small" onClick={() => setPickingSlot(null)} aria-label="Cancel">×</button>
          </div>
          {hand.length === 0 && <em className="dim">No cards in hand.</em>}
          <div className="decree-picker-hand">
            {hand.map(id => {
              const c = getCard(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="decree-pick-card"
                  style={{ borderColor: SUIT_COLOR[c.suit] }}
                  onClick={() => {
                    dispatch({ kind: 'eyrie.addToDecree', slot: pickingSlot, cardId: id });
                    setPickingSlot(null);
                  }}
                  title={c.name}
                >
                  <span className="decree-pick-suit" style={{ background: SUIT_COLOR[c.suit] }} />
                  <span className="decree-pick-suit-label" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                  <span className="decree-pick-name">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
