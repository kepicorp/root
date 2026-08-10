import { useEffect, useState } from 'react';

export interface SiteAuthState {
  enabled: boolean;
  authed: boolean;
  checking: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export function useSiteAuth(): SiteAuthState {
  const [enabled, setEnabled] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/site-auth/status', { credentials: 'include' });
        if (!alive) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { enabled: boolean; authed: boolean };
        setEnabled(body.enabled);
        setAuthed(body.authed || !body.enabled);
      } catch (e) {
        if (!alive) return;
        setEnabled(false);
        setAuthed(true);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function login(password: string): Promise<boolean> {
    setError(null);
    const res = await fetch('/api/site-auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.status === 503) {
      setEnabled(false);
      setAuthed(true);
      return true;
    }
    if (!res.ok) {
      setAuthed(false);
      setError(res.status === 401 ? 'Wrong site password.' : `HTTP ${res.status}`);
      return false;
    }
    setEnabled(true);
    setAuthed(true);
    return true;
  }

  async function logout(): Promise<void> {
    setError(null);
    await fetch('/api/site-auth/logout', { method: 'POST', credentials: 'include' });
    setAuthed(!enabled);
  }

  return { enabled, authed, checking, error, login, logout };
}