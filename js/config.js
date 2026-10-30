// =====================================================================
// Adventures Inc — game numbers. EVERY tunable number lives here.
// Source: rules/website_numbers.md (Malcom, 2026-10-17) + rules/LOCKED.md.
// Items marked OPEN are placeholders the user has not decided yet.
// =====================================================================
window.CONFIG = {
  version: 'v1.13.0 (local prototype)',
  assetVersion: '1.13.0', // cache-busting for card images (bump when Angela re-renders)

  // Base stats per Type (LOCKED 2026-10-16).
  baseStats: {
    Fighter: { life: 5, speed: 3, tough: 4, atk: 1, res: 1, skill: 1 },
    Caster:  { life: 3, speed: 2, tough: 2, atk: 1, res: 1, skill: 1 },
    Hybrid:  { life: 4, speed: 3, tough: 3, atk: 1, res: 1, skill: 1 },
  },

  // Styles per Type. A Style is playable when tools/build_data.py finds its deck sheet AND its Type is in
  // playableTypes. Cards without rendered art yet show as text-only cards built from the sheet
  // (re-run tools/build_data.py and the real art replaces them). forceComingSoon hides a deck if needed.
  styles: {
    Fighter: ['Warrior', 'Assassin', 'Archer'],
    Caster:  ['Wizard', 'Druid'],
    Hybrid:  ['Paladin', 'Ranger'],
  },
  playableTypes: ['Fighter', 'Caster', 'Hybrid'],   // v1.5: casters + hybrids playable (spell row added)
  forceComingSoon: [],

  // Picks per Type + Level (cumulative totals). From website_numbers.md.
  // deck = power-up draw deck size; slots = max hand; draw/play = per turn.
  powerupCopies: { 1: 2, 2: 3, 3: 4 },   // v1.11 user rule (2026-10-27): the same power-up card may be picked up to 2 / 3 / 4 times at Level 1 / 2 / 3
  picks: {
    Fighter: {
      1: { equipment: 2, abilities: 2, spells: 0, deck: 10, slots: 3, draw: 1, play: 1 },
      2: { equipment: 3, abilities: 3, spells: 0, deck: 15, slots: 4, draw: 2, play: 2 },
      3: { equipment: 4, abilities: 4, spells: 0, deck: 20, slots: 5, draw: 3, play: 3 }, // Warrior L3: deck has exactly 20 power-ups, so no choice (OPEN)
    },
    Caster: { // website_numbers.md: power-up deck 6/9/12 is OPEN (pool of 12: no choice at L3)
      1: { equipment: 1, abilities: 1, spells: 2, deck: 6, slots: 2, draw: 1, play: 1 },
      2: { equipment: 2, abilities: 2, spells: 3, deck: 9, slots: 3, draw: 2, play: 2 },
      3: { equipment: 3, abilities: 3, spells: 4, deck: 12, slots: 4, draw: 3, play: 3 },
    },
    Hybrid: { // website_numbers.md: power-up deck 8/12/16 is OPEN (pool of 18)
      1: { equipment: 2, abilities: 2, spells: 1, deck: 8, slots: 2, draw: 1, play: 1 },
      2: { equipment: 3, abilities: 3, spells: 2, deck: 12, slots: 3, draw: 2, play: 2 },
      3: { equipment: 4, abilities: 4, spells: 3, deck: 16, slots: 4, draw: 3, play: 3 },
    },
  },

  // First turn: draw until every slot is full (website_numbers.md).
  firstDrawFillsSlots: true,

  // OPEN: reshuffle the power-up discard when the deck runs out? Placeholder: no reshuffle during a battle.
  reshuffleDiscard: false,

  // OPEN (assumed, pending user): reaction power-ups ("Play when...") count toward plays per round.
  reactionsCountTowardPlays: true,

  // Initiative (LOCKED 2026-10-17): every PC and NPC rolls 1d6 + Speed, highest first, order holds every round.
  initiative: {
    die: 6,
    addSpeed: true,
    // Tie-break is a PLACEHOLDER (not user-decided): higher Speed first, then PCs before NPCs, then random.
    tieBreak: ['speed', 'pcFirst', 'random'],
  },

  // Combat (LOCKED): 1d6 + Attack, hit if >= Toughness. A hit deals 1 Damage (+ bonuses).
  // USER-APPROVED (2026-10-18): a Critical hit does +1 extra Damage, for heroes AND NPCs (e.g. a Goblin's 1 Damage becomes 2).
  // It stacks with card bonuses that also trigger on a Critical (hero: Steady Aim, Barbed Arrows, Twin Daggers, Deep Cut, Potent Spells;
  // NPC: Brutal - see npc.brutalStacksWithCrit). Not added to fixed-Damage or no-Damage attacks (Assassinate, Brew Flask, Wing Buffet).
  combat: { die: 6, baseDamage: 1, critBonusDamage: 1, critBonusUserApproved: true },

  // LOCKED: at Level 1, Equipment + Abilities together add at most +2 to any one stat. Not decided for L2/L3 (OPEN: no cap enforced).
  statCap: { 1: 2, 2: null, 3: null },

  // USER RULE (2026-10-18) Dying, heroes only: at 0 Life a hero is Down, not dead. Any heal brings a Down hero back up
  // to that amount. The party has 3 rounds to heal them (counted at the Down hero's own turn: 3, 2, 1, then dead), and 3 enemy hits
  // on a Down hero kill it. Dead heroes leave the map. NPCs at 0 Life are defeated as before. Defeat = every hero dead or Down.
  downedRule: 'dying',
  dying: { roundsToHeal: 3, hitsToDie: 3, userApproved: true,
    autoDmTargetsDown: 'lastResort',   // OPEN: Auto DM prefers standing heroes; attacks a Down hero only when no standing hero is reachable
    downBlocksSpace: false,             // OPEN (site): a Down hero's token doesn't block movement
    critCountsAsHits: 1 },              // OPEN: a Critical on a Down hero counts as 1 hit (not 2)

  // EP budget = PCs x (Level + 2). USER DECISION 2026-10-21 (v1.10), replacing the earlier LOCKED PCs x (Level + 1).
  // The random encounter builder and the DM setup meter both read this.
  epBudget: (pcs, level) => pcs * (level + 2),
  epBudgetLevelAdd: 2,

  // ---- Map grid (Malcom, OPEN): range is counted in map spaces ----
  // The battle maps carry a pointy-top hex grid drawn by maps/hexgrid.py: hex radius 40px on a 1920x1080 image,
  // first hex centered at (0,0), odd rows shifted half a hex right. Tokens snap to those hexes.
  // On a hex grid every neighbour (including the "diagonal" ones) is 1 space: Range N = within N hexes,
  // Engaged = adjacent, Speed = hexes moved per turn.
  grid: { imgW: 1920, imgH: 1080, hexRadius: 40 },
  // Per-map grid size (source: shared/adventures-inc/Adventure_Inc_Maps.xlsx). hexRadius in px on the 1920x1080 art; maps not listed use grid.hexRadius.
  // v1.11.1: every map is back on the original grid (radius 40 = the grid printed on the art, 28 x 17). Per-map override kept for retuning
  // from the user's answers in Adventure_Inc_Maps.xlsx, e.g. 'MAP-CITY-04': { hexRadius: 30 }.
  mapGrids: {},
  // v1.11.1 (user rule, note 6): Power-up timings are read from each card's text (app.js puTiming); list a card here only to override the reading.
  puTiming: { 'BRD-PWR-02': 'anytime' },   // Inspire Valor: another hero attacks; doesn't use your action

  enforceMoveAndRange: true,          // the "Free move" toggle on the table turns this off (override)
  moveAwayFromAdjacent: 'free',       // OPEN placeholder (Malcom): moving away from an adjacent enemy is a free move
  moveThroughAllies: true,            // placeholder: you can pass through allies, never end on an occupied space
  closeQuarters: -1,                  // OPEN: -1 Attack on a Close Quarters ranged weapon while Engaged (vs 2d6-take-lower)

  // ---- Keywords (rulebook section 12). OPEN placeholders ----
  offGuard: 'everyRound',             // OPEN: enemy that hasn't acted yet this round (vs first round only)
  hiddenNoTargetSkipsAttack: true,    // OPEN: if every hero an enemy could attack is Hidden, it makes no attack (no search roll)
  attackPowerups: {
    // OPEN (rulebook Q18): cards that say "replaces your normal attack" replace it (Assassin/Archer text).
    // The Warrior's Shield Bash, Charge, Sweeping Strike and Hurl Weapon follow the same placeholder when true.
    warriorReplace: true,
  },
  thrownPickup: 'auto-adjacent',      // a thrown weapon is picked up when you move into or next to its space

  // v1.8: every Basic map from maps/maps_catalog.csv is loaded from js/maps.js (tools/build_maps.py), grouped by environment.
  // These 3 are the fallback if js/maps.js is missing (they are the same pictures as MAP-CAVE-03 / MAP-CAVE-01 / MAP-RIVR-01).
  maps: [
    { id: 'goblin-lair', name: 'Goblin Lair', img: 'img/maps/goblin-lair.jpg' },
    { id: 'mushroom-cavern', name: 'Mushroom Cavern', img: 'img/maps/mushroom-cavern.jpg' },
    { id: 'forest-river', name: 'Forest River Crossing', img: 'img/maps/forest-river.jpg' },
  ],

  // v1.8 Legendary Actions (Malcom, npc_levels §2 / rulebook §15, OPEN): shared NPC pool per round (1 with 1-2 heroes, 2 with 3+),
  // refreshed at the start of the first Legendary NPC's turn each round, starts full; used at the end of a hero's turn;
  // at most 1 damaging Legendary Action per round from the shared pool. Legendary N (Ash Demon) = its own pool.
  legendary: { smallParty: 1, bigParty: 2, bigPartyMin: 3, maxDamagingPerRound: 1, startFull: true },
  // v1.8 EP pricing (Malcom, OPEN): a lower-level NPC costs +1 EP per level below the party. Budget formula stays LOCKED.
  npcPricing: { levelGapEp: 1, soloBuysLowerOnly: true, encounterLevelRule: true, overLevelAllowed: true },
  // Monster groups for auto-built encounters ('level' = any creature up to the party's level, priced).
  encounterPools: {
    'Goblins (Goblin, Hob-Goblin, Goblin Mage)': ['Goblin', 'Hob-Goblin', 'Goblin Mage'],
    'Basic Goblins only': ['Goblin'],
    'Any Level 1 creature': 1,           // a number = only NPCs of that Level
    'Any Level 2 creature': 2,
    'Any Level 3 creature': 3,
    'Any creature up to the party level (priced)': 'level',
  },

  // ---- DM setup: creature tokens (keyed by the sheet name; unknown creatures get initials + a generated colour) ----
  creatureTokens: {
    'Goblin': { tag: 'GB', color: '#5f7d2a' }, 'Hob-Goblin': { tag: 'HG', color: '#8a4b1c' }, 'Goblin Mage': { tag: 'GM', color: '#5a3d8a' },
    'Woodlan Creature': { tag: 'WC', color: '#2f6b4a' }, 'Beast': { tag: 'BE', color: '#7a5a2e' }, 'Bandit': { tag: 'BA', color: '#4a4a52' },
    'Soldier/Mecernary': { tag: 'SM', color: '#6b2a2a' }, 'Mage': { tag: 'MG', color: '#2e4f8a' }, 'Elemental Spirit': { tag: 'ES', color: '#1f7f8a' },
    'Troll': { tag: 'TR', color: '#4e6b3a' }, 'Birds of Prey': { tag: 'BP', color: '#8a6d1f' },
    // v1.8 Level 2 / 3
    'Goblin Warchief': { tag: 'GW', color: '#3f5a1a' }, 'Bandit Captain': { tag: 'BC', color: '#2f2f3a' }, 'Dire Wolf': { tag: 'DW', color: '#5b5b5b' },
    'Thornwood Stalker': { tag: 'TS', color: '#3b5e2b' }, 'Battle Mage': { tag: 'BM', color: '#29468a' }, 'Greater Elemental': { tag: 'GE', color: '#16707a' },
    'Troll Brute': { tag: 'TB', color: '#3e5a2c' }, 'Swamp Witch': { tag: 'SW', color: '#4b6b2e' }, 'Dragon Wyrmling': { tag: 'DY', color: '#9a3418' },
    'Dark Knight': { tag: 'DK', color: '#26262e' }, 'Young Dragon': { tag: 'YD', color: '#b02a12' }, 'Stone Giant': { tag: 'SG', color: '#6d6a60' },
    'Lich': { tag: 'LI', color: '#4a2f6b' }, 'Archmage': { tag: 'AM', color: '#22408f' }, 'Crime Boss': { tag: 'CB', color: '#3a2a2a' },
    'Ash Demon': { tag: 'AD', color: '#7a1f12' }, 'Troll Chieftain': { tag: 'TC', color: '#35502a' }, 'Roc': { tag: 'RC', color: '#8a6a2a' },
    'Elder Treant': { tag: 'ET', color: '#2e5a28' }, 'Storm Lord': { tag: 'SL', color: '#2b5f9a' },
  },
  // Where the DM's creatures start on the map (hex columns/rows); the DM can drag them anywhere before Start Battle.
  monsterAreas: {
    east: { name: 'East side (facing the heroes)', cols: [16, 19], rows: [3, 14] },
    north: { name: 'North edge', cols: [6, 20], rows: [1, 2] },
    south: { name: 'South edge', cols: [6, 20], rows: [15, 16] },
    around: { name: 'Surround the heroes', ring: 4 },
  },
  // ---- NPC cards (David's NPC deck v0.1.2; Malcom's working rulings are all OPEN until the user locks them) ----
  npc: {
    critOn: 6,                      // Critical = d6 shows 6 and the attack hits (rulebook §12)
    spellCloseQuarters: -1,         // printed on the caster cards: -1 Attack on a Spell Attack while Engaged
    lineOfSight: false,             // OPEN: no walls/line of sight on the site; Range is just hex distance
    regenerateAfterPoison: true,    // OPEN (Mattrim Q2): poison ticks first, then Regenerate if still at 1+ Life
    blinkKeepsTurn: true,           // OPEN: after Blink the Mage still moves (full Speed) and attacks normally
    blinkOnlyIfEngaged: true,       // card text: "if it is Engaged"
    fliesIgnoresHoldLine: false,    // OPEN: Flies passes through creatures but Warrior Hold the Line still stops it
    autoTarget: 'reachNearestLowLifeLowTough', // Malcom placeholder: nearest hero it can reach this turn; ties lowest Life, then lowest Toughness, then random
    casterKeepDistance: true,       // OPEN (Auto DM): casters end their move in range but not adjacent (avoids Close Quarters), as far from heroes as they can
    rangedCloseQuarters: -1,        // NPC weapon ranged attack (bow, sling, thrown) while Engaged: Close Quarters -1 (David v0.1.3)
    // NPC thrown weapons need no pickup (David v0.1.3).
    meleeOnlyReactions: ['Dodge', 'Riposte', 'Tumble'],
    brutalStacksWithCrit: true,     // OPEN (v1.8 overlap): Brutal "+1 Damage on a Critical" stacks with the user's general Critical +1 -> Hob-Goblin/Dark Knight Critical = base + 2
    // USER RULE (2026-10-18): NPCs Dash too. When no hero is in range of any of its attacks (after moving), an NPC Dashes
    // (moves up to 2 x Speed) instead of attacking. Auto DM does it; Human DM has a Dash button.
    dash: { enabled: true, multiplier: 2, userApproved: true },
    skirmisherNoStepTwice: true,    // Malcom v0.2 (OPEN): a Skirmisher can't step away from an adjacent hero two turns in a row
    areaHitsDown: false,            // OPEN: area attacks (breath, Fireball...) skip Down heroes
    unbreakableAuto: true,          // OPEN: Unbreakable is used automatically on the first qualifying hit (Auto and Human DM) // these hero cards say "melee": they don't work against Spell Attacks
  },
  // OPEN: Resilience and Skill do nothing for NPCs yet (rulebook Q1/Q23). Forest-born has no terrain to use.
  // ---- NPC heroes ("🤖 NPC" in the lobby): the computer plays the hero's turn. OPEN: simple placeholder tactics ----
  heroAI: {
    // delayMs: unset = follow the table's action speed (CONFIG.pace)
    // Targets: a monster it can kill this attack first, then lowest Life, then Off Guard, then nearest.
    // Melee heroes move next to the target; ranged heroes (any ranged weapon) stay in range but not Engaged (no Close Quarters).
    // Power-ups: attack/buff cards when a target is in reach, heals only when hurt (2+ Life missing), Speed cards only when nothing is reachable,
    // reactions (Dodge, Evasion, Smoke Bomb, ...) are always played when offered, "d6 counts as 6" only on a miss, choices pick the weakest/nearest enemy.
  },
  // ---- Spells, casters and hybrids (rulebook §12-13, website_numbers.md). Everything here is OPEN unless noted ----
  spells: {
    // Face up / face down (user-confirmed): cast -> face down; all face-down spells flip up at the start of your next turn.
    // "Once per fight" spells (text says so) stay face down for the rest of the fight.
    castIsYourAction: true,      // OPEN: casting a spell uses your one action (instead of your normal attack)
    oneSpellPerTurn: true,       // OPEN: one spell per turn (Mana Potion / Mana Surge / Spellblade allow one more)
    spellCheckBase: 3,           // OPEN: Spell Check = 1d6 + Skill (+ Spell Check bonuses), success if >= 3 + target Resilience
    // v1.13 note 8 (user 2026-10-29): cantrips removed completely (no Ranged/Touch Attack, no replacement); Casters have no
    // basic attack and use their spells. Hybrids keep the Fighter Basic Attack.
    spellCloseQuarters: -1,      // OPEN: a ranged Spell Attack while Engaged gets Close Quarters -1 (same as NPC Spell Attacks)
    smitesPerHit: 1,             // OPEN: one Smite or Strike per hit; free (no action), flips face down
    reactionSpellsFlip: true,    // "Reaction:" spells don't use your action but still flip face down
    areaCenter: 'creature',      // OPEN (site simplification): "choose a space" spells are centred on a chosen creature's space
    wallOfThorns: 'row',         // OPEN: Wall of Thorns = a straight row of up to 5 spaces next to the chosen enemy (diagonal lines OPEN)
    terrainHurtsHeroes: false,   // OPEN (rulebook Q31): Overgrowth / Thorns slow and hurt enemies only
    reactionMoveAuto: 'npcOnly', // USER (v1.9): a human player picks the reaction-move space (Misty Step, Zephyr Step, Blink Reflex...) from highlighted hexes; computer-played heroes still auto-place
    companionAttacksInsteadOfYou: true, // Druid Wolf attacks instead of the Druid's attack (card text); the Hawk never attacks
    companionsTargetable: true,  // OPEN (rulebook Q29): the Auto DM can attack companions like heroes
    challengedAtkPenalty: -2,    // Paladin Challenge: its attacks vs other heroes get -2 Attack; Auto DM must go for the Paladin
    auraRadius: { 'Aura 1': 1, 'Aura 2': 2 },
  },
  // ---- v1.9 USER-APPROVED (2026-10-18 playtest notes) ----
  // Hero stat growth: +1 Life, +1 Attack, +1 Skill for every level above 1 (all 7 heroes). Warrior L1 5/1/1 -> L3 7/3/3.
  levelGrowth: { life: 1, atk: 1, skill: 1, userApproved: true },
  // v1.10 USER RULE: every Level 1 NPC gets a flat +1 to its attack rolls when the encounter's party level
  // (the highest hero level at the table) is 2 or 3. Flat +1, NOT +1 per level. Shown on the stat block and logged as "+1 (scaled)".
  npcScaling: { npcLevel: 1, partyLevels: [2, 3], atkBonus: 1, label: 'scaled', userRule: true, userDecision: '2026-10-21' },
  // v1.10 USER RULE (range): every ranged weapon attack and every spell attack has Range 5 by default, heroes and NPCs alike.
  // The Longbow (ARC-EQP-01) gives +5 Range: exactly 10 in total, and it must stay the longest range in the game (user, 2026-10-21):
  // range boosts never take the Longbow past 10, and nothing else (weapon, spell, power-up, NPC attack) may reach 10 (capped at 9).
  // Not changed: melee/touch/reach, burst radii, heal/buff/Spell Check spell ranges, Magic Missile (no roll), teleports.
  // v1.10 point of view (local to each device; USER DECISION 2026-10-21 on what a hero sees). Documentation for the engine split:
  // the app's viewer()/publicBadges() follow it. Hot-seat default = follow the turn; Settings/👁 selector can pin the DM or a hero.
  view: { default: 'follow', heroSees: ['monster Life numbers', "other heroes' Life", 'public conditions (Poisoned, Off Guard, Engaged, Hidden, Marked, Speed 0, Stunned, Bloodied)', 'Toughness (every attack roll shows it)', 'initiative order'],
          heroHidden: ['monster stat cards and abilities', 'NPC attack options', "the DM's Legendary Action options", "other heroes' cards and hands", 'the DM area'], userDecision: '2026-10-21' },
  range: { default: 5, weaponBonus: { 'ARC-EQP-01': 5 }, longest: 'ARC-EQP-01', longestTotal: 10, capOthers: 9, npcs: true, userRule: true },
  // Minimum Damage: every HIT deals at least 1 Damage to every creature. The only allowed reduction is an NPC ability that
  // reduces it to 1 (never 0): Hardened, Unbreakable (now "reduces the hit to 1"), Unyielding (only if it has 2+ Life). Hero cards
  // that reduce Damage (Plate Armor, "reduce by N") also stop at 1. A Block / "cancel the hit" card turns the hit into a miss (OPEN).
  minHitDamage: 1,
  // Actions per turn (user v1.9 + rulebook §16 provisional). Slots: W = a weapon attack (v1.13: no cantrips; a Caster fills W only with a weapon card),
  // S = any action spell, S1/S2/S3 = a spell of exactly that level. A turn may use any one combination (or part of it).
  turnActions: {
    enabled: true,
    Fighter: { 1: [['W']], 2: [['W', 'W']], 3: [['W', 'W', 'W']] },
    Hybrid:  { 1: [['W'], ['S']], 2: [['W', 'W'], ['S']], 3: [['W', 'W'], ['W', 'S']] },
    // full casters (Wizard, Druid, Bard): L1 one spell (or a weapon attack); L2 weapon attack + L1 spell, or one L2 spell;
    // L3 two spells of different levels, never the same spell twice
    Caster:  { 1: [['W'], ['S']], 2: [['W', 'S1'], ['S2']], 3: [['W', 'S1'], ['W', 'S2'], ['W', 'S3'], ['S1', 'S2'], ['S1', 'S3'], ['S2', 'S3']] },
  },
  // Area spells (rulebook §16, provisional): Caster/Hybrid spells of Level 2+ with an area. The caster places the area;
  // each creature in it (allies too; never the caster, never Down heroes) rolls 1d6 + Resilience vs DC = dcBase + caster Skill.
  // Meet or beat = half Damage rounded down (can be 0; the minimum-1 rule is only for hits); fail = full Damage + the effect.
  areaSpells: { enabled: true, minSpellLevel: 2, dcBase: 3, saveDie: 6, successFraction: 0.5, hitsAllies: true, provisional: true,
    // which spell cards use the save system (Level 2+ area spells in the decks)
    // v1.10.2: the Wizard L2/L3 spells (USER-APPROVED 2026-10-21): Fireball II, Lightning Bolt, Frost Nova II, Chain Lightning II, Ice Storm.
    // WIZ-SPL-14L = the OLD Fireball, cast only by the Fire Scroll (scroll upgrade still OPEN), unchanged from v1.10.1.
    cards: ['WIZ-SPL-14', 'WIZ-SPL-21', 'WIZ-SPL-15', 'WIZ-SPL-18', 'WIZ-SPL-23', 'WIZ-SPL-14L', 'DRU-SPL-20', 'DRU-SPL-19', 'RNG-SPL-09', 'RNG-SPL-10'] },
  // USER-APPROVED rule (user, 2026-10-17 playtest): Double move / Dash. Before attacking, a hero may give up
  // its attack to move up to 2 x Speed this turn. After a Dash it can ONLY move: no attack, spell, power-up or
  // item activation. Speed 0 still applies (2 x 0 = 0). NPC heroes Dash when no enemy is reachable.
  dash: { enabled: true, multiplier: 2, userApproved: true },
  // USER DECISION (2026-10-18): the Pinned condition is REMOVED from the game. No card applies it; cards that used to Pin
  // skip that part until Malcom/David's rewritten deck data lands (then rerun tools/build_data.py). Movement is blocked only by
  // creatures in the way (occupied hexes); a surrounded hero moves its full Speed through any empty hex.
  pinned: false,
  undoLimit: 150,     // how many user actions Ctrl+Z / Undo can step back (never past the start of the battle)
  // v1.7 pacing: ms per Auto DM / NPC-hero action (Table settings → Slow / Normal / Fast). 'test' is only for the e2e run.
  // Each action also waits for the narrator's line (never longer than narrator.maxWaitMs).
  pace: { slow: 1900, normal: 1350, fast: 650, test: 30 },
  narrator: { maxWaitMs: 6000 },          // longest one spoken line may hold up the next action
  // v1.9 (user playtest: NPC turns too fast): animation timings. hurtMs = red flash when a token really takes Damage;
  // missMs = the "Miss" puff + dodge wobble; npcStepMs = time per hex when an NPC token walks (scaled by the table pace:
  // Normal = this value, Slow longer, Fast shorter); npcPaceFactor stretches every Auto DM beat (1 = same as hero turns).
  anim: { hurtMs: 1800, missMs: 1600, npcStepMs: 340, npcPaceFactor: 1.5 },
  // v1.7 NPC second attack (OPEN placeholder): used ONLY when npc_deck.xlsx has no "Ranged Attack ..." columns. David's sheet wins.
  // Casters keep their Spell Attacks. Beast, Woodland Creature, Troll and Birds of Prey get none here (the sheet may say otherwise).
  npcRangedDraft: {
    'Goblin':            { name: 'Short Bow', type: 'Ranged (bow)', range: 3 },
    'Hob-Goblin':        { name: 'Crossbow', type: 'Ranged (crossbow)', range: 3 },
    'Bandit':            { name: 'Throwing Knives', type: 'Ranged (thrown, no pickup)', range: 3 },
    'Soldier/Mecernary': { name: 'Crossbow', type: 'Ranged (crossbow)', range: 3 },
    'Soldier/Mercenary': { name: 'Crossbow', type: 'Ranged (crossbow)', range: 3 },
  },
  maxHeroes: 6, // v1.11 user rule (2026-10-27): the Staging Area holds up to 6 characters
};
