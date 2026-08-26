import { useState, useEffect, useMemo } from 'react';
import type { GameState, Faction } from '../engine/types';
import { getCard } from '../engine/cards';
import { cardArt, factionIcon } from '../assets';
import { CardIcon, CardDetails } from './CardIcon';

interface HandProps {
  state: GameState;
  faction: Faction | null;
}

const SUIT_COLOR: Record<string, string> = {
  fox: '#c03428',
  mouse: '#D68860',
  rabbit: '#f0c030',
  bird: '#5aabaa',
};

export function Hand({ state, faction }: HandProps) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [pileQuery, setPileQuery] = useState('');
  const cards = state.hands[faction ?? 'marquise'];
  // Clear zoom whenever the hand contents change (cards removed have no mouseLeave to fire).
  useEffect(() => { setZoomed(null); }, [cards]);

  if (!faction) {
    return (
      <div className="hand empty">
        <em>Pick a faction to begin.</em>
      </div>
    );
  }
  const icon = factionIcon(faction);
  const bagCount = faction === 'vagabond'
    ? (state.factions.vagabond?.items.filter(i => i.kind === 'bag' && i.state === 'face-up').length ?? 0)
    : 0;
  const handLimit = 5 + bagCount;
  const supporters = faction === 'alliance' ? (state.factions.alliance?.supporters ?? []) : [];
  const query = pileQuery.trim().toLowerCase();
  const faceUpSections = useMemo(() => {
    const inQuery = (id: string): boolean => {
      if (!query) return true;
      const c = getCard(id);
      return c.name.toLowerCase().includes(query) || c.suit.toLowerCase().includes(query) || c.category.toLowerCase().includes(query);
    };
    const discard = state.discard.filter(inQuery);
    const dominanceAvailable = state.dominanceAvailable.filter(inQuery);
    const craftedPersistents = state.craftedPersistents
      .filter((entry) => inQuery(entry.cardId))
      .map((entry) => ({ ...entry, card: getCard(entry.cardId) }));
    return { discard, dominanceAvailable, craftedPersistents };
  }, [query, state.discard, state.dominanceAvailable, state.craftedPersistents]);

  return (
    <div className="hand">
      <div className="hand-label">
        {icon && <img src={icon} alt="" className="faction-icon" />}
        Hand · {faction} <span className="dim hand-count">({cards.length}/{handLimit})</span>
      </div>
      <div className="hand-cards">
        {cards.length === 0 && <em className="dim">— empty —</em>}
        {cards.map((id) => {
          const c = getCard(id);
          const art = cardArt(c);
          return (
            <div
              key={id}
              className={`card${art ? ' card-has-art' : ''}`}
              style={{ borderColor: SUIT_COLOR[c.suit] }}
              title={`${c.name} · ${c.category}`}
              onMouseEnter={() => art && setZoomed(art)}
              onMouseLeave={() => setZoomed(null)}
            >
              {art ? (
                <>
                  <img src={art} alt={c.name} className="card-art-bg" />
                  <span className="card-suit-badge" style={{ color: SUIT_COLOR[c.suit] }}>{c.suit}</span>
                </>
              ) : (
                <div className="card-body">
                  <div className="card-name">{c.name}</div>
                  <CardIcon card={c} size={36} />
                  <CardDetails card={c} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {zoomed && (
        <div className="card-zoom" aria-hidden>
          <img src={zoomed} alt="" />
        </div>
      )}

      {faction === 'alliance' && (
        <div className="supporters-panel" aria-label="Alliance supporters">
          <div className="faceup-panel-head">
            <strong>Supporters ({supporters.length})</strong>
            <span className="dim">Alliance only</span>
          </div>
          <div className="faceup-list">
            {supporters.length === 0 && <div className="dim">No supporters.</div>}
            {supporters.map((id, i) => {
              const c = getCard(id);
              return (
                <div key={`supporter-${id}-${i}`} className="faceup-item" style={{ borderColor: SUIT_COLOR[c.suit] }}>
                  <span className="faceup-name">{c.name}</span>
                  <span className="faceup-meta">{c.suit} · {c.category}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="faceup-panel" aria-label="Face-up piles">
        <div className="faceup-panel-head">
          <strong>Face-up piles</strong>
          <span className="dim">inspectable + searchable</span>
        </div>
        <input
          className="faceup-search"
          type="search"
          value={pileQuery}
          onChange={(e) => setPileQuery(e.target.value)}
          placeholder="Search discard / dominance / crafted by name, suit, category"
          aria-label="Search face-up piles"
        />

        <details className="faceup-section" open>
          <summary>Discard pile ({faceUpSections.discard.length})</summary>
          <div className="faceup-list">
            {faceUpSections.discard.length === 0 && <div className="dim">No matching discard cards.</div>}
            {faceUpSections.discard.map((id) => {
              const c = getCard(id);
              return (
                <div key={`discard-${id}`} className="faceup-item" style={{ borderColor: SUIT_COLOR[c.suit] }}>
                  <span className="faceup-name">{c.name}</span>
                  <span className="faceup-meta">{c.suit} · {c.category}</span>
                </div>
              );
            })}
          </div>
        </details>

        <details className="faceup-section">
          <summary>Available dominance ({faceUpSections.dominanceAvailable.length})</summary>
          <div className="faceup-list">
            {faceUpSections.dominanceAvailable.length === 0 && <div className="dim">No matching dominance cards.</div>}
            {faceUpSections.dominanceAvailable.map((id) => {
              const c = getCard(id);
              const art = cardArt(c);
              return (
                <div key={`dom-${id}`} className={`faceup-item${art ? ' card-has-art' : ''}`} style={{ borderColor: SUIT_COLOR[c.suit] }} onMouseEnter={() => art && setZoomed(art)} onMouseLeave={() => setZoomed(null)}>
                  {art && <img src={art} alt={c.name} className="card-art-bg" />}
                  <span className="faceup-name">{c.name}</span>
                  <span className="faceup-meta">{c.suit} · {c.category}</span>
                </div>
              );
            })}
          </div>
        </details>

        <details className="faceup-section">
          <summary>Crafted persistents ({faceUpSections.craftedPersistents.length})</summary>
          <div className="faceup-list">
            {faceUpSections.craftedPersistents.length === 0 && <div className="dim">No matching crafted persistent cards.</div>}
            {faceUpSections.craftedPersistents.map((entry, i) => {
              const art = cardArt(entry.card);
              return (
              <div key={`persistent-${entry.faction}-${entry.cardId}-${i}`} className={`faceup-item${art ? ' card-has-art' : ''}`} style={{ borderColor: SUIT_COLOR[entry.card.suit] }} onMouseEnter={() => art && setZoomed(art)} onMouseLeave={() => setZoomed(null)}>
                {art && <img src={art} alt={entry.card.name} className="card-art-bg" />}
                <span className="faceup-name">{entry.card.name}</span>
                <span className="faceup-meta">{entry.faction} · {entry.card.suit} · {entry.card.category}</span>
              </div>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}
