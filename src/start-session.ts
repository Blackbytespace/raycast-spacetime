import { showHUD } from "@raycast/api";
import { startSession } from "./lib/storage";
import { tick } from "./lib/tracker";

export default async function Command() {
  await tick(); // flush time into any current session before replacing it
  const session = await startSession();
  await tick();
  await showHUD(`Started “${session.name}”`);
}
