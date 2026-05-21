import { useState } from 'react';
import { assetReport } from '../assets';

export function AssetStatus() {
  const [open, setOpen] = useState(false);
  const r = assetReport();
  const total = r.cards + r.factionArt + r.items + (r.board ? 1 : 0);
  if (total === 0) {
    return (
      <button
        className="asset-status none"
        onClick={() => setOpen(o => !o)}
        title="No asset files detected"
      >
        no art · drop files in src/assets/raw/{open ? ' ▴' : ' ▾'}
      </button>
    );
  }
  return (
    <button
      className="asset-status ok"
      onClick={() => setOpen(o => !o)}
      title="Asset detection summary"
    >
      art: {r.cards} cards · {r.items} items · {r.factionArt} faction · {r.board ? 'board' : 'no board'}
    </button>
  );
}
