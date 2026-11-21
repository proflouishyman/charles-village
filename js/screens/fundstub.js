// Placeholder for a Fundations game screen that has not been built yet (the quest hub launches it with {unit, world}).
// Each stub screen (battle.js, ambush.js, forge.js, boss.js) calls this and is replaced wholesale by the real game.
import { h } from "../ui.js";
import { gameParams } from "../fundgame.js";

/**
 * Show "coming soon" for `title` and wait for Back. Checks the launch params like a real game would, so the
 * hub-to-game contract is exercised even by the stubs. Resolves "quit" (the hub then redraws itself).
 */
export function comingSoon(app, game, title, opts) {
  const { unit, world } = gameParams(app, opts);
  return new Promise((resolve) => {
    app.root.replaceChildren(h("div", { class: "interlude stub", "data-stub": game, "data-unit": String(unit), "data-world": world },
      h("h1", { kid: title }),
      h("p", { kid: "Coming soon" }),
      h("button", { class: "btn big", id: "stub-back", kid: "Back", onclick: () => resolve("quit") })));
  });
}
