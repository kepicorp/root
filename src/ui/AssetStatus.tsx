import { assetReport } from '../assets';

export function AssetStatus() {
  const r = assetReport();
  const hasUser = r.rawCards > 0 || r.rawFaction > 0 || r.rawItems > 0;
  const label = hasUser
    ? `art: ${r.rawCards} cards + ${r.rawFaction} faction + ${r.rawItems} items (your scans)`
    : `art: stylized fallback (${r.factionArt} faction · ${r.items} items)`;
  return (
    <span
      className={`asset-status ${hasUser ? 'ok' : 'none'}`}
      title={hasUser
        ? 'Your scans in src/assets/raw/ are being used.'
        : 'Original SVG fallback is in use. Drop scans into src/assets/raw/ to override.'}
    >
      {label}
    </span>
  );
}
