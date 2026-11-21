// Shared plumbing for the Fundations game screens (docs/fundations.md "Screen API"): loading the data once, checking the
// {unit, world} params a game is launched with, and recording tries / the boss win through the existing event path.
// DOM-free apart from what store.js pulls in; the pure engine is fundations.js.
import { loadFundations, unitOf, WORLDS, GAME_MODES, TRY_KINDS } from "./fundations.js";
import { MOB_IDS } from "./mobsprites.js";
import { commitUntilSaved, earnRates } from "./store.js";

/** The validated Fundations data, loaded on first use and cached on app.fundations. A bad file throws (loudly). */
export async function ensureFundations(app) {
  if (!app.fundations) app.fundations = await loadFundations();
  return app.fundations;
}

/**
 * Check the params a game screen was launched with and return {unit, world, data, unitData}. Throws naming the problem
 * (a game must never guess a unit or world). `data` is app.fundations, which the launcher (app.runGame) has loaded.
 */
export function gameParams(app, opts) {
  if (!app.fundations) throw new Error("gameParams: app.fundations is not loaded (launch games through app.runGame)");
  const { unit, world } = opts ?? {};
  if (!WORLDS.includes(world)) throw new Error(`game params: world must be one of ${WORLDS.join(", ")} (got ${JSON.stringify(world)})`);
  const unitData = unitOf(app.fundations, unit);
  return { unit, world, data: app.fundations, unitData };
}

/**
 * Record one attempt as a fund_try event and pay for it. `t` = {unit, world, game, mode, item, kind, mob, result}
 * (the contract of the event; the server and offline.js validate it). In battle/ambush/forge/sounds a correct or assisted
 * attempt also earns earn.fund_emerald emeralds in the same save (like Word Blocks); a miss and the boss game earn none.
 * Returns the number of emeralds added (0 if none), so the screen can show the pop.
 */
export async function recordFundTry(app, t) {
  if (!(typeof t.game === "string" && Object.hasOwn(GAME_MODES, t.game)) || !GAME_MODES[t.game].includes(t.mode)) throw new Error(`recordFundTry: bad game/mode ${t.game}/${t.mode}`);
  if (!TRY_KINDS.includes(t.kind)) throw new Error(`recordFundTry: bad kind ${JSON.stringify(t.kind)}`);
  if (!MOB_IDS.includes(t.mob)) throw new Error(`recordFundTry: unknown mob ${JSON.stringify(t.mob)}`);
  const emeralds = t.game !== "boss" && t.result !== "miss" ? earnRates().fund_emerald : 0;
  const ev = { type: "fund_try", unit: t.unit, world: t.world, game: t.game, mode: t.mode, item: t.item, kind: t.kind, mob: t.mob, result: t.result };
  await commitUntilSaved(ev, emeralds ? (p) => { p.inventory.emerald += emeralds; } : null);
  return emeralds;
}

/** Record that the unit+world boss was beaten (fund_boss_won); the server grants the boss surprise and any armor tier. */
export async function recordBossWon(app, { unit, world }) {
  const { unitData } = gameParams(app, { unit, world });
  await commitUntilSaved({ type: "fund_boss_won", unit, world, boss: unitData.boss[world] }, null);
}
