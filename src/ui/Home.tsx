// Landing page when the user isn't connected to a room. Two paths:
//   • Create a new game (POST /api/rooms, then navigate to /r/<id>)
//   • Join an existing game (paste a code or URL)
//
// A third option — single-player offline — is shown below, since the engine
// works fine without a server connection. The startup page also manages the
// site-password unlock flow and the browser-only custom art ZIP import.

import { useRef, useState } from 'react';
import { createRoom, checkRoomExists, navigateToRoom } from './network';
import { clearUserAssetPack, customAssetSummary, loadUserAssetZip, useUserAssetPackVersion } from '../assets/user-pack';
import type { SiteAuthState } from './siteAuth';

interface Props {
  onStartOffline: () => void;
  site: SiteAuthState;
}

const ZIP_TREE = [
  'raw/',
  '├── board/autumn.png',
  '├── cards/<card-slug>.png',
  '├── dominance/<suit>.png',
  '├── factions/<faction>/icon.png',
  '├── factions/<faction>/warrior.png',
  '├── factions/<faction>/<building>.png',
  '├── items/<item>.png',
  '└── tokens/wood.png',
].join('\n');

export function Home({ onStartOffline, site }: Props) {
  const [busy, setBusy] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [autoFillBots, setAutoFillBots] = useState(true);
  const [assetStatus, setAssetStatus] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useUserAssetPackVersion();
  const assetSummary = customAssetSummary();

  async function unlockSite(): Promise<void> {
    if (!passwordValue.trim()) return;
    const ok = await site.login(passwordValue.trim());
    if (ok) setPasswordValue('');
  }

  async function onChooseZip(file: File | null): Promise<void> {
    if (!file) return;
    setAssetError(null);
    setAssetStatus(null);
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setAssetError('Upload a ZIP file containing your raw folder.');
      return;
    }
    try {
      const result = await loadUserAssetZip(file);
      setAssetStatus(`Loaded ${result.fileCount} files from your ZIP. The files stay in this browser only.`);
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function revertAssets(): Promise<void> {
    setAssetError(null);
    setAssetStatus(null);
    try {
      await clearUserAssetPack();
      setAssetStatus('Reverted to placeholder assets.');
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      const id = await createRoom(autoFillBots);
      navigateToRoom(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onJoin() {
    setBusy(true);
    setError(null);
    // Accept either a bare code or a full URL containing /r/<id>.
    const trimmed = joinValue.trim();
    const match = trimmed.match(/\/r\/([a-z0-9]+)\/?$/i);
    const code = match ? match[1]! : trimmed.toLowerCase();
    if (!code) { setError('Enter a room code or URL.'); setBusy(false); return; }
    try {
      const ok = await checkRoomExists(code);
      if (!ok) { setError(`Room "${code}" not found.`); setBusy(false); return; }
      navigateToRoom(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <h1 className="home-title">Root</h1>
      <p className="home-tagline">A woodland faction war. Play solo or with 2, 3, or 4 players.</p>

      {site.enabled && !site.authed && (
        <div className="home-card primary home-lock-card">
          <h2>Site password required</h2>
          <p>Enter the site password to unlock the rest of the pages on this browser.</p>
          <input
            className="home-input"
            type="password"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void unlockSite(); }}
            placeholder="site password"
            autoFocus
          />
          <button className="btn primary" onClick={() => void unlockSite()} disabled={!passwordValue.trim()}>
            Unlock site
          </button>
          {site.error && <div className="home-error">{site.error}</div>}
          <p className="home-note">When unlocked, you can create rooms, join rooms, play offline, and upload a ZIP of custom art that stays local to this browser.</p>
        </div>
      )}

      {(!site.enabled || site.authed) && (
        <>
          <div className="home-cards">
            <div className="home-card primary">
              <h2>Host a new game</h2>
              <p>Create a room, then share the link. You can decide whether empty seats should fill with bots.</p>
              <label className="home-toggle">
                <input
                  type="checkbox"
                  checked={autoFillBots}
                  onChange={(e) => setAutoFillBots(e.target.checked)}
                />
                Auto-fill unclaimed seats with bots
              </label>
              <button className="btn primary" onClick={onCreate} disabled={busy}>
                {busy ? '…' : 'Create game'}
              </button>
            </div>

            <div className="home-card">
              <h2>Join a game</h2>
              <p>Paste a room code or the full link from a host.</p>
              <input
                className="home-input"
                value={joinValue}
                onChange={(e) => setJoinValue(e.target.value)}
                placeholder="e.g. abc234 or https://…/r/abc234"
                onKeyDown={(e) => { if (e.key === 'Enter') onJoin(); }}
                autoFocus
              />
              <button className="btn" onClick={onJoin} disabled={busy || !joinValue.trim()}>
                {busy ? '…' : 'Join'}
              </button>
            </div>

            <div className="home-card secondary">
              <h2>Play offline</h2>
              <p>Solo against three AI factions on this device. No connection needed.</p>
              <button className="btn ghost" onClick={onStartOffline}>Play solo</button>
            </div>
          </div>

          <div className="home-card home-assets-card">
            <div className="home-assets-head">
              <h2>Custom art ZIP</h2>
              <span className={`home-assets-pill ${assetSummary.count > 0 ? 'ok' : 'none'}`}>
                {assetSummary.count > 0 ? `${assetSummary.count} local files loaded` : 'placeholder art active'}
              </span>
            </div>
            <p>
              Upload a ZIP file containing your <strong>raw/</strong> folder. The app parses it in the browser,
              stores it locally on this computer, and never sends the images to the server.
            </p>
            <p className="home-note strong">ZIP only. Do not upload loose files. ZIP the folder, then upload the ZIP.</p>
            <div className="home-assets-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="home-hidden-input"
                onChange={(e) => void onChooseZip(e.target.files?.[0] ?? null)}
              />
              <button className="btn primary" onClick={() => fileInputRef.current?.click()}>
                Upload custom assets ZIP
              </button>
              <button className="btn ghost" onClick={() => void revertAssets()}>
                Revert to placeholder assets
              </button>
            </div>
            <details className="home-assets-details">
              <summary>Show the ZIP structure to upload</summary>
              <pre>{ZIP_TREE}</pre>
            </details>
            <p className="home-note">
              Use the exact folder structure above. You can include just the files you want to override.
              Fallback art stays in place for anything you do not provide.
            </p>
            {assetStatus && <div className="home-success">{assetStatus}</div>}
            {assetError && <div className="home-error">{assetError}</div>}
          </div>
        </>
      )}

      {error && <div className="home-error">{error}</div>}

      <footer className="home-footer">
        <p>
          Rooms are kept on the server until they've been idle for 90 days,
          then automatically removed.
        </p>
      </footer>
    </div>
  );
}
