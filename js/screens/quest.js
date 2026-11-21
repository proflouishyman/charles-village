// The Quest hub (docs/fundations.md "Games"): unit map 1-14, world tabs, the four game buttons, the boss counter, the trophy
// wall and Charles in his armor. Everything shown is DERIVED from events (deriveFundationsProgress), never stored.
// Chrome is small caps through `kid`; the Dad bar is plain Dad-only text. Games are launched with app.runGame(name,
// {unit, world}) (main.js); when a game returns, the hub reads the events again and redraws.
import { h } from "../ui.js";
import { helpButton } from "../layout.js";
import { fundHelp } from "../fundhelp.js";
import { getEvents } from "../api.js";
import { spriteElement } from "../sprites.js";
import { soundToggleButton } from "../soundui.js";
import { MOB_IDS } from "../mobsprites.js";
import { mobElement } from "../mobstage.js";
import { ensureFundations } from "../fundgame.js";
import { deriveFundationsProgress, unitOf, UNITS, WORLDS, ARMOR_NAMES, GAMES } from "../fundations.js";

/** Display name of a mob id: "elder_guardian" -> "Elder Guardian". */
export const mobName = (id) => id.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

const WORLD_LABEL = { overworld: "Overworld", nether: "Nether" };
const GAME_BUTTONS = [
  { game: "battle", label: "Word Duel", icon: "pickaxe" },
  { game: "ambush", label: "Trick Word Ambush", icon: "bow" },
  { game: "forge", label: "Sword Forge", icon: "diamond_sword" },
  { game: "sounds", label: "Sound Potions", icon: "flask" },
  { game: "boss", label: "Unit Boss", icon: "totem" },
];
/** Armor colours for the overlay on Charles, index = tier - 1 (ARMOR_NAMES order). */
const ARMOR_COLOURS = ["#a0662d", "#9aa3ad", "#e8e8ec", "#f2c230", "#4fe0d0", "#3a2f3d"];

/** The selection the hub remembers between games: {unit, world}. null until the first run picks a default. */
let view = null;

/**
 * The unit and world to show first: the lowest unbeaten unit at or after the start unit whose Overworld is open (none left:
 * Unit 14), in the Nether once its Overworld boss is won. Pure: takes the derived progress.
 */
export function defaultView(progress) {
  const cur = progress.units.find((x) => x.unit >= progress.start_unit && x.worlds.overworld.open && !x.beaten) ?? progress.units[UNITS - 1];
  const world = cur.worlds.overworld.boss_won && cur.worlds.nether.open ? "nether" : "overworld";
  return { unit: cur.unit, world };
}

/** Charles with the armor of `tier` (0 = none) drawn over him: a helmet band and a chestplate in the tier's colour. */
export function charlesArmored(tier) {
  const box = h("div", { class: "charles-armor", "data-tier": String(tier) }, spriteElement("charles", 8));
  if (tier > 0) {
    const c = ARMOR_COLOURS[tier - 1];
    box.append(h("div", { class: "armor-helmet", style: `background:${c}` }), h("div", { class: "armor-chest", style: `background:${c}` }));
  }
  return box;
}

/** The trophy wall: every mob, shown in colour once vanquished at least once; a gold star count for golden trophies. */
export function trophyWall(progress) {
  return h("div", { class: "trophies" }, MOB_IDS.map((id) => {
    const n = progress.vanquished[id] ?? 0;
    const gold = progress.golden[id] ?? 0;
    const cell = h("div", { class: `trophy${n ? " got" : ""}${gold ? " golden" : ""}`, "data-mob": id, title: n ? `${mobName(id)}: ${n}` : "?" }, mobElement(id, { cls: "trophy-mob" }));
    if (gold) cell.append(h("span", { class: "trophy-gold", kid: `★${gold}` }));
    return cell;
  }));
}

/** Draw the hub for the current selection and wait for one action. Resolves {go: game} or {home: true} or {select: ...}. */
function draw(app, progress, data) {
  return new Promise((resolve) => {
    const { unit, world } = view;
    const u = progress.units[unit - 1];
    const ud = unitOf(data, unit);
    const w = u.worlds[world];
    const bossMob = ud.boss[world];
    const hasTrick = unit >= 2; // Unit 1 teaches no trick words
    const pick = (patch) => { view = { ...view, ...patch }; resolve({ select: true }); };

    const units = h("div", { class: "unit-map" }, progress.units.map((x) => {
      const open = x.worlds.overworld.open || x.worlds.nether.open;
      const cls = `unit-btn${x.unit === unit ? " sel" : ""}${x.beaten ? " beaten" : ""}${open ? "" : " locked"}`;
      return h("button", { class: cls, "data-unit": String(x.unit), ...(open ? {} : { disabled: "" }), onclick: () => {
        const nv = { unit: x.unit, world };
        if (!x.worlds[world].open) nv.world = world === "overworld" ? "nether" : "overworld";
        pick(nv);
      } }, h("span", { kid: String(x.unit) }), x.beaten ? spriteElement("emerald", 2) : null);
    }));
    const tabs = h("div", { class: "world-tabs" }, WORLDS.map((wd) =>
      h("button", { class: `btn world-tab${wd === world ? " sel" : ""}`, "data-world": wd, kid: WORLD_LABEL[wd],
        ...(u.worlds[wd].open ? {} : { disabled: "" }), onclick: () => pick({ world: wd }) })));

    const needed = progress.boss_needed;
    const counter = h("div", { class: "boss-counter", "data-ready": w.boss_ready ? "1" : "0" },
      h("span", { kid: w.boss_won ? `${mobName(bossMob)} beaten!` : w.boss_ready ? `${mobName(bossMob)} is awake!` : `${Math.min(w.vanquished, needed)}/${needed} to wake the ${mobName(bossMob)}` }),
      h("div", { class: "boss-bar" }, h("div", { class: "boss-fill", style: `width:${Math.round(100 * Math.min(1, w.vanquished / needed))}%` })));

    const gameButtons = h("div", { class: "game-row" }, GAME_BUTTONS.map(({ game, label, icon }) => {
      const off = (game === "ambush" && !hasTrick) || (game === "boss" && !w.boss_ready && !w.boss_won);
      return h("button", { class: `btn stage-btn game-btn${off ? " locked" : ""}`, "data-game": game, ...(off ? { disabled: "" } : {}),
        onclick: () => resolve({ go: game }) }, spriteElement(icon, 4), h("span", { kid: label }));
    }));

    const dadBar = h("div", { class: "dad-bar" },
      h("div", { class: "dad-label" }, spriteElement("dad", 2), h("span", { text: "DAD" })),
      h("button", { class: "btn dad-btn", id: "try-boss", text: "Let him try the boss", onclick: () => resolve({ go: "boss" }) }),
      h("div", { class: "dad-hint", text: `Unit ${unit}: ${ud.title}. ${w.vanquished} of ${needed} vanquished here; the boss opens at ${needed}. Units below ${progress.start_unit} are open (Settings).` }),
      soundToggleButton());

    app.root.replaceChildren(h("div", { class: "stage quest", "data-unit": String(unit), "data-world": world },
      h("div", { class: "stage-top" },
        h("button", { class: "btn small dad-only", id: "quest-home", kid: "Home", onclick: () => resolve({ home: true }) }),
        h("div", { class: "stage-head" }, h("div", { class: "stage-title", kid: "Mob Battle" })),
        helpButton(fundHelp("quest"))),
      h("div", { class: "stage-main quest-main" },
        h("div", { class: "quest-hero" }, charlesArmored(progress.armor_tier),
          h("div", { class: "armor-name", kid: progress.armor_tier ? `${ARMOR_NAMES[progress.armor_tier - 1]} armor` : "No armor yet" })),
        h("div", { class: "quest-center" }, units, tabs,
          h("div", { class: "unit-title", kid: `Unit ${unit}: ${ud.title}` }), counter, gameButtons),
        h("div", { class: "quest-trophies" }, h("div", { class: "trophy-title", kid: "Trophies" }), trophyWall(progress))),
      dadBar));
  });
}

/**
 * The hub screen. Loops: draw, then launch a game (app.runGame) or change the selection, until Dad taps Home.
 * Returns "done". Loading the data or the events can throw; main.js shows that loudly.
 */
export async function run(app) {
  const data = await ensureFundations(app);
  for (;;) {
    const progress = deriveFundationsProgress(await getEvents(), app.store.progress.settings, data);
    if (view === null) view = defaultView(progress);
    // A remembered selection that is no longer open (start unit lowered) falls back to the default.
    if (!progress.units[view.unit - 1].worlds[view.world].open) view = defaultView(progress);
    const act = await draw(app, progress, data);
    if (act.home) return "done";
    if (act.go) {
      if (!GAMES.includes(act.go)) throw new Error(`quest: unknown game "${act.go}"`);
      const r = await app.runGame(act.go, { unit: view.unit, world: view.world });
      if (r === "fatal") return "done"; // the error screen is showing; do not draw over it
    }
  }
}
