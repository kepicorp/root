// Eyrie faction panel. Shows the four Decree slots with card counts +
// suit-pip breakdown, and (when the panel belongs to the human player and
// the phase is birdsong) makes each slot clickable so the Eyrie can pick
// a card from hand to add. Replaces the previous wall of per-(card, slot)
// ActionBar buttons.

import { useEffect, useState } from 'react';
import type { GameState, Action, CardSuit } from '../../engine/types';
import { getCard } from '../../engine/cards';
import { activeFaction } from '../../engine/loop';
import type { DecreeSlot } from '../../engine/factions/eyrie/state';

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
  const canAdd = isHuman && active === 'eyrie' && state.phase === 'birdsong';
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
        <span>Leader: <strong>{e.leader}</strong></span>
      </div>

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
                  <span className="decree-pick-name">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {e.cardsAddedThisBirdsong > 0 && canAdd && (
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
    </div>
  );
}
