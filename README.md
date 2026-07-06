# Spacetime

A [Raycast](https://raycast.com) extension that tracks how much time you spend in each macOS space (Mission Control
desktop), with automatic inactivity detection and CSV export. **No window manager required.**

## Features

1. **Start a tracking session** — from the menu bar or the *Tracking Sessions* command.
2. **Automatic space detection** — detects the active space natively (see below); no external tools.
3. **Per-space time recording** — wall-clock time between ticks is attributed to the space you were in.
4. **CSV export** — export any session (per-space breakdown + percentages) to `~/Downloads`, or copy it to the clipboard.
5. **Stop a session** — from the menu bar or the sessions list; the final interval is flushed before stopping.
6. **Inactivity detection** — after a configurable idle threshold (default **2 minutes**, read from macOS `HIDIdleTime`),
   tracking auto-pauses and resumes as soon as you're active again. This is a **configurable option** (on/off + threshold).

## How space detection works

macOS has no public API for Spaces, but the private **SkyLight** framework exposes the active space id via
`SLSGetActiveSpace`. On first use the extension:

1. writes a tiny C helper to its support directory and compiles it with `clang`
   (`-framework SkyLight`), caching the binary;
2. runs the helper each tick to get the active space **id**;
3. maps that id to a 1-based **index** and **display** using the reliably-ordered space list from
   `com.apple.spaces` (the ordering is stable; only the cached "current space" pointer is unreliable, which is why we
   read the *live* id from SkyLight instead).

Reading the active space is a harmless read-only call — **no SIP changes and no scripting addition** are needed.
Because spaces are keyed by their stable id, reordering spaces mid-session doesn't
split their totals. Spaces are named `Space <index>` (macOS spaces have no user labels).

The tracker runs as a **menu bar command** with a background refresh `interval` of `1s`. Time is measured from the
actual wall-clock delta between ticks, so totals stay accurate regardless of the interval — the interval only bounds how
precisely a space *switch* is attributed. Gaps larger than one hour (e.g. sleep with inactivity detection off) are
ignored to avoid bogus jumps. All data is stored locally via Raycast `LocalStorage`; only one session is active at a time.

## Live watcher (precise timing)

Raycast redraws a menu-bar command only on its own background-refresh cadence (which it clamps and may delay), so the
title can lag behind a space switch by several seconds, and quick A→B→A switches within a refresh window can be
mis-attributed. To make the recorded **data** precise regardless of that, enable the **Live Watcher** from the menu bar
(*Live Tracking → Start Live Watcher*).

It installs a small **launchd agent** (`com.raycast.space-time-tracker.watcher`) that runs the SkyLight helper in a
~1-second loop and appends a timestamped event on every space change. On its next refresh the tracker folds those exact
timestamps into the active session, so per-space totals are accurate to the moment of each switch — even for switches
that happened between Raycast refreshes. The agent uses `KeepAlive`/`RunAtLoad`, so it survives logout and reboot until
you stop it (*Stop Live Watcher*, which boots it out and removes the plist).

> Note: the watcher improves the *accuracy of recorded time*. It does **not** make the always-visible menu-bar title
> update sub-second — that is bounded by Raycast's menu-bar refresh and cannot be pushed faster from an extension. The
> space shown when you *open* the dropdown is always live.

## Commands

| Command | Mode | Description |
| --- | --- | --- |
| **Space Tracker** | Menu bar | The tracking engine + start / pause / resume / stop controls, live-watcher toggle, and a per-space breakdown. |
| **Tracking Sessions** | View | Browse recorded sessions, see per-space charts, rename, delete, and export to CSV. |
| **Spaces List** | View | List all spaces: the default action switches to a space; each also has a Rename Space action. |
| **Name Current Space** | View | Name the space you're currently on (also launchable from the menu bar). |
| **Setup Spaces** | View | One place to apply everything switching needs: enables the Mission Control shortcuts, turns off auto-rearrange, assigns key codes, and checks Accessibility. |

## Switching spaces

The **Space Tracker** menu bar dropdown has a **Switch to Space** section, and *Go to Space* is the default action in
**Spaces List**. Switching works by synthesizing the **macOS keyboard shortcut** you've assigned to that desktop (the
same approach the NameSpaces extension uses) — the private WindowServer switch calls are *not* honored from a Raycast
subprocess, so this is the only reliable method.

**This is set up automatically.** When the extension runs it:

- assigns each space (index 1–9) its default key code — Control + the matching digit (`18`=1, `19`=2, `20`=3, `21`=4,
  `23`=5, `22`=6, `26`=7, `28`=8, `25`=9), and
- enables the macOS "Switch to Desktop N" shortcuts once (writes `com.apple.symbolichotkeys` and reloads them via
  `activateSettings -u`).

So the **only** manual step is granting **Accessibility** to Raycast — macOS asks the first time you switch (or add it
under System Settings › Privacy & Security › Accessibility).

Run the **Setup Spaces** command (also in the menu bar as *Setup Spaces…*) for a one-stop checklist: it shows the status
of each requirement — Mission Control shortcuts, auto-rearrange off, key codes assigned, Accessibility granted — with a
**Run Full Setup** (⌘↵) action that applies them all (turning off auto-rearrange restarts the Dock) and a button that
opens the Accessibility settings pane. You can also override a space's key in *Edit Space*; spaces with a shortcut show
a keyboard icon.

> The `Ctrl+N` → space mapping is only stable if **"Automatically rearrange Spaces based on most recent use"** is **off**
> (System Settings › Desktop & Dock › Mission Control). With it on, macOS renumbers desktops as you use them.

## Naming spaces

macOS has no concept of a named space (Mission Control desktops are just "Desktop 1, 2, 3…") and exposes no API to set
one. The **Spaces List** command (via its Rename Space action) instead stores your own names, keyed by each space's *stable id* — so a name stays
attached to the same space even if you reorder them. Named spaces show up by name in the menu bar, the per-space
breakdown, and CSV exports; unnamed ones fall back to `Space <index>`. Names are stored locally in
`space-names.json` in the extension's support directory.

To name the space you're on right now without hunting through the list, use **Name Current Space** — it opens a form
prefilled for the active space. It's also available straight from the menu bar (*Name Current Space…*).

## Preferences

| Preference | Default | Description |
| --- | --- | --- |
| `Inactivity Detection` | on | Pause tracking automatically when idle. |
| `Idle Threshold (minutes)` | `2` | Minutes of inactivity before auto-pause. |
| `Daily Session Reminder` | on | Once a day after 6am, prompt to start a new session (skipped if one is already running). |
| `Automatic Daily Session` | off | Start a new session automatically once a day, with no prompt or action. |

## Daily session reminder

When enabled, the first time the menu-bar command runs after 6am each day (and no session is active), a dialog asks
*"Would you like to start a new Spacetime session for today?"* with **Start a session** / **No thanks**. Choosing *Start
a session* launches the Start command via a Raycast deeplink. It's shown at most once per day. The menu bar also has a
**Show Daily Reminder (Dev)** item to trigger the dialog on demand for testing.

## Automatic daily session

Enable **Automatic Daily Session** to get one session per day with zero interaction. The first time the menu-bar command
runs each calendar day (i.e. when you next use/wake the computer), it starts a new session automatically — replacing a
stale session left running from a previous day, or keeping one you already started today. While this is on, the daily
reminder dialog is suppressed. It's tracked once per day via LocalStorage, so it won't start more than one.

## Requirements

- macOS (uses the private SkyLight framework for space detection and `ioreg` for idle detection).
- **Xcode Command Line Tools** (`xcode-select --install`) — needed once, so `clang` can compile the ~8-line helper.

## Notes & caveats

- Space detection relies on a **private Apple API** (`SLSGetActiveSpace`). It's unofficial but has been stable for years.
  A future macOS release could change it.
- The extension process must run within your GUI login session (it does, as a Raycast command) to reach the
  WindowServer. If the helper ever returns `0` (e.g. at the login window), that tick is skipped rather than miscounted.

## Development

```bash
npm install
npm run dev        # develop against the local Raycast app
npm run build      # ray build -e dist
npm run lint       # ray lint
npm run generate-icon  # regenerate assets/icon.png
```
