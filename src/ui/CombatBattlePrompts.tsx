import { useEffect, useMemo, useState } from 'react';
import type { Action, Faction, GameState } from '../engine/types';
import { getCard } from '../engine/cards';

interface Props {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (a: Action) => void;
}

export function CombatRemovalOrderPrompt({ state, playerFaction, dispatch }: Props) {
  const prompt = state.pendingPrompts.find((p) => p.kind === 'combat.removalPieces');
  if (!prompt || prompt.faction !== playerFaction) return null;
  const payload = prompt.payload as {
    side: 'attacker' | 'defender';
    required: number;
    available: Array<{ id: string; kind: string; category: 'building' | 'token' }>;
    params: { attacker: Faction; defender: Faction; clearing: number };
  };
  const targetFaction = payload.side === 'attacker' ? payload.params.attacker : payload.params.defender;
  const [selected, setSelected] = useState<string[]>([]);
  const canSubmit = selected.length === payload.required;
  const normalized = useMemo(() => payload.available, [payload.available]);

  useEffect(() => {
    setSelected([]);
  }, [prompt.id]);

  function toggle(id: string): void {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= payload.required) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="discard-picker-backdrop" role="dialog" aria-label="Combat removal order prompt">
      <div className="discard-picker" style={{ maxWidth: 560 }}>
        <div className="discard-picker-title">
          <strong>{targetFaction}</strong>: choose <strong>{payload.required}</strong> piece(s) to remove in clearing{' '}
          <strong>{payload.params.clearing}</strong>.
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          Remove warriors first when required, then remove cardboard pieces as legal.
        </div>
        <div className="discard-picker-cards" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {normalized.map((piece) => {
            const on = selected.includes(piece.id);
            return (
              <button
                key={piece.id}
                type="button"
                className={`action-card-pick${on ? ' selected' : ''}`}
                onClick={() => toggle(piece.id)}
              >
                {piece.category}: {piece.kind}
              </button>
            );
          })}
          <button
            type="button"
            className="btn"
            disabled={!canSubmit}
            onClick={() => dispatch({ kind: 'combat.chooseRemovalPieces', faction: prompt.faction, side: payload.side, pieceIds: selected })}
          >
            Confirm removal
          </button>
        </div>
      </div>
    </div>
  );
}

export function CombatFieldHospitalsPrompt({ state, playerFaction, dispatch }: Props) {
  const prompt = state.pendingPrompts.find((p) => p.kind === 'combat.fieldHospitals');
  if (!prompt || prompt.faction !== playerFaction) return null;
  const payload = prompt.payload as { suit: 'fox' | 'mouse' | 'rabbit'; warriorsLost: number };
  const options = state.hands.marquise.filter((id) => {
    const c = getCard(id);
    return c.suit === payload.suit || c.suit === 'bird';
  });

  return (
    <div className="discard-picker-backdrop" role="dialog" aria-label="Field Hospitals prompt">
      <div className="discard-picker" style={{ maxWidth: 560 }}>
        <div className="discard-picker-title">
          <strong>Field Hospitals:</strong> spend a {payload.suit} or bird card to revive{' '}
          <strong>{payload.warriorsLost}</strong> Marquise warrior(s) at the keep?
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          This resolves after battle cleanup, before play continues.
        </div>
        <div className="discard-picker-cards" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {options.map((id) => {
            const c = getCard(id);
            return (
              <button
                key={id}
                type="button"
                className="action-card-pick"
                onClick={() => dispatch({ kind: 'combat.resolveFieldHospitals', faction: 'marquise', cardId: id })}
              >
                {c.name}
              </button>
            );
          })}
          <button
            type="button"
            className="btn ghost"
            onClick={() => dispatch({ kind: 'combat.resolveFieldHospitals', faction: 'marquise' })}
          >
            Skip field hospitals
          </button>
        </div>
      </div>
    </div>
  );
}
