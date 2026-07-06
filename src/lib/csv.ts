import { homedir } from "os";
import { join } from "path";
import { writeFileSync } from "fs";
import { Session } from "./types";
import { formatHMS, sessionTotalSeconds, sortedSpaces, spaceName } from "./format";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build the CSV text for a session's per-space breakdown. */
export function sessionToCsv(session: Session): string {
  const total = sessionTotalSeconds(session);
  const rows: string[] = [];

  // Metadata header block.
  rows.push(`Session,${csvEscape(session.name)}`);
  rows.push(`Started,${csvEscape(new Date(session.startedAt).toISOString())}`);
  rows.push(`Stopped,${csvEscape(session.stoppedAt ? new Date(session.stoppedAt).toISOString() : "in progress")}`);
  rows.push(`Total,${csvEscape(formatHMS(total))}`);
  rows.push("");

  // Table.
  rows.push(["Space", "Label", "Index", "Display", "Seconds", "Duration", "Percentage"].join(","));
  for (const rec of sortedSpaces(session)) {
    const pct = total > 0 ? ((rec.seconds / total) * 100).toFixed(1) : "0.0";
    rows.push(
      [
        csvEscape(spaceName(rec)),
        csvEscape(rec.label),
        rec.index,
        rec.display,
        Math.round(rec.seconds),
        formatHMS(rec.seconds),
        `${pct}%`,
      ].join(","),
    );
  }

  return rows.join("\n") + "\n";
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "session";
}

/** Write the CSV to ~/Downloads and return the file path. */
export function exportSessionCsv(session: Session): string {
  const csv = sessionToCsv(session);
  const filename = `space-time-${safeFilename(session.name)}-${session.id}.csv`;
  const path = join(homedir(), "Downloads", filename);
  writeFileSync(path, csv, "utf8");
  return path;
}
