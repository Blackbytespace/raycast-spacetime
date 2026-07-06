import { showHUD } from "@raycast/api";
import { getActiveSession, stopActiveSession } from "./lib/storage";
import { tick } from "./lib/tracker";

export default async function Command() {
  const active = await getActiveSession();
  if (!active) {
    await showHUD("No active Spacetime session");
    return;
  }
  await tick(); // flush final delta
  await stopActiveSession();
  await showHUD(`Stopped “${active.name}”`);
}
