// Aggregate legal actions across factions. The engine asks the active faction
// (and only the active faction) for its legal action set; each faction
// reducer module provides its own implementation.

import type { GameState, Action } from './types';
import { activeFaction, hasUnresolvedFactionChoice } from './loop';
import { marquiseLegalActions } from './factions/marquise/reducer';
import { eyrieLegalActions } from './factions/eyrie/reducer';
import { allianceLegalActions } from './factions/alliance/reducer';
import { vagabondLegalActions } from './factions/vagabond/reducer';
import { defenderAmbushOptions, type CombatParams } from './combat';
import { cardEffectLegalActions } from './card-effects';
import { getCard } from './cards';
import { getSetupLegalActions } from './setup';

export function getLegalActions(state: GameState): Action[] {
  if (state.phase === 'setup') return getSetupLegalActions(state);
  if (state.phase === 'gameOver') return [];

  // When a prompt is pending, the respondent's response is the only legal action.
  const prompt = state.pendingPrompts[0];
  if (prompt && prompt.kind === 'combat.miceCancel') {
    return [
      { kind: 'combat.skipAmbush', faction: prompt.faction },
      { kind: 'card.miceInABush', faction: prompt.faction, cardId: (prompt.payload as CombatParams & { miceId: string }).miceId },
    ] as Action[];
  }
  if (prompt && prompt.kind === 'combat.defenderAmbush') {
    const payload = prompt.payload as { clearing: number };
    const ambushes = defenderAmbushOptions(state, payload.clearing, prompt.faction);
    const out: Action[] = [{ kind: 'combat.skipAmbush', faction: prompt.faction }];
    for (const cardId of ambushes) {
      out.push({ kind: 'combat.playAmbush', faction: prompt.faction, cardId });
    }
    return out;
  }
  if (prompt && prompt.kind === 'combat.attackerCounterAmbush') {
    const payload = prompt.payload as { clearing: number };
    const ambushes = defenderAmbushOptions(state, payload.clearing, prompt.faction);
    const out: Action[] = [{ kind: 'combat.skipAmbush', faction: prompt.faction }];
    for (const cardId of ambushes) {
      out.push({ kind: 'combat.playAmbush', faction: prompt.faction, cardId });
    }
    return out;
  }
  if (prompt && prompt.kind === 'combat.optionalEffect') {
    const payload = prompt.payload as { effect: string };
    return [
      { kind: 'combat.chooseOptional', faction: prompt.faction, effect: payload.effect, use: true },
      { kind: 'combat.chooseOptional', faction: prompt.faction, effect: payload.effect, use: false },
    ] as Action[];
  }
  if (prompt && prompt.kind === 'combat.removalPieces') {
    const payload = prompt.payload as {
      side: 'attacker' | 'defender';
      required: number;
      available: Array<{ id: string }>;
    };
    const pick = payload.available.slice(0, payload.required).map((p) => p.id);
    return [
      { kind: 'combat.chooseRemovalPieces', faction: prompt.faction, side: payload.side, pieceIds: pick },
    ] as Action[];
  }
  if (prompt && prompt.kind === 'combat.fieldHospitals') {
    const payload = prompt.payload as { suit: 'fox' | 'mouse' | 'rabbit' };
    const options = state.hands.marquise.filter((id) => {
      const c = getCard(id);
      return c.suit === payload.suit || c.suit === 'bird';
    });
    const out: Action[] = [{ kind: 'combat.resolveFieldHospitals', faction: 'marquise' }];
    for (const cardId of options) {
      out.push({ kind: 'combat.resolveFieldHospitals', faction: 'marquise', cardId });
    }
    return out;
  }

  const f = activeFaction(state);
  const factionActions =
    f === 'marquise' ? marquiseLegalActions(state) :
    f === 'eyrie'    ? eyrieLegalActions(state)    :
    f === 'alliance' ? allianceLegalActions(state) :
    f === 'vagabond' ? vagabondLegalActions(state) :
    [];
  if (hasUnresolvedFactionChoice(state)) {
    return factionActions;
  }
  // System actions are always available when the active faction is not
  // awaiting a required yes/no or choose-one response.
  return [
    { kind: 'system.advancePhase' },
    { kind: 'system.endTurn' },
    ...factionActions,
    ...cardEffectLegalActions(state),
  ];
}
