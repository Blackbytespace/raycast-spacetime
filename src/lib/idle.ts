import { execSync } from "child_process";

/**
 * Returns the number of seconds since the last user input (keyboard/mouse),
 * read from the macOS IOHIDSystem. Returns 0 if it cannot be determined.
 */
export function getIdleSeconds(): number {
  try {
    // `-r -d 1` keeps the output tiny (~a few dozen lines) since this runs on every tick.
    const out = execSync("/usr/sbin/ioreg -c IOHIDSystem -r -d 1", { timeout: 4000, encoding: "utf8" });
    const match = out.match(/"HIDIdleTime"\s*=\s*(\d+)/);
    if (!match) return 0;
    // HIDIdleTime is reported in nanoseconds.
    return Number(match[1]) / 1_000_000_000;
  } catch {
    return 0;
  }
}
