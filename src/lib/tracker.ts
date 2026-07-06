import { getPreferenceValues } from "@raycast/api";
import { getActiveSession, upsertSession } from "./storage";
import { getCurrentSpace, spaceInfoForId } from "./native";
import { getIdleSeconds } from "./idle";
import { spaceKey, SpaceInfo } from "./format";
import { clearEvents, consumeEvents } from "./watcher";
import { Preferences, Session, TrackerStatus } from "./types";

/**
 * Guard against counting huge gaps (e.g. the machine slept while inactivity
 * detection was disabled, or the menu bar command was disabled for a while).
 * Any single interval larger than this is ignored.
 */
const MAX_TICK_DELTA_SECONDS = 60 * 60; // 1 hour

export interface TickResult {
  status: TrackerStatus;
  sessionName?: string;
  currentSpace?: SpaceInfo;
  error?: string;
}

function ensureRecord(session: Session, key: string, info: SpaceInfo): void {
  const rec = session.spaces[key];
  if (rec) {
    rec.index = info.index;
    rec.display = info.display;
    rec.label = info.label;
    rec.id = info.id;
  } else {
    session.spaces[key] = {
      key,
      id: info.id,
      label: info.label,
      index: info.index,
      display: info.display,
      seconds: 0,
    };
  }
}

/**
 * One tracking tick. Called on every menu-bar refresh interval.
 *
 * If the background watcher is running, it records the exact timestamp of each
 * space switch to an events file. Here we fold those precise timestamps into the
 * session, so a switch is attributed to the instant it happened — even switches
 * that occurred between Raycast's (slow) menu-bar refreshes. With no events
 * present this reduces to plain interval polling of the current space.
 */
export async function tick(): Promise<TickResult> {
  const prefs = getPreferenceValues<Preferences>();
  const session = await getActiveSession();

  if (!session) {
    clearEvents();
    return { status: "idle" };
  }
  if (session.paused) {
    clearEvents(); // discard switches that happened while manually paused
    return { status: "paused", sessionName: session.name };
  }

  let current: SpaceInfo;
  try {
    current = getCurrentSpace();
  } catch (err) {
    session.lastTick = undefined; // don't count time we can't attribute
    await upsertSession(session);
    clearEvents();
    return {
      status: "error",
      sessionName: session.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const now = Date.now();

  // Inactivity handling.
  if (prefs.inactivityEnabled) {
    const thresholdSeconds = Math.max(1, parseFloat(prefs.inactivityMinutes) || 2) * 60;
    if (getIdleSeconds() >= thresholdSeconds) {
      session.autoPaused = true;
      session.lastTick = undefined; // break the chain so the idle stretch isn't counted
      session.lastSpaceKey = spaceKey(current);
      ensureRecord(session, spaceKey(current), current);
      await upsertSession(session);
      clearEvents(); // discard switches that happened while idle
      return { status: "auto-paused", sessionName: session.name, currentSpace: current };
    }
  }
  session.autoPaused = false;

  // Precise switch timeline from the background watcher (empty when it isn't running).
  const events = consumeEvents().filter((e) => e.t >= session.startedAt && e.t <= now + 1000);

  let cursor = session.lastTick ?? null;
  let curKey = session.lastSpaceKey ?? null;

  const attribute = (key: string | null, from: number | null, to: number) => {
    if (key == null || from == null) return;
    const delta = (to - from) / 1000;
    if (delta > 0 && delta <= MAX_TICK_DELTA_SECONDS) {
      const rec = session.spaces[key];
      if (rec) rec.seconds += delta;
    }
  };

  for (const e of events) {
    const info = spaceInfoForId(e.id);
    const key = spaceKey(info);
    ensureRecord(session, key, info);
    if (cursor != null && e.t > cursor) {
      attribute(curKey, cursor, e.t);
      cursor = e.t;
    } else if (cursor == null) {
      cursor = e.t; // establish a baseline from the first known switch
    }
    curKey = key;
  }

  // Trailing interval up to now, attributed to the live current space.
  const liveKey = spaceKey(current);
  ensureRecord(session, liveKey, current);
  attribute(curKey ?? liveKey, cursor, now);

  session.lastTick = now;
  session.lastSpaceKey = liveKey;
  await upsertSession(session);

  return { status: "tracking", sessionName: session.name, currentSpace: current };
}
