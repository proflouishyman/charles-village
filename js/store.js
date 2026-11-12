// Progress + event persistence with loud failure. Also holds the Dad-only clock's pause accounting
// (store.pausedMs / store.pausedAt, togglePause): display/suggestion only, never part of session events.
// All awards go through commitUntilSaved (see savequeue.js): one queue, rev-checked PUTs, and if a save
// fails the PROGRESS NOT SAVED banner appears and nothing more is awarded until the server accepts a retry.
import { getProgress, putProgress, postEvent, getVillage } from "./api.js";
import { localIso, clockElapsedMs } from "./util.js";
import { showSaveBanner, hideSaveBanner } from "./ui.js";
import { createCommitter, SKIP } from "./savequeue.js";
import { applySoundSetting } from "./sounds.js";
import { handleEventReply } from "./surprise.js";
import { validateEarn } from "./villagelogic.js";

export { SKIP };
/** `earn` = the emerald rates from GET /api/village (config/minecraft.json), loaded at boot; null until then. */
export const store = { progress: null, sessionId: null, sessionStartMs: null, pausedMs: 0, pausedAt: null, locked: false, earn: null };

/** The emerald rates, or a loud error if boot did not load them (a screen must never guess a rate). */
export function earnRates() {
  if (!store.earn) throw new Error("emerald earn rates were not loaded from /api/village (boot must call loadVillageRates)");
  return store.earn;
}

/** Build a full event from type-specific fields. */
export function makeEvent(fields) {
  if (!store.sessionId) throw new Error("makeEvent: no session started");
  return { v: 1, ts: localIso(), session_id: store.sessionId, ...fields };
}

const committer = createCommitter({
  api: { getProgress, putProgress, postEvent },
  state: store,
  makeEvent,
  onProgress: (p) => applySoundSetting(p.settings.sound),
  onLock: showSaveBanner,
  onUnlock: hideSaveBanner,
  onEvent: handleEventReply, // new treasure toast + queued level-up (surprise.js)
});

/** Load progress from the server (throws ApiError; callers show it loudly). */
export const loadProgress = committer.load;
export const commitUntilSaved = committer.commit;

/** Begin a session (idempotent). Logs session_start. */
export async function ensureSession() {
  if (store.sessionId) return;
  store.sessionId = crypto.randomUUID();
  store.sessionStartMs = Date.now();
  store.pausedMs = 0;
  store.pausedAt = null;
  await commitUntilSaved({ type: "session_start" }, null);
}

/** End the session: logs session_end and resets the clock. */
export async function endSession() {
  if (!store.sessionId) return;
  await commitUntilSaved({ type: "session_end" }, null);
  store.sessionId = null;
  store.sessionStartMs = null;
  store.pausedMs = 0;
  store.pausedAt = null;
}

/** Unpaused session time in ms (frozen while paused). Throws if no session is running. */
export function clockElapsed(now = Date.now()) {
  if (!store.sessionStartMs) throw new Error("clockElapsed: no session started");
  return clockElapsedMs(now, store.sessionStartMs, store.pausedMs, store.pausedAt);
}

/** Pause or resume the clock; returns true if now paused. Throws if no session is running. */
export function togglePause(now = Date.now()) {
  if (!store.sessionStartMs) throw new Error("togglePause: no session started");
  if (store.pausedAt === null) store.pausedAt = now;
  else { store.pausedMs += now - store.pausedAt; store.pausedAt = null; }
  return store.pausedAt !== null;
}

/** Save a progress-only change (settings, active letters). */
export const saveProgress = (mutate) => commitUntilSaved(null, mutate);

/** Read the emerald earning rates from the server (validated; a bad reply throws). Called once at boot. */
export async function loadVillageRates() {
  const v = await getVillage();
  store.earn = validateEarn(v.earn, "/api/village.earn");
  return store.earn;
}
