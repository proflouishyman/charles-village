// Dad-facing controls for the letter-case layer. All text here is plain (Dad-only areas), never small caps.
import { h } from "./ui.js";
import { store, saveProgress } from "./store.js";
import { CASE_SCREENS, CASES, CASE_DEFAULTS } from "./lettercase.js";

const CASE_NAMES = { smallcaps: "small caps", lowercase: "lowercase", mixed: "mixed" };
const SCREEN_TITLES = { story: "Story", blocks: "Word Blocks", craft: "Crafting Table", mine: "Letter Mine", match: "Bridge Match" };

/** The live switch for Dad's bar: "Showing: small caps → lowercase"; a click flips the case showing right now. */
export function caseSwitchButton(cs) {
  const label = () => {
    const opts = cs.options;
    const next = opts[(opts.indexOf(cs.current()) + 1) % opts.length];
    return `Showing: ${CASE_NAMES[cs.current()]} → ${CASE_NAMES[next]}`;
  };
  const btn = h("button", { class: "btn small case-switch", text: label(), onclick: () => cs.toggle() });
  cs.onChange(() => { btn.textContent = label(); }); // also relabels when something else flips the case
  return btn;
}

/**
 * Settings control: one row per screen, "Starts in: Small caps | Lowercase" with the default marked. Choosing the
 * default deletes the key (and an empty letter_case is deleted), so an untouched file means today's behaviour.
 * `onChange` runs after each save (callers re-render).
 */
export function letterCaseControls(onChange) {
  const saved = store.progress.settings.letter_case ?? {};
  const rows = CASE_SCREENS.map((screen) => {
    const now = saved[screen] ?? CASE_DEFAULTS[screen];
    const buttons = CASES.map((c) => h("button", {
      class: `btn small${c === now ? " on" : ""}`, "data-screen": screen, "data-case": c, "aria-pressed": String(c === now),
      text: `${CASE_NAMES[c][0].toUpperCase()}${CASE_NAMES[c].slice(1)}${c === CASE_DEFAULTS[screen] ? " (default)" : ""}`,
      onclick: async () => {
        await saveProgress((q) => { // explicit target, so a re-applied mutation after a 409 is idempotent
          const lc = { ...(q.settings.letter_case ?? {}) };
          if (c === CASE_DEFAULTS[screen]) delete lc[screen]; else lc[screen] = c;
          if (Object.keys(lc).length === 0) delete q.settings.letter_case; else q.settings.letter_case = lc;
        });
        onChange();
      },
    }));
    return h("div", { class: "settings-row" }, h("span", { text: `${SCREEN_TITLES[screen]} starts in: ` }), ...buttons);
  });
  return h("div", { class: "settings-lettercase", id: "settings-lettercase" }, h("h2", { text: "Letter case" }),
    h("p", { text: "Which case each game starts in. Dad's bar has a switch to flip the case while Charles plays." }), ...rows);
}
