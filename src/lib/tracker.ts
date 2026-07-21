import { getPreferenceValues } from "@raycast/api";
import { rolloverStaleSession, getActiveSession, upsertSession } from "./storage";
import { getCurrentSpace, mainDisplay } from "./native";
import { getIdleSeconds, isDisplayKeptAwake } from "./idle";
import { spaceKey, SpaceInfo } from "./format";
import { Session, TrackerStatus } from "./types";
import { MAX_TICK_DELTA_SECONDS } from "./consts";

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
 * One tracking tick. Called on every menu-bar refresh interval (and before any
 * session mutation). Attributes the time elapsed since the last tick to the
 * space the user was in, then records the current space for the next interval.
 */
export async function tick(): Promise<TickResult> {
  const prefs = getPreferenceValues<Preferences>();
  // Close out any session that has crossed midnight before attributing time, so a session can
  // never span two calendar days and the new day's time can't leak into the old one. Always runs.
  await rolloverStaleSession();
  const session = await getActiveSession();

  if (!session) {
    return { status: "idle" };
  }
  if (session.paused) {
    return { status: "paused", sessionName: session.name };
  }

  let current: SpaceInfo;
  try {
    current = getCurrentSpace();
  } catch (err) {
    session.lastTick = undefined; // don't count time we can't attribute
    await upsertSession(session);
    return {
      status: "error",
      sessionName: session.name,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const now = Date.now();

  // Only track time spent on the main display — ignore spaces on other displays.
  if (current.display !== mainDisplay()) {
    session.lastTick = undefined; // break the chain so off-display time isn't counted
    session.lastSpaceKey = undefined;
    await upsertSession(session);
    return { status: "tracking", sessionName: session.name, currentSpace: current };
  }

  // Inactivity handling.
  if (prefs.inactivityEnabled) {
    // Only fall back to 10 for missing/non-numeric input — a deliberate 0 is kept and floored to 1
    // minute by Math.max (using `|| 10` would wrongly treat 0 as missing; `?? 10` wouldn't catch NaN).
    const minutes = parseFloat(prefs.inactivityMinutes);
    const thresholdSeconds = Math.max(1, Number.isFinite(minutes) ? minutes : 10) * 60;
    // Don't auto-pause if media/presentation is keeping the display awake (e.g. watching a video):
    // there's no keyboard/mouse input, but the user is clearly still present. The pmset check only
    // runs once we've actually crossed the idle threshold, so it never adds per-tick overhead.
    if (getIdleSeconds() >= thresholdSeconds && !(prefs.keepTrackingWhileMedia && isDisplayKeptAwake())) {
      session.autoPaused = true;
      session.lastTick = undefined; // break the chain so the idle stretch isn't counted
      session.lastSpaceKey = spaceKey(current);
      ensureRecord(session, spaceKey(current), current);
      await upsertSession(session);
      return { status: "auto-paused", sessionName: session.name, currentSpace: current };
    }
  }
  session.autoPaused = false;

  const liveKey = spaceKey(current);
  ensureRecord(session, liveKey, current);

  // Attribute the interval since the last tick to the space we were in then.
  const rawFrom = session.lastTick ?? null;
  const key = session.lastSpaceKey ?? liveKey;
  if (rawFrom != null) {
    // Never credit time before the session began — matters for a replacement session whose
    // startedAt is floored to 00:01 while its baseline tick fired at 00:00 (the midnight gap).
    const from = Math.max(rawFrom, session.startedAt);
    const delta = (now - from) / 1000;
    if (delta > 0 && delta <= MAX_TICK_DELTA_SECONDS) {
      const rec = session.spaces[key];
      if (rec) rec.seconds += delta;
    }
  }

  session.lastTick = now;
  session.lastActiveAt = now; // last moment we recorded real activity (used to backdate stop time)
  session.lastSpaceKey = liveKey;
  await upsertSession(session);

  return { status: "tracking", sessionName: session.name, currentSpace: current };
}
