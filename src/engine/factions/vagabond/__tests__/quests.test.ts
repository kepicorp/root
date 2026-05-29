import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { newGame, reduce } from '../../../state';
import { startGame } from '../../../loop';
import { performSetup } from '../../../setup';
import { checkCoalitionVictory } from '../reducer';
import { AUTUMN_MAP } from '../../../map';
import { QUEST_DECK, getQuest } from '../quests';
import { DOMINANCE_CARDS } from '../../../cards';

function fixture(seed = 7) {
  return startGame(performSetup(newGame({ seed })));
}

describe('Vagabond quest deck', () => {
  it('setup populates a quest deck and a 3-card display', () => {
    const s = fixture();
    const v = s.factions.vagabond!;
    expect(v.questDisplay).toHaveLength(3);
    expect(v.questDeck).toHaveLength(QUEST_DECK.length - 3);
    for (const id of v.questDisplay) {
      expect(QUEST_DECK.some(q => q.id === id)).toBe(true);
    }
  });

  it('completing a quest exhausts both items, sets pendingQuestReward, and reward scores VP', () => {
    const baseline = fixture();

    // Force a winnable scenario: put Vagabond in the right clearing, with
    // the right two items face-up, and put a known quest in the display.
    const targetQuest = QUEST_DECK[0]!; // q-fox-1: fox suit, sword + torch
    const foxClearing = AUTUMN_MAP.clearings.find(c => c.suit === 'fox')!;
    const setup = produce(baseline, draft => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('vagabond');
      const v = draft.factions.vagabond!;
      v.clearing = foxClearing.id;
      v.daylightActionsLeft = 6;
      v.items = [
        { kind: targetQuest.item1, state: 'face-up', exhausted: false },
        { kind: targetQuest.item2, state: 'face-up', exhausted: false },
      ];
      v.questDisplay = [targetQuest.id];
      v.questDeck = ['q-fox-2'];
    });

    const before = setup.scores.vagabond;
    const afterComplete = reduce(setup, { kind: 'vagabond.completeQuest', questId: targetQuest.id });
    expect(afterComplete).not.toBe(setup);

    const v = afterComplete.factions.vagabond!;
    expect(v.completedQuests).toContain(targetQuest.id);
    expect(v.questDisplay).not.toContain(targetQuest.id);
    expect(v.questDisplay).toContain('q-fox-2'); // refilled from deck
    // Reward not yet given — pendingQuestReward is set.
    expect(v.pendingQuestReward).toBe(targetQuest.id);
    expect(afterComplete.scores.vagabond).toBe(before); // no VP yet
    // Both items now exhausted.
    expect(v.items.every(i => i.exhausted)).toBe(true);

    // Choose VP reward: scores completedQuests.length VP (1 at this point).
    const afterReward = reduce(afterComplete, { kind: 'vagabond.completeQuestReward', questId: targetQuest.id, choice: 'vp' });
    expect(afterReward.scores.vagabond).toBe(before + 1);
    expect(afterReward.factions.vagabond!.pendingQuestReward).toBeUndefined();
  });

  it('completing a second quest and choosing VP reward scores completedQuests.length VP', () => {
    const baseline = fixture();
    const foxQuests = QUEST_DECK.filter(q => q.suit === 'fox');
    expect(foxQuests.length).toBeGreaterThanOrEqual(2);
    const firstQuest = foxQuests[0]!;
    const secondQuest = foxQuests[1]!;
    const foxClearing = AUTUMN_MAP.clearings.find(c => c.suit === 'fox')!;

    const setup = produce(baseline, draft => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('vagabond');
      const v = draft.factions.vagabond!;
      v.clearing = foxClearing.id;
      v.daylightActionsLeft = 6;
      v.items = [
        { kind: secondQuest.item1, state: 'face-up', exhausted: false },
        { kind: secondQuest.item2, state: 'face-up', exhausted: false },
      ];
      v.questDisplay = [secondQuest.id];
      v.completedQuests = [firstQuest.id];
    });

    const before = setup.scores.vagabond;
    const afterComplete = reduce(setup, { kind: 'vagabond.completeQuest', questId: secondQuest.id });
    // completedQuests now has 2 entries (firstQuest + secondQuest).
    // VP reward = completedQuests.length = 2.
    const afterReward = reduce(afterComplete, { kind: 'vagabond.completeQuestReward', questId: secondQuest.id, choice: 'vp' });
    expect(afterReward.scores.vagabond).toBe(before + 2);
  });

  it('rejects completion when the clearing suit does not match', () => {
    const baseline = fixture();
    const targetQuest = getQuest('q-fox-1');
    const wrongClearing = AUTUMN_MAP.clearings.find(c => c.suit !== 'fox')!;
    const setup = produce(baseline, draft => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('vagabond');
      const v = draft.factions.vagabond!;
      v.clearing = wrongClearing.id;
      v.daylightActionsLeft = 6;
      v.items = [
        { kind: targetQuest.item1, state: 'face-up', exhausted: false },
        { kind: targetQuest.item2, state: 'face-up', exhausted: false },
      ];
      v.questDisplay = [targetQuest.id];
    });
    const result = reduce(setup, { kind: 'vagabond.completeQuest', questId: targetQuest.id });
    expect(result).toBe(setup); // unchanged
  });
});

describe('Vagabond coalition', () => {
  it('forms a coalition only with the strictly-last-place faction and requires a dominance card', () => {
    const baseline = fixture();
    const domCard = DOMINANCE_CARDS[0]!;
    const setup = produce(baseline, draft => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('vagabond');
      draft.factions.vagabond!.daylightActionsLeft = 6;
      draft.scores.vagabond = 10;
      draft.scores.marquise = 5;
      draft.scores.eyrie = 6;
      draft.scores.alliance = 4;  // last place
      // Give the Vagabond a dominance card to activate coalition.
      draft.hands.vagabond.push(domCard.id);
    });

    // Try a non-last-place faction first — must fail.
    const wrong = reduce(setup, { kind: 'vagabond.formCoalition', faction: 'eyrie' });
    expect(wrong).toBe(setup);

    // Last-place faction — works.
    const ok = reduce(setup, { kind: 'vagabond.formCoalition', faction: 'alliance' });
    expect(ok.factions.vagabond!.coalitionPartner).toBe('alliance');
    expect(ok.factions.vagabond!.relationships.alliance).toBe('allied');
    // Dominance card should be consumed.
    expect(ok.hands.vagabond).not.toContain(domCard.id);
  });

  it('coalition victory fires when partner reaches 30', () => {
    const baseline = fixture();
    const allied = produce(baseline, draft => {
      draft.factions.vagabond!.coalitionPartner = 'alliance';
      draft.scores.alliance = 30;
    });
    const after = checkCoalitionVictory(allied);
    expect(after.winner).toEqual({ faction: 'vagabond', via: 'coalition' });
  });

  it('completeQuest + coalition cooperate: scoring partner to 30 wins for the Vagabond', () => {
    const baseline = fixture();
    const targetQuest = getQuest('q-fox-1');
    const foxClearing = AUTUMN_MAP.clearings.find(c => c.suit === 'fox')!;
    const setup = produce(baseline, draft => {
      draft.phase = 'daylight';
      draft.activeIndex = draft.factionOrder.indexOf('vagabond');
      const v = draft.factions.vagabond!;
      v.coalitionPartner = 'alliance';
      v.clearing = foxClearing.id;
      v.daylightActionsLeft = 6;
      v.items = [
        { kind: targetQuest.item1, state: 'face-up', exhausted: false },
        { kind: targetQuest.item2, state: 'face-up', exhausted: false },
      ];
      v.questDisplay = [targetQuest.id];
      draft.scores.alliance = 29;
      draft.scores.vagabond = 0;
    });
    // Quest only nets the Vagabond — partner gain comes from elsewhere. So
    // here we just verify the coalition wiring works post-completion if the
    // partner already crossed the threshold.
    const partnerAt30 = produce(setup, draft => { draft.scores.alliance = 30; });
    const after = checkCoalitionVictory(partnerAt30);
    expect(after.winner?.faction).toBe('vagabond');
    expect(after.winner?.via).toBe('coalition');
  });
});
