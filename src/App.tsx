import { Board } from './ui/Board';
import { AUTUMN_MAP } from './engine/map';
import { useState } from 'react';

export function App() {
  const [boardSrc] = useState<string | undefined>(undefined);

  const fox = AUTUMN_MAP.clearings.filter(c => c.suit === 'fox').length;
  const mouse = AUTUMN_MAP.clearings.filter(c => c.suit === 'mouse').length;
  const rabbit = AUTUMN_MAP.clearings.filter(c => c.suit === 'rabbit').length;
  const ruins = AUTUMN_MAP.clearings.filter(c => c.hasRuin).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Root</h1>
        <p className="subtitle">Phase 0 — map skeleton</p>
      </header>
      <main className="app-main">
        <Board backgroundSrc={boardSrc} />
        <aside className="sidebar">
          <h2>Map info</h2>
          <ul>
            <li>{AUTUMN_MAP.clearings.length} clearings</li>
            <li>{AUTUMN_MAP.paths.length} paths</li>
            <li>
              suits: {fox} fox · {mouse} mouse · {rabbit} rabbit
            </li>
            <li>{ruins} ruins</li>
          </ul>
          <p className="note">
            Hover a clearing to highlight its neighbors.
          </p>
        </aside>
      </main>
    </div>
  );
}
