import { showHUD } from "@raycast/api";
import { getActiveSession, setPaused } from "./lib/storage";

export default async function Command() {
  const active = await getActiveSession();
  if (!active) {
    await showHUD("No active Spacetime session");
    return;
  }
  if (!active.paused) {
    await showHUD("Session is not paused");
    return;
  }
  await setPaused(false);
  await showHUD(`Resumed “${active.name}”`);
}
