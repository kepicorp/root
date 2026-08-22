import { useMemo, useRef, useState } from 'react';
import { AUTUMN_MAP } from '../engine/map';
import type { ClearingId, Suit } from '../engine/types';
import { boardArt } from '../assets';

type MapState = typeof AUTUMN_MAP;

const BOARD_W = 1000;
const BOARD_H = 800;

const SUIT_COLOR: Record<Suit, string> = {
  fox: '#c03428',
  mouse: '#D68860',
  rabbit: '#f0c030',
};

const FOREST_FILL = '#1f2a13';
const FOREST_SELECTED_FILL = '#26361a';

function cloneMap(): MapState {
  return {
    clearings: AUTUMN_MAP.clearings.map((c) => ({ ...c })),
    paths: AUTUMN_MAP.paths.map(([a, b]) => [a, b] as const),
    forests: AUTUMN_MAP.forests.map((f) => ({
      ...f,
      clearings: [...f.clearings],
      borderPaths: f.borderPaths.map(([a, b]) => [a, b] as const),
    })),
  };
}

function edgeKey(a: ClearingId, b: ClearingId): string {
  return `${Math.min(a, b)}-${Math.max(a, b)}`;
}

function forestPathKey(path: readonly [number, number]): string {
  return edgeKey(path[0], path[1]);
}

function sortUniquePaths(paths: Array<readonly [number, number]>): Array<readonly [number, number]> {
  const unique = new Map<string, readonly [number, number]>();
  for (const path of paths) unique.set(forestPathKey(path), path);
  return [...unique.values()].sort((a, b) => forestPathKey(a).localeCompare(forestPathKey(b)));
}

function toEditorMap(map: MapState) {
  return {
    clearings: map.clearings.map((c) => ({
      id: c.id,
      suit: c.suit,
      buildingSlots: c.buildingSlots,
      hasRuin: c.hasRuin,
      ruinItem: c.ruinItem,
      hasRiver: c.hasRiver,
      x: c.x,
      y: c.y,
    })),
    paths: map.paths.map(([a, b]) => [a, b] as [number, number]),
    forests: map.forests.map((f) => ({
      id: f.id,
      clearings: [...f.clearings],
      borderPaths: f.borderPaths.map(([a, b]) => [a, b] as [number, number]),
      x: f.x,
      y: f.y,
    })),
  };
}

async function saveMap(map: MapState, token: string): Promise<void> {
  const r = await fetch('/api/admin/map', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ map: toEditorMap(map) }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export function MapEditor({ token }: { token: string }) {
  const [map, setMap] = useState<MapState>(() => cloneMap());
  const [dragging, setDragging] = useState<{ kind: 'clearing' | 'forest'; id: string } | null>(null);
  const [selected, setSelected] = useState<ClearingId | null>(null);
  const [selectedForest, setSelectedForest] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const boardSrc = boardArt() ?? undefined;

  const clearingById = useMemo(() => new Map(map.clearings.map((c) => [c.id, c])), [map.clearings]);
  const pathSet = useMemo(() => new Set(map.paths.map(([a, b]) => edgeKey(a, b))), [map.paths]);
  const selectedForestData = useMemo(
    () => map.forests.find((f) => f.id === selectedForest) ?? null,
    [map.forests, selectedForest],
  );
  const selectedForestPathSet = useMemo(
    () => new Set(selectedForestData?.borderPaths.map(forestPathKey) ?? []),
    [selectedForestData],
  );

  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_W,
      y: ((clientY - rect.top) / rect.height) * BOARD_H,
    };
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    setMap((current) => {
      if (dragging.kind === 'clearing') {
        return {
          ...current,
          clearings: current.clearings.map((c) => (String(c.id) === dragging.id ? { ...c, x: pt.x, y: pt.y } : c)),
        };
      }
      return {
        ...current,
        forests: current.forests.map((f) => (f.id === dragging.id ? { ...f, x: pt.x, y: pt.y } : f)),
      };
    });
  }

  function onUp() {
    setDragging(null);
  }

  function togglePath(id: ClearingId) {
    if (selectedForestData) return;
    if (selected == null) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setSelected(null);
      return;
    }
    const key = edgeKey(selected, id);
    setMap((current) => {
      const has = current.paths.some(([a, b]) => edgeKey(a, b) === key);
      const paths = has
        ? current.paths.filter(([a, b]) => edgeKey(a, b) !== key)
        : [...current.paths, [selected, id] as const];
      return { ...current, paths };
    });
    setSelected(null);
  }

  function toggleForestPath(path: readonly [number, number]): void {
    if (!selectedForestData) return;
    const key = forestPathKey(path);
    setMap((current) => ({
      ...current,
      forests: current.forests.map((forest) => {
        if (forest.id !== selectedForestData.id) return forest;
        const nextPaths = forest.borderPaths.some((p) => forestPathKey(p) === key)
          ? forest.borderPaths.filter((p) => forestPathKey(p) !== key)
          : [...forest.borderPaths, path];
        return { ...forest, borderPaths: sortUniquePaths(nextPaths) };
      }),
    }));
  }

  async function persist() {
    if (!window.confirm('Write the edited map into src/engine/map.ts and update the map test snapshot?')) return;
    try {
      await saveMap(map, token);
      setStatus('Saved to source files. Reload the app to use the updated map.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <h2>Map editor</h2>
        <div className="admin-header-actions">
          {selectedForestData && (
            <button className="btn ghost" onClick={() => setSelectedForest(null)}>
              Deselect forest
            </button>
          )}
          <button className="btn ghost" onClick={() => setMap(cloneMap())}>Reset</button>
          <button className="btn primary" onClick={persist}>Save map</button>
        </div>
      </div>
      <p className="dim">
        Drag clearings and forest spots. Click two clearings to toggle a path. Click a forest blob to edit its border paths instead. The save action rewrites the source map and test snapshot.
      </p>
      <div className="map-editor-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
          className="map-editor-svg"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        >
          <rect width={BOARD_W} height={BOARD_H} fill="#182214" />
          {boardSrc && (
            <image href={boardSrc} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" opacity={0.75} />
          )}
          {map.paths.map(([a, b]) => {
            const ca = clearingById.get(a)!;
            const cb = clearingById.get(b)!;
            const key = edgeKey(a, b);
            const highlighted = selectedForestData ? selectedForestPathSet.has(key) : false;
            return (
              <line
                key={key}
                x1={ca.x}
                y1={ca.y}
                x2={cb.x}
                y2={cb.y}
                stroke={selectedForestData ? (highlighted ? '#ffd166' : '#41523a') : '#4f7fe0'}
                strokeWidth={selectedForestData ? (highlighted ? 7 : 3) : 4}
                opacity={selectedForestData ? (highlighted ? 0.95 : 0.35) : 0.8}
                onClick={() => {
                  if (selectedForestData) toggleForestPath([a, b]);
                }}
                style={{ cursor: selectedForestData ? 'pointer' : 'default' }}
              />
            );
          })}
          {map.forests.map((f) => (
            <g
              key={f.id}
              transform={`translate(${f.x}, ${f.y})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragging({ kind: 'forest', id: f.id });
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedForest((current) => (current === f.id ? null : f.id));
                setSelected(null);
              }}
              style={{ cursor: 'grab' }}
            >
              <ellipse
                rx={42}
                ry={28}
                fill={selectedForest === f.id ? FOREST_SELECTED_FILL : FOREST_FILL}
                stroke={selectedForest === f.id ? '#ffd166' : '#0d1408'}
                strokeWidth={selectedForest === f.id ? 4 : 2}
              />
              <text y={5} textAnchor="middle" fontSize={18} fill="#9bbd58">🌲</text>
              <text y={-34} textAnchor="middle" fontSize={12} fontWeight={800} fill="#f5e9d0">{f.id}</text>
            </g>
          ))}
          {map.clearings.map((c) => (
            <g
              key={c.id}
              transform={`translate(${c.x}, ${c.y})`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragging({ kind: 'clearing', id: String(c.id) });
                setSelected(null);
                setSelectedForest(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!dragging) togglePath(c.id);
              }}
              style={{ cursor: 'grab' }}
            >
              <circle r={58} fill={SUIT_COLOR[c.suit]} stroke="#3b2a18" strokeWidth={4} />
              <circle r={13} fill="#f5e9d0" stroke="#3b2a18" strokeWidth={2} />
              <text y={5} textAnchor="middle" fontSize={18} fontWeight={800} fill="#3b2a18">{c.id}</text>
              <text y={-70} textAnchor="middle" fontSize={18} fontWeight={800} fill="#111">{c.id === selected ? 'selected' : ''}</text>
            </g>
          ))}
        </svg>
      </div>
      {status && <div className="admin-result">{status}</div>}
      <div className="dim">Paths: {pathSet.size} unique edges</div>
    </section>
  );
}