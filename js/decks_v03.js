// v1.11.1 — consolidated decks v0.3 (Malcom's cut list + DECK_CONSOLIDATION_REVIEW_v0.3.xlsx). Runtime layer over decks_v03_data.js.
// The creator offers only Fighter / Caster / Hybrid; the Style (character card) gives the class card + base stats; every other card in the
// Class's deck is a shared pick pool. Old card IDs are kept. NEW cards get a text-only face (img/cards/<id>.jpg, swap the file for art later).
// A NEW card only gets an engine effect when its text maps onto existing mechanics; the rest are "text only, not yet playable" (they can
// still be put in a deck and played/cast by hand: the site discards / flips them and logs "apply by hand").
(function () {
  const V = window.DECKS_V03, D = window.DECKS, M = window.DECK_META, C = window.CONFIG, FX = window.CARD_FX;
  if (!V) return;
  // styles per Class come from the class cards in the v0.3 decks
  C.styles = {}; Object.entries(V.groups).forEach(([g, o]) => C.styles[g] = [...o.styles]);
  C.styleStats = Object.assign({}, C.styleStats || {}, V.styleStats);
  // engine effects for NEW cards whose text maps 1:1 onto existing mechanics (everything else stays text-only)
  const MAPPED = {
    'SHR-ABL-01': { auto: true, stats: { life: 1, res: 1 } },                                            // Battle-Hardened
    'BRD-SPL-01': { auto: true, spell: { kind: 'check', range: 3, success: [['dmgT', 1], ['target', { atk: -1 }, 'nextAttack', 'Vicious Mockery']] } },
    'BRD-SPL-02': { auto: true, spell: { kind: 'allWithin', range: 2, do: [['target', { atk: 1, tough: 1 }, 'ownerEndNextTurn', 'Song of Courage']] } },
    'BRD-SPL-04': { auto: true, spell: { kind: 'attack', range: 5, dmg: 2, area: 1 }, note: 'Shatter: Burst 1 area save (fail 2, save 1); hits allies.' },
    'BRD-SPL-05': { auto: true, spell: { kind: 'attack', range: 5, dmg: 3, onHit: [['weakenT']] } },  // Dirge of Ruin
    'CLR-SPL-01': { auto: true, spell: { kind: 'smite', do: [['hitDmg', 1], ['target', { atkVsMe: 1, consume: true }, 'ownerEndNextTurn', 'Guiding Smite']] } },
    'CLR-SPL-02': { auto: true, spell: { kind: 'allWithin', range: 3, do: [['healT', 2]] } },          // Mass Healing Word
    'FTR-PWR-01': { when: 'turn', auto: true, do: [['heal', 2], ['self', { atk: 1 }, 'endTurn', 'Adrenaline Surge']] },
    'BAR-PWR-01': { when: 'beforeRoll', auto: true, req: ['melee'], do: [['thisAttack', { atk: 2 }], ['self', { atkVsMe: 1 }, 'ownerNextTurn', 'Reckless Swing']] },
    'BRD-PWR-03': { when: 'turn', auto: true, do: [['pickAlly', 3, [['healT', 1], ['target', { tough: 1 }, 'ownerNextTurn', 'Encouraging Verse']]]] },
    'BRD-PWR-04': { when: 'turn', auto: true, do: [['heroesWithin', 3, [['healT', 1], ['target', { atk: 1 }, 'ownerEndNextTurn', 'Crescendo']]]] },
  };
  for (const c of V.newCards) {
    const card = { ...c, flavor: '', textOnly: !MAPPED[c.id] };
    (D[c.style] = D[c.style] || []).push(card);
    if (MAPPED[c.id]) FX[c.id] = MAPPED[c.id];
    else if (c.type === 'Power-up') FX[c.id] = { when: 'manual', textOnly: true };
    else if (c.type === 'Spell') FX[c.id] = { spell: { kind: 'manual' }, textOnly: true };
    else if (c.type !== 'Class') FX[c.id] = { textOnly: true };
  }
  // v1.12: the three new hero cards have art (Angela / Broheem draft v0.1); their class features (Rage, Inspiration, Blessed Strikes) are still text only
  for (const id of ['BAR-CLS-01', 'BRD-CLS-01', 'CLR-CLS-01']) { const c = Object.values(D).flat().find(x => x.id === id); if (c) Object.assign(c, { hasArt: true, imgFull: `img/cards/full/${id}.jpg`, textOnly: false, classTextOnly: true }); }
  // v1.12: NEW v0.4 grid cards (Malcom's design briefs, no art, no engine effect): text-only faces, playable by hand only
  const P = window.CREATOR_POOLS;
  if (P) for (const c of P.newCards || []) {
    if (Object.values(D).flat().some(x => x.id === c.id)) continue;
    const st = c.style === 'Shared' ? 'Shared' : c.style;
    (D[st] = D[st] || []).push({ id: c.id, type: c.type, name: c.name, level: c.level, style: c.style, text: c.text, flavor: '', img: `img/cards/${c.id}.jpg`, imgFull: `img/cards/full/${c.id}.jpg`, hasArt: false, textOnly: true, v04new: true });
    FX[c.id] = c.type === 'Power-up' ? { when: 'manual', textOnly: true } : c.type === 'Spell' ? { spell: { kind: 'manual' }, textOnly: true } : { textOnly: true };
  }
  // v1.12 (brief v0.4): power-up deck 10 at every level; play (= draw) / in play per round: Fighter 2/3/4 & 3/4/5, Caster + Hybrid 1/2/3 & 2/3/4.
  // Equipment / Abilities / Spells known = picks so far (Caster spells: +2 -1 at L2 and L3). The old table stays as picksLegacy (older test creator only).
  if (P) {
    C.picksLegacy = JSON.parse(JSON.stringify(C.picks));
    for (const t of ['Fighter', 'Caster', 'Hybrid']) {
      let eq = 0, ab = 0, sp = 0;
      for (const L of [1, 2, 3]) { const k = P.picks[t][L], d = P.mustDrop?.[t]?.[L] || {};
        eq += k.equipment - (d.equipment || 0); ab += k.abilities - (d.abilities || 0); sp += k.spells - (d.spells || 0);
        const [play, slots] = P.play[t][L];
        C.picks[t][L] = { equipment: eq, abilities: ab, spells: sp, deck: P.deckSize, slots, draw: play, play };
      }
    }
  }
  // v1.13 note 4: no style designation on non-hero cards. Strip class/style tags from the text shown to players ("(Fighter + Hybrid)",
  // "(Fighter-shared.)", "(martial, Hybrid)" ...); the hero card is the only style-specific card. The card's style/home fields are not displayed.
  const TAG = '(?:Fighter|Caster|Hybrid)(?:[- ]shared)?';
  window.NO_STYLE_TEXT = t => String(t || '').replace(new RegExp(`\\s*\\(${TAG}(?:\\s*\\+\\s*${TAG})*\\.?\\)`, 'g'), '').replace(new RegExp(`,\\s*${TAG}\\)`, 'g'), ')')
    .replace(/\s*Paladin protector upgrade\./, ' Protector upgrade.');
  for (const c of Object.values(D).flat()) if (c && c.type !== 'Class') { if (c.text) c.text = window.NO_STYLE_TEXT(c.text); if (c.stats) c.stats = window.NO_STYLE_TEXT(c.stats); }
  for (const s of Object.values(C.styles).flat()) if (!M[s]) M[s] = { style: s, file: 'DECK_CONSOLIDATION_REVIEW_v0.3.xlsx', version: 'v0.3 (consolidated)', complete: true, playable: true, missingArt: [] };
  window.GROUP_POOL = g => (V.groups[g]?.ids || []);
  window.MERGED_INTO = id => { for (const m of Object.values(V.merges)) if (m[id]) return m[id]; return null; };
})();
