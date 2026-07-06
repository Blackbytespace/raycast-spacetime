import {
  Color,
  Icon,
  MenuBarExtra,
  getPreferenceValues,
  launchCommand,
  LaunchType,
  openExtensionPreferences,
  showHUD,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { tick, TickResult } from "./lib/tracker";
import { getActiveSession, getSessions, setPaused, startSession, stopActiveSession } from "./lib/storage";
import { exportSessionCsv } from "./lib/csv";
import { formatDuration, sessionTotalSeconds, sortedSpaces, spaceInfoName, spaceName, SpaceInfo } from "./lib/format";
import { installWatcher, isWatcherRunning, uninstallWatcher } from "./lib/watcher";
import { listSpaces } from "./lib/native";
import { switchToSpace } from "./lib/spaceSwitch";
import { ensureSwitchDefaults } from "./lib/desktopShortcuts";
import { maybeAutoStartDailySession, maybeShowDailyPrompt, showSessionPrompt } from "./lib/notify";
import { Preferences, Session } from "./lib/types";

interface State {
  result: TickResult;
  session?: Session;
  watcherRunning: boolean;
  spaces: SpaceInfo[];
}

export default function Command() {
  const [state, setState] = useState<State>();
  const [loading, setLoading] = useState(true);
  const prefs = getPreferenceValues<Preferences>();

  async function refresh() {
    await maybeAutoStartDailySession(); // auto-start today's session first, if enabled
    const result = await tick();
    const session = await getActiveSession();
    const watcherRunning = isWatcherRunning();
    let spaces: SpaceInfo[] = [];
    try {
      ensureSwitchDefaults(); // apply default key codes + enable system shortcuts (once)
      spaces = listSpaces();
    } catch {
      spaces = [];
    }
    setState({ result, session, watcherRunning, spaces });
    setLoading(false);
    void maybeShowDailyPrompt(); // once-a-day "start a session?" prompt (non-blocking)
  }

  useEffect(() => {
    refresh();
  }, []);

  const status = state?.result.status ?? "idle";
  const session = state?.session;
  const watcherRunning = state?.watcherRunning ?? false;
  const spaces = state?.spaces ?? [];
  const activeId = state?.result.currentSpace?.id;

  const { icon, title } = menuBarSummary(state);

  return (
    <MenuBarExtra icon={icon} title={title} isLoading={loading} tooltip="Spacetime">
      {status === "idle" && <MenuBarExtra.Item title="No active session" icon={Icon.Circle} />}

      {session && (
        <>
          <MenuBarExtra.Section title={session.name}>
            <MenuBarExtra.Item title={`Status: ${statusLabel(status)}`} icon={statusIcon(status)} />
            <MenuBarExtra.Item title={`Total: ${formatDuration(sessionTotalSeconds(session))}`} icon={Icon.Clock} />
            {state?.result.currentSpace && (
              <MenuBarExtra.Item title={`Current: ${spaceInfoName(state.result.currentSpace)}`} icon={Icon.Desktop} />
            )}
            <MenuBarExtra.Item
              title={`Precision: ${watcherRunning ? "Live watcher (~1s)" : "Menu-bar refresh only"}`}
              icon={watcherRunning ? Icon.Bolt : Icon.Clock}
            />
            {state?.result.error && <MenuBarExtra.Item title={state.result.error} icon={Icon.Warning} />}
          </MenuBarExtra.Section>

          <MenuBarExtra.Section title="Per-space">
            {sortedSpaces(session)
              .slice(0, 12)
              .map((rec) => (
                <MenuBarExtra.Item
                  key={rec.key}
                  title={spaceName(rec)}
                  subtitle={formatDuration(rec.seconds)}
                  icon={Icon.Desktop}
                />
              ))}
            {Object.keys(session.spaces).length === 0 && (
              <MenuBarExtra.Item title="No space recorded yet" icon={Icon.Dot} />
            )}
          </MenuBarExtra.Section>
        </>
      )}

      <MenuBarExtra.Section title="Session">
        <MenuBarExtra.Item
          title="Start New Spacetime Session"
          icon={Icon.Play}
          onAction={async () => {
            await tick(); // flush time into any current session before replacing it
            await startSession();
            await tick();
          }}
        />
        {status !== "idle" && !session?.paused && (
          <MenuBarExtra.Item
            title="Pause Spacetime Session"
            icon={Icon.Pause}
            onAction={async () => {
              await tick(); // flush time up to now before pausing
              await setPaused(true);
            }}
          />
        )}
        {status !== "idle" && session?.paused && (
          <MenuBarExtra.Item
            title="Resume Spacetime Session"
            icon={Icon.Play}
            onAction={async () => {
              await setPaused(false);
            }}
          />
        )}
        {status !== "idle" && (
          <MenuBarExtra.Item
            title="Stop Spacetime Session"
            icon={Icon.Stop}
            onAction={async () => {
              await tick(); // flush final delta
              await stopActiveSession();
            }}
          />
        )}
        <MenuBarExtra.Item
          title="Export Last Spacetime Session"
          icon={Icon.Download}
          onAction={async () => {
            const all = await getSessions();
            if (all.length === 0) {
              await showHUD("No session to export");
              return;
            }
            const last = [...all].sort((a, b) => b.startedAt - a.startedAt)[0];
            try {
              const path = exportSessionCsv(last);
              await showHUD(`Exported "${last.name}" to ${path}`);
            } catch (err) {
              await showHUD(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }}
        />
      </MenuBarExtra.Section>

      {spaces.length > 0 && (
        <MenuBarExtra.Section title="Switch to Space">
          {spaces.map((sp) => (
            <MenuBarExtra.Item
              key={sp.id}
              title={spaceInfoName(sp)}
              icon={sp.id === activeId ? { source: Icon.CircleFilled, tintColor: Color.Green } : Icon.Desktop}
              subtitle={sp.id === activeId ? "current" : `Display ${sp.display}`}
              onAction={async () => {
                try {
                  if (sp.id != null) await switchToSpace(sp.id);
                } catch (err) {
                  await showHUD(err instanceof Error ? err.message : String(err));
                }
              }}
            />
          ))}
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section title="Live Tracking (background watcher)">
        <MenuBarExtra.Item
          title={watcherRunning ? "Watcher: Running" : "Watcher: Stopped"}
          icon={watcherRunning ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Circle}
        />
        {watcherRunning ? (
          <MenuBarExtra.Item
            title="Stop Live Watcher"
            icon={Icon.XMarkCircle}
            onAction={async () => {
              try {
                uninstallWatcher();
                await showHUD("Live watcher stopped");
              } catch (err) {
                await showHUD(`Failed to stop watcher: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        ) : (
          <MenuBarExtra.Item
            title="Start Live Watcher"
            icon={Icon.Bolt}
            tooltip="Records exact space-switch times in the background for precise per-space totals"
            onAction={async () => {
              try {
                installWatcher();
                await showHUD("Live watcher started");
              } catch (err) {
                await showHUD(`Failed to start watcher: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        )}
      </MenuBarExtra.Section>

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Rename Current Space…"
          icon={Icon.Pencil}
          onAction={async () => {
            await launchCommand({ name: "name-current", type: LaunchType.UserInitiated });
          }}
        />
        <MenuBarExtra.Item
          title="Setup Spacetime…"
          icon={Icon.Wand}
          onAction={async () => {
            await launchCommand({ name: "setup", type: LaunchType.UserInitiated });
          }}
        />
        <MenuBarExtra.Item
          title="Open Sessions…"
          icon={Icon.List}
          onAction={async () => {
            await launchCommand({ name: "sessions", type: LaunchType.UserInitiated });
          }}
        />
        <MenuBarExtra.Item
          title="Settings…"
          icon={Icon.Gear}
          subtitle={prefs.inactivityEnabled ? `idle pause @ ${prefs.inactivityMinutes}m` : "idle pause off"}
          onAction={openExtensionPreferences}
        />
        <MenuBarExtra.Item title="Show Daily Reminder (Dev)" icon={Icon.Bell} onAction={() => showSessionPrompt()} />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function menuBarSummary(state?: State): { icon: Icon | { source: Icon; tintColor: Color }; title?: string } {
  const status = state?.result.status ?? "idle";
  switch (status) {
    case "tracking": {
      const space = state?.result.currentSpace;
      return {
        icon: { source: Icon.Clock, tintColor: Color.Green },
        title: space ? spaceInfoName(space) : undefined,
      };
    }
    case "paused":
      return { icon: { source: Icon.Pause, tintColor: Color.Yellow }, title: "Paused" };
    case "auto-paused":
      return { icon: { source: Icon.Moon, tintColor: Color.Yellow }, title: "Idle" };
    case "error":
      return { icon: { source: Icon.Warning, tintColor: Color.Red } };
    default:
      return { icon: Icon.Clock };
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "tracking":
      return "Tracking";
    case "paused":
      return "Paused";
    case "auto-paused":
      return "Auto-paused (idle)";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function statusIcon(status: string): Icon {
  switch (status) {
    case "tracking":
      return Icon.CircleFilled;
    case "paused":
      return Icon.Pause;
    case "auto-paused":
      return Icon.Moon;
    case "error":
      return Icon.Warning;
    default:
      return Icon.Circle;
  }
}
