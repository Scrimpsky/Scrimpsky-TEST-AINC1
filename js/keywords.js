// =====================================================================
// KEYWORD ENGINE: one block per keyword / card operation.
// Cards in effects.js list operations as ['opName', ...params]. Each op receives E (the engine API,
// set up in app.js), the context (hero h, current attack A, target t), and its params.
// REQS are the "only if..." checks a power-up can need before it can be played.
// =====================================================================
window.KW = (() => {
  const OPS = {
    // ---- simple self / party effects ----
    self: (E, x, fx, until, label) => E.addFx(x.h, fx, until, x.h, label || x.card?.name),
    allHeroes: (E, x, fx, until) => E.liveHeroes().forEach(u => E.addFx(u, fx, until, x.h, `${x.card.name} (${x.h.name})`)),
    heal: (E, x, n) => E.heal(x.h, n, `${x.card?.name || 'card'} (${x.h.name})`),
    rally: async (E, x) => {
      const allies = E.helpHeroes().filter(u => u !== x.h && E.adjacent(u, x.h));
      const t = await E.pickUnit('Rally: which adjacent hero?', allies);
      if (!t) return; E.heal(t, 1, `Rally (${x.h.name})`); E.addFx(t, { atk: 1 }, 'nextAttack', x.h, `Rally (${x.h.name})`);
    },
    // ---- Normal / Extra / Replace attacks ----
    extraAttack: (E, x, n) => { for (let i = 0; i < n; i++) E.addAttackToken(x.h, { kind: 'extra', label: 'Extra attack' }); },
    attackMode: (E, x, mode) => E.attackMode(x.h, mode, x.card),
    // ---- this attack (played before the roll) ----
    thisAttack: (E, x, mods) => { const A = x.A; Object.entries(mods).forEach(([k, v]) => { A.mods[k] = (typeof v === 'number' ? (A.mods[k] || 0) + v : v); }); A.played.push(x.card.name); E.evalAttack(); },
    // ---- Critical ----
    d6As6: (E, x) => { x.A.critical = true; E.evalAttack(); },
    reroll: (E, x) => { x.A.d6 = E.roll(); x.A.critical = false; E.log(`${x.h.name} rerolls the d6: ${x.A.d6}.`, 'play'); E.evalAttack(); },
    markForDeath: (E, x) => { const min = E.hasMod(x.h, 'critMin') ? 4 : 5; E.addFx(x.t, { markedBy: x.h.id, markMin: min }, 'fight', x.h, `Marked (${x.h.name})`); },
    // ---- on hit ----
    hitDmg: (E, x, n) => { x.A.extraDmg.push([x.card ? x.card.name : 'Bonus', n]); E.evalAttack(); },
    // ---- statuses on the target ----
    target: (E, x, fx, until, label) => E.addFx(x.t, fx, until, x.h, label || x.card?.name),
    poisonTarget: (E, x, n) => E.poison(x.t, n),
    pinTarget: (E, x) => { E.pinSkipped?.(x.t, x.card?.name); },
    // v1.7 (Malcom's Pin-free decks): -1 Attack until the end of the target's next turn. Re-applying refreshes it (no stacking).
    weakenT: (E, x) => { if (!x.t || x.t.life <= 0) return; E.weaken(x.t, x.h, x.card?.name); },   // v1.7: Pinned removed from the game (user, 2026-10-18); cards being rewritten
    stunTarget: (E, x) => { x.t.stunned = true; E.log(`${x.t.name} can't attack on its next turn.`); },
    // ---- Hidden ----
    hidden: (E, x) => E.hide(x.h),
    // ---- movement ----
    freeMove: (E, x, n) => { x.h.freeMove = (x.h.freeMove || 0) + n; E.log(`${x.h.name} may move up to ${n} spaces now (drag the token).`); },
    // ---- initiative ----
    initiative: (E, x, n) => { x.h.initRoll += n; E.log(`${x.h.name} adds +${n} to initiative (${x.card.name}).`, 'play'); },
    // ---- reactions ----
    cancelHit: (E, x) => { x.R.hit = false; },
    cancelAttack: (E, x) => { x.R.cancel = true; },
    survive: (E, x) => { x.R.survive = true; },
    // ---- choices ----
    chooseEnemies: async (E, x, opts, ops) => {
      let list = E.liveMonsters();
      if (opts.adjacent) list = list.filter(m => E.adjacent(m, x.h));
      if (opts.within) list = list.filter(m => E.dist(m, x.h) <= opts.within);
      const picked = await E.pickUnits(`${x.card.name}: choose up to ${opts.max} ${opts.max > 1 ? 'enemies' : 'enemy'}`, list, opts.max);
      for (const t of picked) for (const op of ops) await run(E, { ...x, t }, op);
    },
    chooseOne: async (E, x, choices) => {
      const i = await E.ask(x.card.name, 'Choose one:', choices.map((c, i) => ({ label: c[0], value: i, cls: 'primary' })));
      for (const op of choices[i][1]) await run(E, x, op);
    },
    // ---- v1.5: spells, casters, hybrids ----
    healT: (E, x, n) => E.healBy(x.h, x.t || x.h, n, `${x.card?.name || 'card'} (${x.h.name})`),
    healNear: async (E, x, n) => { const t = E.mostHurt([x.h, ...E.helpHeroes().filter(u => E.adjacent(u, x.h))]); if (t) E.healBy(x.h, t, n, `${x.card?.name || 'card'} (${x.h.name})`); },
    dmgT: (E, x, n) => E.dmgNoRoll(x.t, n, x.card?.name, { fire: E.isFire(x.card) }),
    pushT: (E, x, n) => E.push(x.h, x.t, n, 1),
    pullT: (E, x, n) => E.push(x.h, x.t, n, -1),
    pushOrPull: async (E, x, n) => { const d = await E.ask(x.card?.name || 'Push or pull', 'Push or pull the target?', [{ label: 'Push ' + n, value: 1, cls: 'primary' }, { label: 'Pull ' + n, value: -1 }, { label: 'Neither', value: 0 }]); if (d) E.push(x.h, x.t, n, d); },
    stunFull: (E, x) => { if (E.resistStun(x.t)) return; x.t.stunned = true; E.addFx(x.t, { speedZero: true, held: true }, 'bearerEndNextTurn', x.h, 'Held'); E.log(`${x.t.name} can't move or attack on its next turn.`, 'play'); E.narrate?.('cond', { t: x.t, cond: 'held' }); },
    hideT: (E, x) => E.hide(x.t || x.h),
    cleanseT: (E, x) => { const t = x.t || x.h; t.poison = 0; t.fx = t.fx.filter(f => !f.speedZero && !f.weakened && !f.pounce); E.log(`${t.name} is no longer Poisoned and loses any -1 Attack effect.`, 'play'); },
    splash: (E, x, n) => E.liveMonsters().filter(m => m !== x.t && E.adjacent(m, x.t)).forEach(m => E.dmgNoRoll(m, n, x.card?.name)),
    heroesWithin: async (E, x, n, ops) => { for (const t of E.helpHeroes().filter(u => E.dist(u, x.h) <= n)) for (const op of ops) await run(E, { ...x, t }, op); },
    enemiesWithin: async (E, x, n, ops) => { for (const t of E.liveMonsters().filter(m => E.dist(m, x.h) <= n)) for (const op of ops) await run(E, { ...x, t }, op); },
    pickAlly: async (E, x, range, ops) => { const t = await E.pickAlly(x.h, range, x.card?.name); if (t) for (const op of ops) await run(E, { ...x, t }, op); },
    fxOnce: (E, x, fx, until, label) => { const t = x.t || x.h; if (t.fx.some(f => f.label === label)) { E.log(`${label} is already on ${t.name} (does nothing).`, 'muted'); return; } E.addFx(t, fx, until, x.h, label); },
    teleport: (E, x, n) => { x.h.freeMove = (x.h.freeMove || 0) + n; x.h.teleportMove = true; E.log(`${x.h.name} may Teleport up to ${n} spaces (drag the token; creatures don't block).`, 'play'); },
    extraCast: (E, x, n, free) => { x.h.extraCasts = (x.h.extraCasts || 0) + n; if (free) x.h.freeCasts = (x.h.freeCasts || 0) + n; E.log(`${x.h.name} may cast ${n} extra spell${n > 1 ? 's' : ''} this turn${free ? ' (no action needed)' : ''}.`, 'play'); },
    // v1.13 note 8: extraCantrip (Quick Cast) removed with the cantrips
    flipAllUp: (E, x) => E.flipAllUp(x.h),
    flipOneUp: (E, x) => E.flipOneUp(x.h),
    empower: (E, x) => { x.h.empower = true; },
    bigArea: (E, x) => { x.h.bigArea = true; },
    castFree: (E, x, id) => E.castSpell(x.h, id, { scroll: true }),
    challenge: (E, x) => { E.addFx(x.t, { challengedBy: x.h.id }, 'ownerNextTurn', x.h, `Challenged (${x.h.name})`); E.log(`${x.t.name} is Challenged by ${x.h.name}.`, 'play'); },
    useAction: (E, x) => { if (E.useOneAction) E.useOneAction(x.h); else x.h.attacks = x.h.attacks.filter(t => t.kind !== 'normal'); x.h.castThisTurn = true; },   // v1.9: takes ONE attack/action slot
    lohPlus: (E, x) => { x.h.lohLeft = (x.h.lohLeft || 0) + 1; E.log(`${x.h.name} may use Lay on Hands once more this fight.`, 'play'); },
    markT: (E, x) => E.mark(x.h, x.t),
    snare: (E, x, n) => E.placeSnare(x.h, n),
    terrainAtT: (E, x, type, radius, until) => E.terrain(x.h, x.t, type, radius, until),
    reduceDmg: (E, x, n) => { x.R.reduce = (x.R.reduce || 0) + n; },
    reactMove: (E, x, n) => E.reactMove(x.h, n),
    intercept: (E, x) => { x.R.intercept = x.h; },
    counterShot: (E, x) => E.counterShot(x.h, x.m),
  };
  const REQS = {
    lifeLe2: (E, h) => h.life <= 2 || 'Needs 2 Life or less.',
    shield: (E, h) => E.hasFlag(h, 'shield') || 'Needs a shield equipped.',
    adjacentAlly: (E, h) => E.liveHeroes().some(u => u !== h && E.adjacent(u, h)) || 'Needs an adjacent hero.',
    adjacentEnemy: (E, h) => E.liveMonsters().some(m => E.adjacent(m, h)) || 'No enemy is adjacent to you.',
    enemyWithin2: (E, h) => E.liveMonsters().some(m => E.dist(m, h) <= 2) || 'No enemy within 2 spaces.',
    enemyLife2: (E, h) => E.liveMonsters().some(m => m.life <= 2) || 'No enemy has 2 Life or less.',
    engaged: (E, h) => E.engaged(h) || 'You must be Engaged (adjacent to an enemy).',
    notEngaged: (E, h) => !E.engaged(h) || 'You are Engaged (an enemy is adjacent).',
    meleeWeapon: (E, h) => E.weaponsOf(h).some(w => E.weapon(w).kind === 'melee') || 'Needs a melee weapon.',
    oneHandMelee: (E, h) => E.weaponsOf(h).some(w => E.weapon(w).kind === 'melee' && E.weapon(w).hands === 1) || 'Needs a one-handed melee weapon.',
    rangedWeapon: (E, h) => E.weaponsOf(h).some(w => E.weapon(w).kind === 'ranged') || 'Needs a ranged weapon.',
    attackedThisTurn: (E, h) => h.attackedThisTurn || 'Play after you attack this turn.',
    offGuardOrHiddenAny: (E, h) => E.isHidden(h) || E.liveMonsters().some(m => E.offGuard(m, h)) || 'Needs an Off Guard enemy or you Hidden.',
    // these look at the current attack (A)
    offGuardOrHidden: (E, h, A) => (A && (A.hiddenAtRoll ?? E.isHidden(h))) || (A && E.offGuard(E.byId(A.target), h)) || 'Target must be Off Guard, or you Hidden.',
    melee: (E, h, A) => (A && A.kind === 'melee') || 'Needs a melee attack.',
    ranged: (E, h, A) => (A && A.kind === 'ranged') || 'Needs a ranged attack.',
    adjacentTarget: (E, h, A) => (A && E.adjacent(h, E.byId(A.target))) || 'Target must be adjacent.',
    notSlow: (E, h, A) => !(A && A.weapon && E.weapon(A.weapon).slow) || 'Slow weapon can\'t do this.',
    otherEnemy: (E, h, A) => E.liveMonsters().some(m => m.id !== A?.target) || 'No other enemy.',
    spell: (E, h, A) => (A && A.spell) || 'Needs a Spell Attack.',
    enemyWithin3: (E, h) => E.liveMonsters().some(m => E.dist(m, h) <= 3) || 'No enemy within 3 spaces.',
    enemyWithin4: (E, h) => E.liveMonsters().some(m => E.dist(m, h) <= 4) || 'No enemy within 4 spaces.',
    enemyWithin5: (E, h) => E.liveMonsters().some(m => E.dist(m, h) <= 5) || 'No enemy within 5 spaces.',
    pairedWeapon: (E, h) => E.weaponsOf(h).some(w => E.weapon(w).paired) || 'Needs a paired weapon (Twin / Thornwood Blades).',
    faceDownSpell: (E, h) => (h.spells || []).some(id => E.isDown(h, id)) || 'No face-down spell.',
  };
  async function run(E, x, op) {
    const [name, ...params] = op; const f = OPS[name];
    if (!f) { E.log(`(No site rule for "${name}" — apply by hand.)`, 'muted'); return; }
    await f(E, x, ...params);
  }
  return { OPS, REQS, run };
})();
