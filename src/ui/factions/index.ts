import type { ComponentType } from 'react';
import type { Faction, GameState, Action } from '../../engine/types';
import { MarquisePanel } from './MarquisePanel';
import { EyriePanel } from './EyriePanel';
import { AlliancePanel } from './AlliancePanel';
import { VagabondPanel } from './VagabondPanel';

export interface FactionPanelProps {
  state: GameState;
  isHuman: boolean;
  dispatch: (a: Action) => void;
}

export const FactionPanels: Record<Faction, ComponentType<FactionPanelProps>> = {
  marquise: MarquisePanel,
  eyrie: EyriePanel,
  alliance: AlliancePanel,
  vagabond: VagabondPanel,
};
