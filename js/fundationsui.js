// Dad-facing Fundations controls shared by Settings and the dashboard (plain text: Dad-only areas, never small caps).
import { h } from "./ui.js";
import { store, saveProgress } from "./store.js";
import { UNITS } from "./fundations.js";

/**
 * "Fundations start unit" select (1..14; docs/fundations.md "Progress"): units below it are open in both worlds. Choosing 1
 * (the default) deletes the key, so an untouched file means today's behaviour. `onChange` runs after each save.
 */
export function fundationsStartControl(onChange) {
  const now = store.progress.settings.fundations_start_unit ?? 1;
  const sel = h("select", { id: "fund-start" }, Array.from({ length: UNITS }, (_, i) => h("option", { value: String(i + 1), text: `Unit ${i + 1}${i === 0 ? " (default)" : ""}` })));
  sel.value = String(now);
  sel.addEventListener("change", async () => {
    const n = Number(sel.value); // explicit target, so a re-applied mutation after a 409 is idempotent
    await saveProgress((q) => { if (n === 1) delete q.settings.fundations_start_unit; else q.settings.fundations_start_unit = n; });
    onChange();
  });
  return h("div", { class: "settings-fundations", id: "settings-fundations" }, h("h2", { text: "Fundations (Mob Battle)" }),
    h("p", { text: "Where the Fundations path starts: units below this one are open in both worlds. Other units open by beating the boss before them." }),
    h("div", { class: "settings-row" }, h("label", { for: "fund-start", text: "Start unit: " }), sel));
}

/** The Dad-bar text for an item Charles must hear ("Say: hill"). Dad is the voice (docs/fundations.md "Games"). */
export const sayHint = (text) => `Say: ${text}`;

/**
 * Dad-voice helper for Find it and Sword Forge. Call once per screen with the stage layout; returns `say(text)`, which
 * shows "Say: <text>" in Dad's bar for the current item. When the browser has speechSynthesis a 🔊 button is added to
 * Dad's bar once and speaks the current text; when it does not, no button exists (the game never depends on it).
 */
export function dadSay(L, synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null) {
  let current = "";
  if (synth && typeof SpeechSynthesisUtterance !== "undefined") {
    L.dad.append(h("button", { class: "btn small say-btn", id: "dad-speak", title: "Speak it", text: "\u{1F50A}", onclick: () => {
      synth.cancel();
      synth.speak(new SpeechSynthesisUtterance(current));
    } }));
  }
  return (text) => { current = text; L.setHint(sayHint(text)); };
}
