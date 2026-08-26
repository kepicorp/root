import { useEffect, useMemo, useState } from 'react';
import type { CombatOverlayState, GameState, Faction, CardSuit } from '../engine/types';
import { getCard } from '../engine/cards';
import { buildingArt, warriorArt } from '../assets';

interface Props {
  state: GameState;
  /** Called only after the player has clicked through the resolved battle. */
  onComplete: (overlayId: string) => void;
}

const SUIT_COLOR: Record<CardSuit, string> = {
  fox: '#c03428',
  mouse: '#D68860',
  rabbit: '#f0c030',
  bird: '#5aabaa',
};

function dieFace(n: number): string {
  if (n <= 0) return '0';
  return String(n);
}

function randomDie(): number {
  const faces = [0, 0, 1, 1, 2, 3];
  return faces[Math.floor(Math.random() * faces.length)]!;
}

function factionName(f: Faction): string {
  if (f === 'marquise') return 'Marquise';
  if (f === 'eyrie') return 'Eyrie';
  if (f === 'alliance') return 'Alliance';
  return 'Vagabond';
}

export function BattleOverlay({ state, onComplete }: Props) {
  const overlay = state.battleOverlay;
  const [activeOverlay, setActiveOverlay] = useState<CombatOverlayState | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [dice, setDice] = useState<[number, number]>([0, 0]);
  const [rolling, setRolling] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [diceStepDone, setDiceStepDone] = useState(false);

  useEffect(() => {
    if (!overlay) return;
    setActiveOverlay((prev) => {
      if (!prev || prev.id !== overlay.id) {
        setStepIndex(0);
        setDiceStepDone(false);
        setRolling(false);
        setDice([0, 0]);
        return overlay;
      }
      return overlay;
    });
  }, [overlay]);

  const steps = useMemo(() => {
    if (!activeOverlay) return [] as Array<{ text: string; kind: 'normal' | 'dice' }>;
    const out: Array<{ text: string; kind: 'normal' | 'dice' }> = [];
    const hasGuerrilla = activeOverlay.modifiers.some((m) => /guerrilla war/i.test(m));
    const hasArmorers = activeOverlay.modifiers.some((m) => /armorers/i.test(m));
    const hasSappers = activeOverlay.modifiers.some((m) => /sappers/i.test(m));
    const hasBrutal = activeOverlay.modifiers.some((m) => /brutal tactics/i.test(m));
    const hasDefenseless = !!activeOverlay.defenderDefenseless || activeOverlay.modifiers.some((m) => /defenseless/i.test(m));

    out.push({ text: `Battle in clearing ${activeOverlay.clearing} (${activeOverlay.suit})`, kind: 'normal' });
    out.push({ text: 'Before dice: defender may play matching-suit or bird Ambush.', kind: 'normal' });
    out.push({ text: `Defender may play Ambush (${activeOverlay.suit} or bird) before dice.`, kind: 'normal' });
    if (activeOverlay.defenderAmbushCardId) {
      const c = getCard(activeOverlay.defenderAmbushCardId);
      out.push({ text: `Defender played ${c.name}.`, kind: 'normal' });
      out.push({ text: `Attacker may cancel with matching Ambush (${activeOverlay.suit} or bird).`, kind: 'normal' });
      if (activeOverlay.attackerAmbushCardId) {
        const ca = getCard(activeOverlay.attackerAmbushCardId);
        out.push({ text: `Attacker played ${ca.name}; ambushes cancel.`, kind: 'normal' });
      }
    }
    out.push({ text: 'Before final hit math: optional combat effects can be chosen by both players.', kind: 'normal' });
    if (activeOverlay.status === 'optional-effect-prompt') {
      out.push({ text: 'Optional combat effects are being chosen by players.', kind: 'normal' });
    }
    if (activeOverlay.status === 'cancelled') {
      out.push({ text: 'Battle was cancelled before dice were rolled.', kind: 'normal' });
    }
    if (activeOverlay.status === 'resolved') {
      if (activeOverlay.endedByAmbush) {
        out.push({ text: 'Battle ended before dice: defender ambush removed all attacker warriors.', kind: 'normal' });
      } else {
        out.push({ text: hasGuerrilla
          ? 'Dice assignment: Guerrilla War active (Alliance defending) so defender uses high die and attacker uses low die.'
          : 'Dice assignment: attacker uses high die, defender uses low die.', kind: 'normal' });
        out.push({ text: 'Dice roll resolves battle hits.', kind: 'dice' });
      }
      out.push({ text: hasDefenseless
        ? 'Hit math: defender is defenseless, so attacker gets +1 rolled hit.'
        : 'Hit math: if defender has zero warriors, attacker gains +1 rolled hit (Defenseless).', kind: 'normal' });
      if (hasArmorers) out.push({ text: 'Hit math: Armorers can negate the owner\'s rolled hits this battle.', kind: 'normal' });
      if (hasSappers) out.push({ text: 'Hit math: Sappers adds +1 defender hit.', kind: 'normal' });
      if (hasBrutal) out.push({ text: 'Hit math: Brutal Tactics adds +1 attacker hit and gives defender +1 VP.', kind: 'normal' });
      out.push({ text: 'Piece removal order reminder: remove warriors first, then buildings/tokens as legal.', kind: 'normal' });
      out.push({ text: 'VP reminder: each enemy building/token removed scores 1 VP.', kind: 'normal' });
      for (const m of activeOverlay.modifiers) out.push({ text: m, kind: 'normal' });
      out.push({ text: `Final hits: attacker ${activeOverlay.attackerHits ?? 0}, defender ${activeOverlay.defenderHits ?? 0}.`, kind: 'normal' });
      out.push({ text: 'Post-battle follow-ups: Field Hospitals (Marquise) and Alliance Outrage may trigger.', kind: 'normal' });
      out.push({ text: 'Outrage reminder: moving warriors into sympathy or removing sympathy each triggers payment/reveal+draw.', kind: 'normal' });
    }
    return out;
  }, [activeOverlay]);

  const currentStep = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];

  useEffect(() => {
    if (!activeOverlay || !currentStep) return;
    if (currentStep.kind !== 'dice' || activeOverlay.status !== 'resolved' || !activeOverlay.dice) {
      setRolling(false);
      if (activeOverlay.dice) setDice(activeOverlay.dice);
      return;
    }

    setDiceStepDone(false);
    setRolling(true);
    let intervalMs = 120;
    let handle = window.setInterval(() => {
      setDice([randomDie(), randomDie()]);
    }, intervalMs);

    const slow1 = window.setTimeout(() => {
      window.clearInterval(handle);
      intervalMs = 190;
      handle = window.setInterval(() => {
        setDice([randomDie(), randomDie()]);
      }, intervalMs);
    }, 900);

    const slow2 = window.setTimeout(() => {
      window.clearInterval(handle);
      intervalMs = 290;
      handle = window.setInterval(() => {
        setDice([randomDie(), randomDie()]);
      }, intervalMs);
    }, 1700);

    const stop = window.setTimeout(() => {
      window.clearInterval(handle);
      setRolling(false);
      setDice(activeOverlay.dice!);
      setDiceStepDone(true);
    }, 2800);

    return () => {
      window.clearInterval(handle);
      window.clearTimeout(slow1);
      window.clearTimeout(slow2);
      window.clearTimeout(stop);
    };
  }, [activeOverlay?.id, activeOverlay?.status, activeOverlay?.dice, currentStep?.kind]);

  // Ambush and optional-effect choices happen before the battle is resolved.
  // Do not cover their prompts with the result walkthrough.
  if (!overlay) return null;
  if (overlay.status !== 'resolved' && overlay.status !== 'cancelled') {
    return <div className="battle-overlay battle-in-progress" role="status">Battle in progress: {factionName(overlay.attacker.faction)} vs {factionName(overlay.defender.faction)}</div>;
  }
  if (!activeOverlay) return null;
  if (hiddenIds.includes(activeOverlay.id)) return null;

  const isLastStep = stepIndex >= steps.length - 1;
  const continueDisabled = currentStep?.kind === 'dice' && !diceStepDone;
  const continueLabel = isLastStep ? 'Close' : 'Continue';
  const overlayId = activeOverlay.id;
  const attWarrior = warriorArt(activeOverlay.attacker.faction);
  const defWarrior = warriorArt(activeOverlay.defender.faction);
  const attBuilding = activeOverlay.attacker.buildingKinds[0] ? buildingArt(activeOverlay.attacker.faction, activeOverlay.attacker.buildingKinds[0]!) : null;
  const defBuilding = activeOverlay.defender.buildingKinds[0] ? buildingArt(activeOverlay.defender.faction, activeOverlay.defender.buildingKinds[0]!) : null;

  function onContinue(): void {
    if (continueDisabled) return;
    if (isLastStep) {
      setHiddenIds((prev) => prev.includes(overlayId) ? prev : [...prev, overlayId]);
      onComplete(overlayId);
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }

  return (
    <div className="battle-overlay" role="dialog" aria-label="Battle animation">
      <div className="battle-overlay-card">
        <div className="battle-step" style={{ borderColor: SUIT_COLOR[activeOverlay.suit] }}>{currentStep?.text ?? ''}</div>

        <div className="battle-stage">
          <section className="battle-side left">
            <h3>Attacker</h3>
            <p>{factionName(activeOverlay.attacker.faction)}</p>
            <div className="battle-piece-row">
              {attWarrior ? <img src={attWarrior} alt="attacker warriors" /> : <span className="battle-fallback">W</span>}
              <span>x{activeOverlay.attacker.warriors}</span>
            </div>
            <div className="battle-piece-row">
              {attBuilding ? <img src={attBuilding} alt="attacker buildings" /> : <span className="battle-fallback">B</span>}
              <span>x{activeOverlay.attacker.buildings}</span>
            </div>
            <div className="battle-piece-row">
              <span className="battle-token-icon">●</span>
              <span>x{activeOverlay.attacker.tokens}</span>
            </div>
          </section>

          <section className="battle-dice-zone">
            <div className={`battle-die ${rolling ? 'rolling' : ''}`}>{dieFace(dice[0])}</div>
            <div className={`battle-die ${rolling ? 'rolling' : ''}`}>{dieFace(dice[1])}</div>
          </section>

          <section className="battle-side right">
            <h3>Defender</h3>
            <p>{factionName(activeOverlay.defender.faction)}</p>
            <div className="battle-piece-row">
              {defWarrior ? <img src={defWarrior} alt="defender warriors" /> : <span className="battle-fallback">W</span>}
              <span>x{activeOverlay.defender.warriors}</span>
            </div>
            <div className="battle-piece-row">
              {defBuilding ? <img src={defBuilding} alt="defender buildings" /> : <span className="battle-fallback">B</span>}
              <span>x{activeOverlay.defender.buildings}</span>
            </div>
            <div className="battle-piece-row">
              <span className="battle-token-icon">●</span>
              <span>x{activeOverlay.defender.tokens}</span>
            </div>
          </section>
        </div>
        <div className="battle-controls">
          <span className="battle-step-count">Step {Math.min(stepIndex + 1, Math.max(steps.length, 1))} / {Math.max(steps.length, 1)}</span>
          <button
            type="button"
            className="btn"
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {continueDisabled ? 'Rolling...' : continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
