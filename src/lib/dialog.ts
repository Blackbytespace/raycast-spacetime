import { spawn } from "child_process";

/**
 * Shows a native macOS warning alert (a modal dialog with the yellow caution
 * icon) — far more visible than a HUD, and works from no-view commands. Detached
 * and unref'd so it never blocks the calling command's process.
 */
export function showWarningAlert(message: string, title = "Spacetime"): void {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display alert "${esc(title)}" message "${esc(message)}" as warning buttons {"OK"} default button "OK"`;
  const child = spawn("/usr/bin/osascript", ["-e", script], { detached: true, stdio: "ignore" });
  child.unref();
}
