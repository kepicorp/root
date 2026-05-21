import { useState } from 'react';
import type { Faction } from '../engine/types';
import type { VagabondCharacter } from '../engine/factions/vagabond/state';
import { useGame } from './store';

const FACTIONS: Faction[] = ['marquise', 'eyrie', 'alliance', 'vagabond'];
const CHARACTERS: VagabondCharacter[] = ['thief', 'tinker', 'ranger'];

const DESC: Record<Faction, string> = {
  marquise: 'Industrial cats. Build a sprawling workshop network across the woods.',
  eyrie:    'Imperial birds. Bind your hand into a brittle Decree of unbreakable orders.',
  alliance: 'Rebel critters. Spread sympathy, foment revolt, and outrage your oppressors.',
  vagabond: 'Lone scoundrel. Collect items, run errands, play factions against each other.',
};

const CHAR_DESC: Record<VagabondCharacter, string> = {
  thief:  'Starts with torch, boots, tea, sword. Steal one of your enemy\'s cards each turn.',
  tinker: 'Starts with torch, boots, bag, hammer. Pull cards from the discard pile.',
  ranger: 'Starts with torch, boots, sword, crossbow. Hide in forests to repair items.',
};

export function SetupWizard() {
  const begin = useGame((s) => s.begin);
  const [picked, setPicked] = useState<Faction | null>(null);
  const [character, setCharacter] = useState<VagabondCharacter>('thief');

  return (
    <div className="setup-wizard">
      <h2>Choose your faction</h2>
      <div className="faction-grid">
        {FACTIONS.map((f) => (
          <button
            key={f}
            className={`faction-card faction-${f} ${picked === f ? 'selected' : ''}`}
            onClick={() => setPicked(f)}
          >
            <div className="faction-card-name">{f}</div>
            <div className="faction-card-desc">{DESC[f]}</div>
          </button>
        ))}
      </div>
      {picked === 'vagabond' && (
        <div className="character-picker">
          <h3>Choose a character</h3>
          {CHARACTERS.map((c) => (
            <button
              key={c}
              className={`btn ${character === c ? 'selected' : ''}`}
              onClick={() => setCharacter(c)}
            >
              <strong>{c}</strong> — {CHAR_DESC[c]}
            </button>
          ))}
        </div>
      )}
      {picked && (
        <button
          className="btn primary"
          onClick={() => begin(picked, picked === 'vagabond' ? { vagabondCharacter: character } : undefined)}
        >
          Begin game as {picked}{picked === 'vagabond' ? ` (${character})` : ''}
        </button>
      )}
    </div>
  );
}
