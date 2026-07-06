import { environment } from "@raycast/api";
import { execFileSync, execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { SpaceInfo } from "./format";

/**
 * Native macOS space detection.
 *
 * macOS has no public API for Spaces, but the private SkyLight framework exposes
 * the active space id via `SLSGetActiveSpace`. We ship a tiny C helper, compile
 * it on first use with clang, and call it each tick. The active-space id is then
 * mapped to a 1-based index + display by reading the (reliably ordered) space
 * list from `com.apple.spaces`.
 *
 * Reading the active space is a harmless read-only call — no SIP changes and no
 * scripting addition are required.
 */

// Bump to force a recompile after changing the source below.
const HELPER_VERSION = 4;

// Reads and prints the active space id. (Switching spaces is done via macOS
// keyboard shortcuts in spaceSwitch.ts, not here — the private WindowServer
// mutation calls are not honored from a Raycast subprocess.)
const HELPER_SRC = `#include <stdio.h>
#include <stdint.h>
typedef int CGSConnectionID;
extern CGSConnectionID SLSMainConnectionID(void);
extern uint64_t SLSGetActiveSpace(CGSConnectionID cid);
int main(void) {
    printf("%llu\\n", (unsigned long long)SLSGetActiveSpace(SLSMainConnectionID()));
    return 0;
}
`;

function helperBin(): string {
  // Version is baked into the filename so a stale build can never be run.
  return join(environment.supportPath, `space-helper-v${HELPER_VERSION}`);
}

function helperSrcPath(): string {
  return join(environment.supportPath, "space-helper.c");
}

/** Compiles the SkyLight helper on first use (cached thereafter). Returns its path. */
export function ensureHelper(): string {
  const bin = helperBin();
  if (existsSync(bin)) return bin;

  mkdirSync(environment.supportPath, { recursive: true });
  writeFileSync(helperSrcPath(), HELPER_SRC, "utf8");

  const clang = "/usr/bin/clang";
  if (!existsSync(clang)) {
    throw new Error("clang not found. Install the Xcode Command Line Tools with: xcode-select --install");
  }
  try {
    execFileSync(
      clang,
      [
        helperSrcPath(),
        "-o",
        bin,
        "-F/System/Library/PrivateFrameworks",
        "-framework",
        "SkyLight",
        "-framework",
        "CoreFoundation",
      ],
      { timeout: 20000 },
    );
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    throw new Error(`Failed to compile space helper: ${e.stderr ? String(e.stderr).trim() : e.message}`);
  }
  return bin;
}

/** The id of the currently active macOS space. */
export function getActiveSpaceId(): number {
  const bin = ensureHelper();
  const out = execFileSync(bin, [], { timeout: 4000, encoding: "utf8" }).trim();
  const id = Number(out);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`Could not read the active space (helper returned "${out}").`);
  }
  return id;
}

interface SpaceMeta {
  index: number;
  display: number;
}

interface RawSpace {
  ManagedSpaceID?: number;
}
interface RawMonitor {
  Spaces?: RawSpace[];
}
interface RawPrefs {
  SpacesDisplayConfiguration?: { "Management Data"?: { Monitors?: RawMonitor[] } };
}

let cache: { at: number; map: Map<number, SpaceMeta> } | undefined;
const MAP_TTL_MS = 15000;

/**
 * Builds an id -> {index, display} map from com.apple.spaces. The list ordering
 * is reliable (only the cached "current space" pointer is stale, which we don't
 * use). Index is 1-based and global across displays.
 */
function buildSpaceMap(): Map<number, SpaceMeta> {
  const json = execSync("defaults export com.apple.spaces - | plutil -convert json -o - -", {
    timeout: 5000,
    encoding: "utf8",
  });
  const data = JSON.parse(json) as RawPrefs;
  const monitors = data.SpacesDisplayConfiguration?.["Management Data"]?.Monitors ?? [];
  const map = new Map<number, SpaceMeta>();
  let counter = 0;
  monitors.forEach((mon, displayIndex) => {
    for (const sp of mon.Spaces ?? []) {
      counter++;
      if (typeof sp.ManagedSpaceID === "number") {
        map.set(sp.ManagedSpaceID, { index: counter, display: displayIndex + 1 });
      }
    }
  });
  return map;
}

function spaceMap(mustContain?: number): Map<number, SpaceMeta> {
  const now = Date.now();
  const stale = !cache || now - cache.at > MAP_TTL_MS;
  const missing = mustContain != null && cache != null && !cache.map.has(mustContain);
  if (stale || missing) {
    try {
      cache = { at: now, map: buildSpaceMap() };
    } catch {
      cache = cache ?? { at: now, map: new Map<number, SpaceMeta>() };
    }
  }
  return (cache ?? { at: now, map: new Map<number, SpaceMeta>() }).map;
}

/** Resolve a space id to its index/display (used for both live and recorded events). */
export function spaceInfoForId(id: number): SpaceInfo {
  let meta = spaceMap().get(id);
  if (!meta) meta = spaceMap(id).get(id); // rebuild once if this is a new/unknown space
  return { id, index: meta?.index ?? 0, label: "", display: meta?.display ?? 1 };
}

/** The currently focused space, resolved to an index/display. Throws if unavailable. */
export function getCurrentSpace(): SpaceInfo {
  return spaceInfoForId(getActiveSpaceId());
}

/**
 * Every space macOS currently knows about, ordered by index. Pass `fresh` to
 * bypass the cache (e.g. for the naming command); the menu bar uses the cache.
 */
export function listSpaces(fresh = false): SpaceInfo[] {
  const map = fresh ? buildSpaceMap() : spaceMap();
  if (fresh) cache = { at: Date.now(), map };
  const out: SpaceInfo[] = [];
  for (const [id, meta] of map.entries()) {
    out.push({ id, index: meta.index, label: "", display: meta.display });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/** Absolute path to the compiled space helper (compiling it if needed). */
export function helperPath(): string {
  return ensureHelper();
}
