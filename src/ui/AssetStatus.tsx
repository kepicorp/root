import { assetReport } from '../assets';

export function AssetStatus() {
  const r = assetReport();
  const hasUser = r.customAssets > 0;
  const label = hasUser
    ? `art: uploaded pack (${r.customAssets} files)`
    : `art: stylized fallback (${r.factionArt} faction · ${r.items} items)`;
  return (
    <span
      className={`asset-status ${hasUser ? 'ok' : 'none'}`}
      title={hasUser
        ? 'Your browser-stored custom asset pack is being used. Files stay on your computer.'
        : 'Original SVG fallback is in use. Upload a ZIP of your raw folder to use custom art locally.'}
    >
      {label}
    </span>
  );
}
