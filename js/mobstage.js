// The shared mob stage for the Fundations games (docs/fundations.md "Mobs", "Screen API"): a mob holding a sign whose word
// is real text drawn through render() with the world's case (Overworld small caps, Nether lowercase), the gentle-miss
// animation, the vanquish effects, and the golden variant (a CSS filter, never new art).
//
// No sound here: sounds stay success-only and are the screen's business (playPop on a vanquish). Animations are CSS
// (style.css "Mob stage"); under prefers-reduced-motion they shrink to a short fade, and the returned promises still
// resolve, so a game's flow never depends on motion. Importable in node (the DOM is touched only inside functions).
import { PALETTE } from "./sprites.js";
import { MOB_SPRITES, MOB_PALETTE } from "./mobsprites.js";
import { render } from "./lettercase.js";
import { worldCase, WORLDS } from "./fundations.js";

/** Vanquish effect per presenter mob (docs/fundations.md): burst, crumble, puff, split. Any other mob (a Find it decoy) puffs;
 *  a unit boss plays "boss" (pass asBoss to vanquish/effectFor). */
export const EFFECTS = {
  creeper: "burst", blaze: "burst",
  skeleton: "crumble", wither_skeleton: "crumble",
  zombie: "puff", zombified_piglin: "puff",
  slime: "split", magma_cube: "split",
};
/** How long each effect runs before the mob is gone (ms); reduced motion uses REDUCED_MS. */
export const EFFECT_MS = { burst: 800, crumble: 900, puff: 700, split: 900, boss: 1500 };
export const REDUCED_MS = 250;
export const MISS_MS = 500;
export const MAX_STEPS = 3; // a mob never gets closer than this many steps: it never reaches him

/** The effect a mob plays when vanquished: "boss" when `asBoss`, else its EFFECTS entry, else "puff". */
export function effectFor(mobId, { asBoss = false } = {}) {
  if (!(mobId in MOB_SPRITES)) throw new Error(`effectFor: unknown mob "${mobId}"`);
  return asBoss ? "boss" : (EFFECTS[mobId] ?? "puff");
}

/** True when the user asked for less motion. Safe without a DOM (false). */
export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The sign's HTML for `text` in `world`, through render() with the world's case override. */
export function signHtml(text, world) {
  if (!WORLDS.includes(world)) throw new Error(`signHtml: unknown world "${world}"`);
  return render(text, worldCase(world));
}

/** CSS classes for the sign's reading area ("reading smallcaps" / "reading lowercase": the small-caps test exempts .reading). */
export function signClass(world) {
  return `mob-sign reading ${worldCase(world).case}`;
}

const canvases = new Map();
/** Offscreen canvas of a mob sprite (cached). Never insert the cached canvas into the page: use mobElement. */
export function mobCanvas(mobId) {
  const s = MOB_SPRITES[mobId];
  if (!s) throw new Error(`mobCanvas: unknown mob "${mobId}"`);
  if (canvases.has(mobId)) return canvases.get(mobId);
  const colours = { ...PALETTE, ...MOB_PALETTE };
  const cv = document.createElement("canvas");
  cv.width = s.rows[0].length;
  cv.height = s.rows.length;
  const ctx = cv.getContext("2d");
  s.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    if (!(ch in colours)) throw new Error(`mobCanvas: mob "${mobId}" row ${y} uses colour "${ch}" which is in no palette`);
    ctx.fillStyle = colours[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  canvases.set(mobId, cv);
  return cv;
}

/** A fresh, pixelated canvas element showing a mob. Its size comes from CSS (.mob-canvas, or `height` in px if given). */
export function mobElement(mobId, { height = null, cls = "mob-canvas" } = {}) {
  const src = mobCanvas(mobId);
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  cv.getContext("2d").drawImage(src, 0, 0);
  cv.className = cls;
  cv.dataset.mob = mobId;
  if (height) cv.style.height = `${height}px`;
  return cv;
}

/**
 * Build a mob holding a sign. Options: mob (id), text (the sign's word; omit for a mob with no sign), world ("overworld"
 * | "nether"), golden (CSS filter), size ("normal" | "big" for bosses | "small" for choices in Find it).
 * Returns {el, mobEl, signEl, setText(text), setGolden(bool)}. `el` carries data-mob, data-world and, once vanquished,
 * data-state="gone". Keep `el` in the page until the vanquish promise has resolved (like the reward-pop anchor invariant).
 */
export function createMobStage({ mob, text = null, world, golden = false, size = "normal" }) {
  if (!WORLDS.includes(world)) throw new Error(`createMobStage: unknown world "${world}"`);
  const el = document.createElement("div");
  el.className = `mob-stage ${size}${golden ? " golden" : ""}`;
  el.dataset.mob = mob;
  el.dataset.world = world;
  el.dataset.steps = "0";
  const mobEl = mobElement(mob);
  const stage = { el, mobEl, signEl: null, missCount: 0 };
  el.append(mobEl);
  if (text !== null) {
    const signEl = document.createElement("div");
    signEl.className = signClass(world);
    signEl.innerHTML = signHtml(text, world);
    el.append(signEl);
    stage.signEl = signEl;
  }
  stage.setText = (t) => {
    if (!stage.signEl) throw new Error("setText: this mob stage has no sign");
    stage.signEl.innerHTML = signHtml(t, world);
  };
  stage.setGolden = (g) => el.classList.toggle("golden", !!g);
  return stage;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Gentle miss ("Let's try again"): no sound, no red, no loss. Alternates between the mob taking one step closer
 * (up to MAX_STEPS, then it simply stays) and his shield blocking it ("clank"). Resolves when the animation is over.
 */
export async function gentleMiss(stage) {
  const { el } = stage;
  stage.missCount += 1;
  const clank = stage.missCount % 2 === 0;
  if (clank) {
    const shield = document.createElement("div");
    shield.className = "mob-shield";
    el.append(shield);
    await wait(prefersReducedMotion() ? 120 : MISS_MS);
    shield.remove();
  } else {
    el.dataset.steps = String(Math.min(MAX_STEPS, Number(el.dataset.steps) + 1));
    el.classList.add("stepping");
    await wait(prefersReducedMotion() ? 120 : MISS_MS);
    el.classList.remove("stepping");
  }
}

/** The particles of an effect: [{cls, dx, dy}] with fixed, evenly spread offsets (no randomness). */
export function particlesFor(effect) {
  const spec = { burst: ["emerald", 12], crumble: ["bone", 8], puff: ["smoke", 7], split: ["slime", 4], boss: ["loot", 24] }[effect];
  if (!spec) throw new Error(`particlesFor: unknown effect "${effect}"`);
  const [cls, n] = spec;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const d = 70 + (i % 3) * 30;
    return { cls, dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d * 0.8 - 20) };
  });
}

/**
 * Play the vanquish effect for the stage's mob and leave it gone (data-state="gone", mob hidden). Resolves when done.
 * `asBoss` forces the boss effect (big shake + loot shower). Under reduced motion only a short fade runs.
 */
export async function vanquish(stage, { asBoss = false } = {}) {
  const { el } = stage;
  const effect = effectFor(el.dataset.mob, { asBoss });
  el.classList.add("vanquishing", `fx-${effect}`);
  for (const p of particlesFor(effect)) {
    const s = document.createElement("span");
    s.className = `fx fx-${p.cls}`;
    s.style.setProperty("--dx", `${p.dx}px`);
    s.style.setProperty("--dy", `${p.dy}px`);
    el.append(s);
  }
  await wait(prefersReducedMotion() ? REDUCED_MS : EFFECT_MS[effect]);
  for (const s of el.querySelectorAll(".fx")) s.remove();
  el.classList.remove("vanquishing", `fx-${effect}`);
  el.dataset.state = "gone";
  return effect;
}
