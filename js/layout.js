// Shared stage layout: a big area for Charles and a visually separate DAD bar at the bottom.
import { h, setKid } from "./ui.js";
import { soundToggleButton } from "./soundui.js";
import { caseSwitchButton } from "./lettercaseui.js";
import { spriteElement } from "./sprites.js";

// main.js registers what the gear button does (leave the stage, then show Settings); layout stays screen-agnostic.
let settingsOpener = null;
export function setSettingsOpener(fn) { settingsOpener = fn; }

/**
 * Open the Help overlay (`help` = one validated fundhelp.js entry {title, sections}) over whatever screen is showing.
 * Purely visual: it touches no game state and no pending Dad choice. Closes on "Got it", Escape or a backdrop tap, then
 * returns focus to `opener` (the ? button). The panel lives inside the current screen's root, so it vanishes if the
 * screen is replaced. No timers, no global listeners.
 */
export function openHelp(help, opener = null) {
  const host = document.getElementById("app") || document.body;
  if (document.getElementById("help-panel")) return; // already open
  const close = () => { panel.remove(); opener?.focus?.(); };
  const closeBtn = h("button", { class: "btn big", id: "help-close", text: "Got it", onclick: close });
  const card = h("div", { class: "help-card" },
    h("h2", { class: "help-title", text: help.title }),
    h("div", { class: "help-body" }, help.sections.map((sec) =>
      h("section", { class: "help-section" }, h("h3", { text: sec.heading }), h("ul", {}, sec.lines.map((t) => h("li", { text: t })))))),
    closeBtn);
  const panel = h("div", { class: "help-backdrop", id: "help-panel", role: "dialog", "aria-modal": "true", "aria-label": help.title,
    onclick: (e) => { if (e.target === panel) close(); },
    onkeydown: (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      else if (e.key === "Tab") { e.preventDefault(); closeBtn.focus(); } // the only focusable control: keep focus inside
    } }, card);
  host.append(panel);
  closeBtn.focus();
}

/** The "?" button for the right end of a `.stage-top`: opens the Help overlay for `help`. Shared by stageLayout and the hub. */
export function helpButton(help) {
  if (!help || !Array.isArray(help.sections)) throw new Error("helpButton: needs a validated help entry from fundhelp.js");
  const btn = h("button", { class: "btn small help-btn", id: "help-btn", "aria-label": "Help", text: "?", onclick: () => openHelp(help, btn) });
  return btn;
}

/**
 * Build the stage frame inside root.
 * Returns { play, dad, cue, choose, quitted } where
 *  - play: the area Charles looks at
 *  - cue: container under the card for cue text
 *  - choose(altAgainLabel?, {allowAgain}): Promise<"got"|"again"|"quit"> from Dad's buttons
 *    (allowAgain: false hides "Let's try again", used on victory cards)
 *  - quitted: Promise resolving when Dad taps Home (screens abandon the stage)
 * `caseState` (optional, lettercase.js CaseState): unless it is locked, Dad's bar gets the live case switch.
 * `help` (optional, a fundhelp.js entry): adds a "?" button (#help-btn) at the right end of the top bar that opens the
 * Help overlay. Screens without it are unchanged.
 */
export function stageLayout(root, { title, onQuit, dadHint, reserveCue = false, caseState = null, help = null }) {
  const play = h("div", { class: "play" });
  const cue = h("div", { class: `cue-slot${reserveCue ? " reserve" : ""}` });
  let resolveChoice = null;
  const gotBtn = h("button", { class: "btn dad-btn good", text: "Got it!", disabled: "", onclick: () => answer("got") });
  const againBtn = h("button", { class: "btn dad-btn again", text: "Let's try again", disabled: "", onclick: () => answer("again") });
  const hint = h("div", { class: "dad-hint", text: dadHint || "" });
  const dadButtons = h("div", { class: "dad-buttons" }, gotBtn, againBtn);
  const dad = h("div", { class: "dad-bar" },
    h("div", { class: "dad-label" }, spriteElement("dad", 2), h("span", { text: "DAD" })),
    dadButtons,
    hint,
    caseState && !caseState.locked ? caseSwitchButton(caseState) : null,
    soundToggleButton(),
    h("button", { class: "btn small settings-gear", text: "⚙ Settings", onclick: () => {
      if (!settingsOpener) throw new Error("stageLayout: no settings opener registered (main.js must call setSettingsOpener)");
      settingsOpener(); // flags Home to open Settings; leaving the stage then runs the usual quit path
      resolveQuit("quit"); onQuit?.();
    } }));
  let resolveQuit;
  const quitted = new Promise((r) => (resolveQuit = r));
  const homeBtn = h("button", { class: "btn small dad-only", kid: "Home", onclick: () => { resolveQuit("quit"); onQuit?.(); } });
  const progress = h("div", { class: "stage-progress", hidden: "" });
  // Level line (docs/design.md "Levels"): "Level 2: blends" and "7 of 8 right at level 2", small caps, under the title.
  const levelTitle = h("div", { class: "level-title" });
  const levelSub = h("div", { class: "level-sub" });
  const levelLine = h("div", { class: "level-line", hidden: "" }, levelTitle, levelSub);
  const bar = h("div", { class: "stage-top" }, homeBtn, h("div", { class: "stage-head" }, h("div", { class: "stage-title", kid: title }), levelLine), progress, help ? helpButton(help) : null);
  root.replaceChildren(h("div", { class: "stage" }, bar, h("div", { class: "stage-main" }, play, cue), dad));

  function answer(what) {
    gotBtn.disabled = againBtn.disabled = true;
    const r = resolveChoice;
    resolveChoice = null;
    if (r) r(what);
  }

  return {
    play, cue, dad, hint, quitted,
    /** Enable Dad's buttons and wait for a click (or Home). */
    choose(againLabel = "Let's try again", { allowAgain = true } = {}) {
      againBtn.textContent = againLabel;
      againBtn.classList.toggle("off", !allowAgain); // victory cards offer only "Got it!"
      gotBtn.disabled = againBtn.disabled = false;
      return Promise.race([new Promise((r) => (resolveChoice = r)), quitted]);
    },
    setHint(t) { hint.textContent = t; },
    /**
     * Charles's progress row: `total` block icons, the first `done` filled, the next one highlighted, plus
     * "n / total" in small caps (n = the card he is on). A done card is just filled, whatever its result, and a
     * re-queued card simply makes `total` bigger: nothing here ever shows a miss.
     */
    setProgress(done, total) {
      if (!Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 1 || done > total) {
        throw new Error(`setProgress: bad counts done=${done} total=${total}`);
      }
      const pips = Array.from({ length: total }, (_, i) => h("span", { class: `pip${i < done ? " done" : i === done ? " cur" : ""}` }));
      const count = setKid(h("span", { class: "pip-count" }), `${Math.min(done + 1, total)} / ${total}`);
      progress.replaceChildren(...pips, count);
      progress.hidden = false;
    },
    /** Show the level line: `title` ("Level 2: blends") and `sub` ("7 of 8 right at level 2"). Called again after each attempt. */
    setLevel(title, sub) {
      setKid(levelTitle, title);
      setKid(levelSub, sub);
      levelLine.hidden = false;
    },
    /** Hide Dad's two buttons on stages that do not use them (only the hint remains). */
    disableButtons() { dadButtons.classList.add("off"); },
  };
}

/**
 * Between-stage / end screen with one big button; resolves "next". All text is small caps (Charles's).
 * `dadNote` (optional) adds a Dad bar underneath explaining why Charles is seeing this screen.
 */
export function interlude(root, { title, body, buttonText, sprite, dadNote }) {
  return new Promise((resolve) => {
    const screen = h("div", { class: `interlude${dadNote ? " with-dad" : ""}` },
      sprite ? spriteElement(sprite, 8) : null,
      h("h1", { kid: title }),
      body ? h("p", { kid: body }) : null,
      h("button", { class: "btn big", kid: buttonText, onclick: () => resolve("next") }));
    const dad = dadNote ? h("div", { class: "dad-bar" },
      h("div", { class: "dad-label" }, spriteElement("dad", 2), h("span", { text: "DAD" })),
      h("div", { class: "dad-hint", text: dadNote })) : null;
    root.replaceChildren(screen, ...(dad ? [dad] : []));
  });
}
