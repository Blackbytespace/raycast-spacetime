import { LocalStorage } from "@raycast/api";
import { Session } from "./types";

const SESSIONS_KEY = "sessions";

export async function getSessions(): Promise<Session[]> {
  const raw = await LocalStorage.getItem<string>(SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Session[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await LocalStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function getActiveSession(): Promise<Session | undefined> {
  const sessions = await getSessions();
  return sessions.find((s) => s.isActive);
}

/** Upsert a single session by id, preserving the rest. */
export async function upsertSession(session: Session): Promise<void> {
  const sessions = await getSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  await saveSessions(sessions);
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  await saveSessions(sessions.filter((s) => s.id !== id));
}

/** Removes every session, including any active one. */
export async function clearAllSessions(): Promise<void> {
  await saveSessions([]);
}

export function createSession(name: string): Session {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    startedAt: Date.now(),
    isActive: true,
    paused: false,
    autoPaused: false,
    spaces: {},
  };
}

/** Starts a new session, deactivating (and stopping) any currently active one. */
export async function startSession(name?: string): Promise<Session> {
  const sessions = await getSessions();
  const now = Date.now();
  for (const s of sessions) {
    if (s.isActive) {
      s.isActive = false;
      s.stoppedAt = now;
      s.lastTick = undefined;
    }
  }
  const label = name?.trim() || defaultSessionName();
  const session = createSession(label);
  sessions.push(session);
  await saveSessions(sessions);
  return session;
}

export async function stopActiveSession(): Promise<void> {
  const sessions = await getSessions();
  const now = Date.now();
  for (const s of sessions) {
    if (s.isActive) {
      s.isActive = false;
      s.stoppedAt = now;
      s.lastTick = undefined;
    }
  }
  await saveSessions(sessions);
}

export async function setPaused(paused: boolean): Promise<void> {
  const sessions = await getSessions();
  for (const s of sessions) {
    if (s.isActive) {
      s.paused = paused;
      // Reset the delta clock so paused time is never counted.
      s.lastTick = undefined;
      if (!paused) s.autoPaused = false;
    }
  }
  await saveSessions(sessions);
}

export async function renameSession(id: string, name: string): Promise<void> {
  const sessions = await getSessions();
  const s = sessions.find((x) => x.id === id);
  if (s) {
    s.name = name.trim() || s.name;
    await saveSessions(sessions);
  }
}

function defaultSessionName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Session ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}
