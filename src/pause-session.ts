import { showHUD } from "@raycast/api";
import { getActiveSession, setPaused } from "./lib/storage";
import { tick } from "./lib/tracker";

export default async function Command() {
  const active = await getActiveSession();
  if (!active) {
    await showHUD("No active Spacetime session");
    return;
  }
  if (active.paused) {
    await showHUD("Session already paused");
    return;
  }
  await tick(); // flush time up to now before pausing
  await setPaused(true);
  await showHUD(`Paused “${active.name}”`);
}
