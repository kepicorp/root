import JSZip from 'jszip';
import { useSyncExternalStore } from 'react';

type StoredAsset = {
  path: string;
  blob: Blob;
};

const DB_NAME = 'root-user-assets-v1';
const STORE_NAME = 'files';
const COOKIE_SAFE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'] as const;

let loaded = false;
let loading: Promise<void> | null = null;
let version = 0;
let currentAssets = new Map<string, string>();
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function normalizePath(path: string): string | null {
  let normalized = path.replace(/\\/g, '/').trim();
  normalized = normalized.replace(/^\.\/+/, '');
  normalized = normalized.replace(/^src\/assets\/raw\//i, '');
  normalized = normalized.replace(/^src\/raw\//i, '');
  normalized = normalized.replace(/^assets\/raw\//i, '');
  normalized = normalized.replace(/^raw\//i, '');
  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.toLowerCase();
  if (!normalized || normalized.endsWith('/')) return null;
  if (!/^(board|cards|dominance|factions|items|tokens)\//.test(normalized)) return null;
  return normalized;
}

function candidatePaths(prefix: string, baseName: string): string[] {
  return COOKIE_SAFE_EXTS.map((ext) => `${prefix}${baseName}${ext}`);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
    };
    request.onerror = () => reject(request.error ?? new Error('failed to open asset store'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readStoredAssets(): Promise<StoredAsset[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onerror = () => reject(request.error ?? new Error('failed to read asset store'));
      request.onsuccess = () => resolve(request.result as StoredAsset[]);
    });
  } finally {
    db.close();
  }
}

async function writeStoredAssets(entries: StoredAsset[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const entry of entries) store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('failed to save asset pack'));
      tx.onabort = () => reject(tx.error ?? new Error('failed to save asset pack'));
    });
  } finally {
    db.close();
  }
}

async function clearStoredAssets(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('failed to clear asset pack'));
      tx.onabort = () => reject(tx.error ?? new Error('failed to clear asset pack'));
    });
  } finally {
    db.close();
  }
}

function revokeCurrentAssets(): void {
  for (const url of currentAssets.values()) URL.revokeObjectURL(url);
  currentAssets = new Map();
}

async function restoreFromStorage(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const entries = await readStoredAssets();
      revokeCurrentAssets();
      currentAssets = new Map(entries.map((entry) => [entry.path, URL.createObjectURL(entry.blob)]));
    } finally {
      loaded = true;
      loading = null;
      emit();
    }
  })();
  return loading;
}

function setAssets(entries: StoredAsset[]): void {
  revokeCurrentAssets();
  currentAssets = new Map(entries.map((entry) => [entry.path, URL.createObjectURL(entry.blob)]));
  loaded = true;
  emit();
}

export function useUserAssetPackVersion(): number {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
    () => version,
  );
  return version;
}

export function ensureUserAssetPackLoaded(): Promise<void> {
  return restoreFromStorage();
}

export function getUserAssetCount(): number {
  return currentAssets.size;
}

export function getUserAssetUrl(path: string): string | null {
  return currentAssets.get(normalizePath(path) ?? '') ?? null;
}

export function getUserAssetUrlFor(prefix: string, baseName: string): string | null {
  const normalizedPrefix = prefix.replace(/\\/g, '/');
  for (const candidate of candidatePaths(normalizedPrefix, baseName.toLowerCase())) {
    const normalized = normalizePath(candidate);
    if (!normalized) continue;
    const url = currentAssets.get(normalized);
    if (url) return url;
  }
  return null;
}

export async function loadUserAssetZip(file: File): Promise<{ fileCount: number }> {
  const pack = await JSZip.loadAsync(await file.arrayBuffer());
  const entries: StoredAsset[] = [];
  for (const entry of Object.values(pack.files)) {
    if (entry.dir) continue;
    const normalized = normalizePath(entry.name);
    if (!normalized) continue;
    const blob = await entry.async('blob');
    entries.push({ path: normalized, blob });
  }
  if (entries.length === 0) throw new Error('The ZIP did not contain any supported asset files.');
  await writeStoredAssets(entries);
  setAssets(entries);
  return { fileCount: entries.length };
}

export async function clearUserAssetPack(): Promise<void> {
  revokeCurrentAssets();
  loaded = true;
  await clearStoredAssets();
  emit();
}

export function customAssetSummary(): { count: number; loaded: boolean } {
  return { count: currentAssets.size, loaded };
}

// Kick off a restore as soon as the module is used in the browser.
if (typeof window !== 'undefined') {
  void restoreFromStorage();
}