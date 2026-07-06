import { showHUD } from "@raycast/api";
import { getSessions } from "./lib/storage";
import { exportSessionCsv } from "./lib/csv";

export default async function Command() {
  const all = await getSessions();
  if (all.length === 0) {
    await showHUD("No session to export");
    return;
  }
  const last = [...all].sort((a, b) => b.startedAt - a.startedAt)[0];
  try {
    const path = exportSessionCsv(last);
    await showHUD(`Exported “${last.name}” to ${path}`);
  } catch (err) {
    await showHUD(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
