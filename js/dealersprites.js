// Block Dealer sprites (docs/fundations.md "Block Dealer"): the dealer villager (14x24, the shared villager size) and one
// 12x12 picture for each thing he sells. Original pixel art, no Mojang assets. Same shape as SPRITES in sprites.js
// ({ name: { rows: [...] } }, '.' is transparent, all rows of a sprite share one width).
//
// sprites.js merges DEALER_SPRITES into SPRITES and DEALER_PALETTE into PALETTE (one hook at the bottom of that file), so
// every name here resolves through the normal sprite functions. This file imports nothing, so there is no import cycle.
// DEALER_PALETTE only ADDS keys: none collides with PALETTE or with MOB_PALETTE (tests/js/dealersprites.test.mjs checks both).
//
// The obsidian picture is NOT redrawn here: sprites.js already has `obsidian` (the gem block), and the dealer sells it.

export const DEALER_PALETTE = {
  "'": "#7a6a80", // mycelium top, light
  "`": "#5d4f66", // mycelium top, dark
};

/**
 * A 12x12 iron bucket whose contents show at the rim. `a`, `b`, `c` are palette chars for the contents (main, light,
 * dark); the iron is `d` (light) / `z` (mid) / `Z` (dark). Used by the lava, powder snow and axolotl buckets.
 */
function bucket(a, b, c) {
  return [
    "...ZZZZZZ...",
    "..Z......Z..",
    ".ZZZZZZZZZZ.",
    `.Z${a}${b}${a}${a}${c}${a}${b}${a}Z.`,
    `.Z${a}${a}${c}${a}${b}${a}${a}${c}Z.`,
    "..dddddddd..",
    "..dzzzzzzd..",
    "..dzzzzzzd..",
    "..dzzzzzzd..",
    "...dzzzzd...",
    "...dZZZZd...",
    "....ZZZZ....",
  ];
}

export const DEALER_SPRITES = {
  // villager_block_dealer: black top hat with an orange band, dark shades, orange scarf, purple obsidian-coloured coat
  // with gold buttons. Built on the shared villager skeleton (head cols 3-10, folded-arms band, long robe).
  villager_block_dealer: { rows: [
    "....kkkkkk....", "....ffffff....", "..kkkkkkkkkk..", "...iiiiiiii...",
    "...iiiiiiii...", "...iHHHHHHi...", "...ikkkkkki...", "...iiijjiii...",
    "...iiijjiii...", "...iiijjiii...", "...iiinniii...", "...iiiiiiii...",
    "..%%%oooo%%%..", "..%%%oOOo%%%..", "..^^^^^^^^^^..", "..^%%iiii%%^..",
    "..^^^^^^^^^^..", "...%%%yy%%%...", "...%%%%%%%%...", "...%%%yy%%%...",
    "...%%%%%%%%...", "...%%%yy%%%...", "...%%%%%%%%...", "...$$$$$$$$...",
  ] },
  // lava_bucket: iron bucket brimming with glowing orange lava
  lava_bucket: { rows: bucket("o", "f", "y") },
  // powder_snow_bucket: iron bucket of pale snow
  powder_snow_bucket: { rows: bucket("w", "!", "@") },
  // axolotl_bucket: iron bucket of blue water with the pink axolotl showing
  axolotl_bucket: { rows: bucket("q", "p", "P") },
  // crying_obsidian: obsidian with glowing purple-blue veins that run down like tears
  crying_obsidian: { rows: [
    "$$$$$$$$$$$$", "$^$$5$$$$^$$", "$5$$7$$$$5$$", "$7$$$$$^$7$$", "$$$$^$$$$$$$", "$$5$$$$7$$^$",
    "$$7$$^$$$$5$", "^$$$$5$$$$7$", "$$$^$7$^$$$$", "$$$5$$$5$$$$", "$$$7$$$7$$$$", "%%%%%%%%%%%%",
  ] },
  // magma_block: dark crust cut by glowing orange cracks
  magma_block: { rows: [
    "RRRRRRRRRRRR", "RaRRoRRRRaRR", "RRoofoRRoRRR", "RaRRyooRfoRR", "RRRRRRyoRRaR", "RoRRaRRRRRRR",
    "foooRRRaRRoR", "RRaRyoRRoofR", "RRRRRfoofRRR", "RaRRRRRyRRaR", "RRRoRaRRRRRR", "aaaaaaaaaaaa",
  ] },
  // slime_block: bright translucent green with a darker cube inside
  slime_block: { rows: [
    "lllllllllllL", "lUUUUUUUUUUL", "lUuuuuuuuuUL", "lUuLLLLLLuUL", "lUuLllllLuUL", "lUuLlwllLuUL",
    "lUuLllllLuUL", "lUuLLLLLLuUL", "lUuuuuuuuuUL", "lUUUUUUUUUUL", "lLLLLLLLLLLL", "LLLLLLLLLLLL",
  ] },
  // honey_block: golden amber with a lighter glint and a darker core
  honey_block: { rows: [
    "ffffffffffff", "fYYYYYYYYYYf", "fYyyyyyyyyYf", "fYyIIyyyyyYf", "fYyIyYYYYyYf", "fYyyyYffYyYf",
    "fYyyyYffYyYf", "fYyyyYYYYyYf", "fYyyyyyyyyYf", "fYYYYYYYYYYf", "ffffffffffff", "YYYYYYYYYYYY",
  ] },
  // sponge: yellow with dark pores
  sponge: { rows: [
    "yyyyyyyyyyyy", "yYYyyyyYyyyy", "yYyyyYyyyYYy", "yyyyYYyyyYyy", "yYyyyyyyyyyy", "yyyYyyYYyyYy",
    "yyYYyyYyyyYy", "yyyyyyyyYyyy", "yYYyyYyyYYyy", "yyYyyYYyyyyy", "yyyyyyyyyyYy", "YYYYYYYYYYYY",
  ] },
  // end_stone: pale yellow stone with darker pits and light flecks
  end_stone: { rows: [
    "AAAAAAAAAAAA", "AVAAAIAAAVAA", "AAAAVAAAAAAA", "AIAAAAAVAAIA", "AAVAAAAAAAAA", "AAAAIAAVAAAA",
    "AVAAAAAAAIAA", "AAAIAVAAAAAA", "AAAAAAAAVAIA", "AIAVAAAAAAAA", "AAAAAAIAAVAA", "VVVVVVVVVVVV",
  ] },
  // sculk: very dark blue with glowing cyan veins and dots
  sculk: { rows: [
    "vvvvvvvvvvvv", "v$vvcvvvv$vv", "vvvv0vv$vvcv", "v$vvvvvvvvvv", "vvcvv$vvcvvv", "vvvvvvvvC0vv",
    "v$vvcvvvvvvv", "vvvv0$vvv$vv", "vcvvvvvvvvcv", "vvvv$vvc0vvv", "v$vvvvvvvvvv", "$$$$$$$$$$$$",
  ] },
  // mycelium: grey-purple spore top over dirt
  mycelium: { rows: [
    "'''`''''`'''", "`''''`'''''`", "'''''''`''''", "`'`''''''`''", "nnnnnnnnnnnn", "nNnnnnnnNnnn",
    "nnnnNnnnnnnn", "nnnnnnnNnnNn", "nNnnnnnnnnnn", "nnnnnNnnnnnn", "nnNnnnnnnnnn", "NNNNNNNNNNNN",
  ] },
  // tinted_glass: dark purple-grey pane with a pale diagonal sheen
  tinted_glass: { rows: [
    "%%%%%%%%%%%%", "%MMMMMMMMMg%", "%MMMMMMMMgM%", "%MMMMMMMgMM%", "%MMMMMMgMMM%", "%MMMMMgMMMM%",
    "%MMMMgMMMMM%", "%MMMgMMMMMM%", "%MMgMMMMMMM%", "%MgMMMMMMMM%", "%MMMMMMMMMM%", "%%%%%%%%%%%%",
  ] },
  // bedrock: dark grey noise, nothing like ordinary stone
  bedrock: { rows: [
    "GZGaGGZGaGZG", "ZGGZkGGaZGGk", "GaGGZGZGGZaG", "kGZGGaGGkGGZ", "GGaZGGZaGZGG", "ZGGkGZGGGaGZ",
    "GZaGGkGZGGaG", "GGGZaGGaZkGG", "aZGGGZGGGGZa", "GGkGaGZkGaGG", "ZGGZGGaGZGGk", "kkkkkkkkkkkk",
  ] },
  // dragon_egg: black egg flecked with purple, a lighter glint on its shoulder
  dragon_egg: { rows: [
    "....kkkk....", "...k$$$$k...", "..k$$^$$$k..", "..k$$$5$$k..", ".k$5$$$$$$k.", ".k$$$$%$^$k.",
    ".k$^$$$$$5$k", ".k$$$5$$$$$k", ".k$$$$$^$$$k", "..k$%$$$5$k.", "...k$$$$$k..", "....kkkkk...",
  ] },
};

/** Names of every sprite this file adds, in sale order (the shop shows them in the order the config lists them). */
export const DEALER_SPRITE_NAMES = Object.keys(DEALER_SPRITES);
