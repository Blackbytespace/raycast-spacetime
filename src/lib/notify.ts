import { LocalStorage, getPreferenceValues } from "@raycast/api";
import { spawn } from "child_process";
import { getActiveSession, startSession } from "./storage";
import { tick } from "./tracker";
import { Preferences } from "./types";

const PROMPT_DATE_KEY = "dailyPromptDate";
const AUTO_SESSION_DATE_KEY = "autoSessionDate";

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startSessionDeeplink(): string {
  const scheme = process.env.RAYCAST_SCHEME || "raycast";
  return `${scheme}://extensions/olivier_bossel/space-time-tracker/start-session`;
}

/**
 * Shows the "start a session?" prompt as a detached dialog with two buttons.
 * "Start a session" launches the start-session command via a Raycast deeplink;
 * "No thanks" does nothing. Detached so it never blocks the menu-bar refresh.
 */
export function showSessionPrompt(): void {
  const link = startSessionDeeplink();
  const script = [
    'set theButton to button returned of (display dialog "Would you like to start a new Spacetime session for today?"' +
      ' buttons {"No thanks", "Start a session"} default button "Start a session" with title "Spacetime" with icon note)',
    'if theButton is "Start a session" then',
    `  do shell script "open " & quoted form of "${link}"`,
    "end if",
  ].join("\n");
  const child = spawn("/usr/bin/osascript", ["-e", script], { detached: true, stdio: "ignore" });
  child.unref();
}

function sameDay(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * When "Record a session automatically every day" is enabled: starts a new
 * session once per calendar day (the first time the menu-bar command runs that
 * day — i.e. when you next use/wake the computer), with no user action. A stale
 * session left running from a previous day is replaced; a session already
 * started today is kept.
 */
export async function maybeAutoStartDailySession(): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  if (!prefs.autoDailySession) return;

  const today = todayKey();
  if ((await LocalStorage.getItem<string>(AUTO_SESSION_DATE_KEY)) === today) return;

  const active = await getActiveSession();
  if (active && sameDay(active.startedAt)) {
    // A session for today already exists — just mark the day handled.
    await LocalStorage.setItem(AUTO_SESSION_DATE_KEY, today);
    return;
  }

  await startSession(); // replaces any stale (previous-day) active session
  await tick(); // establish the tracking baseline immediately
  await LocalStorage.setItem(AUTO_SESSION_DATE_KEY, today);
}

/** Once per day (after 6am), prompt to start a session unless one is already running. */
export async function maybeShowDailyPrompt(): Promise<void> {
  const prefs = getPreferenceValues<Preferences>();
  if (prefs.dailyPrompt === false) return;
  if (prefs.autoDailySession) return; // auto-start handles it; no prompt needed
  if (new Date().getHours() < 6) return;

  const today = todayKey();
  const last = await LocalStorage.getItem<string>(PROMPT_DATE_KEY);
  if (last === today) return;

  // Record the attempt so we only prompt once per day, whatever the outcome.
  await LocalStorage.setItem(PROMPT_DATE_KEY, today);

  // Don't nag if a session is already active.
  if (await getActiveSession()) return;

  showSessionPrompt();
}
