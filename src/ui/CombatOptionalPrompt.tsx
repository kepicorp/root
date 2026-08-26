import type { Action, Faction, GameState } from '../engine/types';

interface Props {
  state: GameState;
  playerFaction: Faction | null;
  dispatch: (a: Action) => void;
}

export function CombatOptionalPrompt({ state, playerFaction, dispatch }: Props) {
  const prompt = state.pendingPrompts.find((p) => p.kind === 'combat.optionalEffect');
  if (!prompt || prompt.faction !== playerFaction) return null;
  const payload = prompt.payload as {
    effect: string;
    label: string;
    params: { clearing: number; attacker: Faction; defender: Faction };
  };

  return (
    <div className="discard-picker-backdrop" role="dialog" aria-label="Optional combat effect prompt">
      <div className="discard-picker" style={{ maxWidth: 560 }}>
        <div className="discard-picker-title">
          <strong>{prompt.faction}</strong>: use <strong>{payload.label}</strong> in clearing{' '}
          <strong>{payload.params.clearing}</strong>?
        </div>
        <div className="dim" style={{ marginBottom: 8 }}>
          Optional effects resolve before final hit math and piece removal.
        </div>
        <div className="discard-picker-cards" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ kind: 'combat.chooseOptional', faction: prompt.faction, effect: payload.effect, use: true })}
          >
            Use {payload.label}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => dispatch({ kind: 'combat.chooseOptional', faction: prompt.faction, effect: payload.effect, use: false })}
          >
            Skip {payload.label}
          </button>
        </div>
      </div>
    </div>
  );
}
