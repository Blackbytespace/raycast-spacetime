/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Inactivity Detection - When enabled, tracking pauses automatically after a period of no keyboard/mouse activity. */
  "inactivityEnabled": boolean,
  /** Idle Threshold (minutes) - How many minutes of inactivity before tracking auto-pauses. */
  "inactivityMinutes": string,
  /** Media Playback - Don't auto-pause when an app is playing video/audio or otherwise keeping the display awake (e.g. watching a video or presenting). */
  "keepTrackingWhileMedia": boolean,
  /** Automatic Daily Session - Automatically start a new session once a day (when you first use your computer), with no action. */
  "autoDailySession": boolean,
  /** Save Sessions to Disk - When a session is stopped (or replaced by a new one), automatically write it as a CSV file to the folder below. */
  "autoSaveSessions": boolean,
  /** Sessions Folder - Folder where stopped sessions are saved as CSV. Defaults to Downloads if left empty. */
  "autoSaveDirectory"?: string,
  /** Organize by Year/Month - Nest saved CSV files under year/month folders, e.g. 2026/07/session-2026-07-06-15h23.csv. */
  "autoSaveSubfolders": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `tracker` command */
  export type Tracker = ExtensionPreferences & {}
  /** Preferences accessible in the `sessions` command */
  export type Sessions = ExtensionPreferences & {}
  /** Preferences accessible in the `spaces` command */
  export type Spaces = ExtensionPreferences & {}
  /** Preferences accessible in the `name-current` command */
  export type NameCurrent = ExtensionPreferences & {}
  /** Preferences accessible in the `setup` command */
  export type Setup = ExtensionPreferences & {}
  /** Preferences accessible in the `start-session` command */
  export type StartSession = ExtensionPreferences & {}
  /** Preferences accessible in the `stop-session` command */
  export type StopSession = ExtensionPreferences & {}
  /** Preferences accessible in the `export-last-session` command */
  export type ExportLastSession = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `tracker` command */
  export type Tracker = {}
  /** Arguments passed to the `sessions` command */
  export type Sessions = {}
  /** Arguments passed to the `spaces` command */
  export type Spaces = {}
  /** Arguments passed to the `name-current` command */
  export type NameCurrent = {}
  /** Arguments passed to the `setup` command */
  export type Setup = {}
  /** Arguments passed to the `start-session` command */
  export type StartSession = {}
  /** Arguments passed to the `stop-session` command */
  export type StopSession = {}
  /** Arguments passed to the `export-last-session` command */
  export type ExportLastSession = {}
}

