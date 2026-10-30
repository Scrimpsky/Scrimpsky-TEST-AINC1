// =====================================================================
// v1.10.2 CARD PATCH: Wizard L2/L3 spells (USER DECISION 2026-10-21, "approved as written"; rules/LOCKED.md,
// adventure/wizard_L2L3_spells_final_for_john.md). Card text below is copied verbatim from Angela's
// cards/wizard_deck.xlsx DRAFT v0.1.7 (rules text, flavor, stats, school; v0.1.7 = hex-map area wording).
// Why a patch and not tools/build_data.py: that script also rebuilds the NPC data from the newest npc_deck.xlsx / Core Stats,
// which would pull in Malcom's NOT-yet-approved v0.5 NPC stats. Only the Wizard spell data changes here; NPCs stay at v1.9.
// How each spell WORKS is in js/effects.js (CARD_FX).
//   * 4 upgrades REPLACE their cards (same ID): WIZ-SPL-14 Fireball II, -15 Frost Nova II, -18 Chain Lightning II, -20 Disintegrate II.
//     Images: Angela's re-renders (cards/out/wizard/, copied to img/cards/<ID>.jpg + img/cards/full/<ID>.jpg by tools/wizard_v1102_cards.py).
//   * 3 NEW cards: WIZ-SPL-21 Lightning Bolt (L2), -22 Fire Bolt II (L2), -23 Ice Storm (L3), with Angela's renders too.
//     tools/wizard_v1102_cards.py copies all 7 PNGs from cards/out/wizard/ to img/cards/<ID>.jpg + img/cards/full/<ID>.jpg.
//     A card listed in ART_PENDING (none now) would get a TEXT card instead; re-run the script after a re-render and bump
//     CONFIG.assetVersion + index.html ?v= so browsers reload the images.
//   * Pools: Wizard spells 20 -> 23 (L1 13, L2 6, L3 4); builder pools per level 13 / 19 / 23. Picks stay 2/3/4.
//   * STILL OPEN (user), left exactly as in v1.10.1: the Fire Scroll (WIZ-EQP-09) and Lightning Scroll (WIZ-EQP-10) cast the
//     OLD Fireball / Chain Lightning. Those two old spells stay available ONLY to the scrolls as WIZ-SPL-14L / WIZ-SPL-18L
//     (type 'Scroll spell', never offered in the builder; old art kept in img/cards/legacy/). The power-up pool stays 12.
// =====================================================================
window.WIZ_V1102_ART_PENDING = [];   // v1.10.2: Angela rendered all 7 (cards/out/wizard/, 2026-10-21); empty = every card uses real art
window.WIZ_V1102_CARDS = [
  { id: 'WIZ-SPL-14', type: 'Spell', name: 'Fireball II', level: 2, school: 'Fire', flavor: 'Duck.', stats: 'Range 7; Burst 1; 2 Damage (save 1)',
    text: 'Choose a space within Range 7. The area is that space and the 6 around it (Burst 1, 7 spaces). Each creature in the area other than you rolls 1d6 + Resilience vs 3 + your Skill. Fail: 2 Damage. Save: 1 Damage. Hits allies in the area too.' },
  { id: 'WIZ-SPL-15', type: 'Spell', name: 'Frost Nova II', level: 2, school: 'Frost', flavor: 'The air around you shatters into ice.', stats: 'Adjacent enemies: 2 Damage, -1 Attack (save 1)',
    text: 'Each enemy adjacent to you (the 6 spaces around you) rolls 1d6 + Resilience vs 3 + your Skill. Fail: 2 Damage and -1 Attack until the end of its next turn. Save: 1 Damage, no -1 Attack. Then you may move 1 space.' },
  { id: 'WIZ-SPL-18', type: 'Spell', name: 'Chain Lightning II', level: 3, school: 'Lightning', flavor: 'It jumps. And jumps. And jumps.', stats: 'Range 8; up to 3 enemies; 2 Damage (save 1)',
    text: 'Choose an enemy within Range 8, then up to 2 more different enemies, each within 2 spaces of the last one. Each of them rolls 1d6 + Resilience vs 3 + your Skill. Fail: 2 Damage. Save: 1 Damage.' },
  { id: 'WIZ-SPL-20', type: 'Spell', name: 'Disintegrate II', level: 3, school: 'Arcane', flavor: 'There was an enemy there a moment ago.', stats: 'Range 8; +1 Attack; 3 Damage',
    text: 'Spell Attack, Range 8, at +1 Attack. Hit: 3 Damage.' },
  { id: 'WIZ-SPL-21', type: 'Spell', name: 'Lightning Bolt', level: 2, school: 'Lightning', flavor: 'Lightning cuts a straight road through the dark.', stats: 'Line 7; 2 Damage (save 1)',
    text: 'The area is a straight line of 7 spaces from you (Line 7). Each creature in the area other than you rolls 1d6 + Resilience vs 3 + your Skill. Fail: 2 Damage. Save: 1 Damage. Hits allies in the line.' },
  { id: 'WIZ-SPL-22', type: 'Spell', name: 'Fire Bolt II', level: 2, school: 'Fire', flavor: 'Same flame, a longer arm, a steadier aim.', stats: 'Range 7; 2 Damage',
    text: 'Spell Attack, Range 7. Hit: 2 Damage.' },
  { id: 'WIZ-SPL-23', type: 'Spell', name: 'Ice Storm', level: 3, school: 'Frost', flavor: 'The sky falls in pieces, and every piece is cold.', stats: 'Range 8; Burst 2; 2 Damage, -1 Attack (save 1)',
    text: 'Choose a space within Range 8. The area is every space within 2 of it (Burst 2, 19 spaces). Each creature in the area other than you rolls 1d6 + Resilience vs 3 + your Skill. Fail: 2 Damage and -1 Attack until the end of its next turn. Save: 1 Damage, no -1 Attack. Hits allies. Once per fight.' },
];
(() => {
  const D = window.DECKS && window.DECKS.Wizard; if (!D) return;
  const pending = new Set(window.WIZ_V1102_ART_PENDING);
  const legacy = [];
  for (const p of window.WIZ_V1102_CARDS) {
    const art = { img: `img/cards/${p.id}.jpg`, hasArt: !pending.has(p.id), ...(pending.has(p.id) ? {} : { imgFull: `img/cards/full/${p.id}.jpg` }) };
    const c = D.find(x => x.id === p.id);
    if (c) {   // upgrade: same ID
      if (p.id === 'WIZ-SPL-14' || p.id === 'WIZ-SPL-18') legacy.push({ ...c, id: p.id + 'L', type: 'Scroll spell', scrollOnly: true, img: `img/cards/legacy/${p.id}L.jpg`, imgFull: `img/cards/legacy/${p.id}L-full.jpg` });
      Object.assign(c, p, art, { upgradeOf: c.name, v1102: true });
    } else D.splice(D.findIndex(x => x.id === 'WIZ-SPL-20') + 1 + D.filter(x => x.v1102 && !x.upgradeOf).length, 0, { ...p, ...art, v1102: true });
  }
  D.push(...legacy);
  const M = window.DECK_META && window.DECK_META.Wizard;
  if (M) { M.version = 'DRAFT v0.1.7 - pending user review (Wizard L2/L3 spells LOCKED 2026-10-21)'; M.missingArt = [...new Set([...(M.missingArt || []), ...pending])]; M.complete = !M.missingArt.length; M.playable = true; }
})();

// ---- v1.11.0 data patches (no build_data.py run: NPC stats stay at v1.9) ----
// Warrior deck v0.3.3: Battle Axe is a flat +1 Damage on every hit (user ruling 2026-10-27)
(() => {
  const c = window.DECKS && window.DECKS.Warrior && window.DECKS.Warrior.find(x => x.id === 'WAR-EQP-02');
  if (c) Object.assign(c, { text: 'Weapon, two-handed. Melee. When an attack with this weapon hits, deal +1 Damage.', stats: '+1 Damage on every hit' });
  const M = window.DECK_META && window.DECK_META.Warrior; if (M) M.version = 'DRAFT v0.3.3';
})();
// NPC sizes (shared/adventures-inc/npc_sizes.csv = Angela's NPC sheet v0.5.3 Size column). Sizes only, no stat changes.
window.NPC_SIZES = {
  'NPC-01': 'Small', 'NPC-02': 'Medium', 'NPC-03': 'Small', 'NPC-04': 'Small', 'NPC-05': 'Medium', 'NPC-06': 'Medium', 'NPC-07': 'Medium', 'NPC-08': 'Medium', 'NPC-09': 'Small', 'NPC-10': 'Large', 'NPC-11': 'Small', 'NPC-12': 'Medium', 'NPC-13': 'Medium', 'NPC-14': 'Large', 'NPC-15': 'Medium', 'NPC-16': 'Medium', 'NPC-17': 'Large', 'NPC-18': 'Large', 'NPC-19': 'Medium', 'NPC-20': 'Medium', 'NPC-21': 'Medium', 'NPC-22': 'Giant', 'NPC-23': 'Giant', 'NPC-24': 'Medium', 'NPC-25': 'Medium', 'NPC-26': 'Medium', 'NPC-27': 'Large', 'NPC-28': 'Large', 'NPC-29': 'Giant', 'NPC-30': 'Giant', 'NPC-31': 'Large'
};
(() => { const S = window.NPC_SIZES; (window.NPC_CARDS || []).forEach(c => { if (S[c.id]) c.size = S[c.id]; }); })();
// ---- v1.13.0: Hand Axe is a thrown ranged weapon (user note 5, 2026-10-29). Wording from the user via the parent. ----
// Its art (img/cards/RNG-EQP-03.jpg) still prints the old melee/Range 3 text: Angela needs to re-render it.
(() => {
  const c = window.DECKS && window.DECKS.Ranger && window.DECKS.Ranger.find(x => x.id === 'RNG-EQP-03');
  if (c) Object.assign(c, { text: 'Weapon, one-handed. Ranged, Range 5. You carry a bundle of axes; thrown axes never need to be picked up.', stats: 'Ranged, Range 5', v113: true });
})();
