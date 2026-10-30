/* Adventures Inc — game table (v1.10). Plain JS, no build step. */
(() => {
'use strict';
const C = window.CONFIG, FX = window.CARD_FX;
// v1.8: every Basic map from maps/maps_catalog.csv (js/maps.js, tools/build_maps.py); the 3 old ids are kept (same pictures)
if (Array.isArray(window.MAPS_CATALOG) && window.MAPS_CATALOG.length) C.maps = window.MAPS_CATALOG.map(m => ({ ...m }));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const roll = (n = 6) => 1 + Math.floor(Math.random() * n);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// =====================================================================
// v1.7 PACING, ATTACK ANIMATION, NARRATOR
// =====================================================================
const SET = () => (store.settings = Object.assign({ pace: 'normal', narrator: true, voice: '', volume: 0.9 }, store.settings || {}));
const paceKey = () => window.__TEST_PACE || SET().pace;
// ms per Auto DM / NPC action. CONFIG.pace = Slow / Normal / Fast (+ 'test' for the e2e run). Old CONFIG.autoDmDelayMs still wins if a test sets it.
const paceMs = () => C.autoDmDelayMs != null ? C.autoDmDelayMs : (C.pace[paceKey()] ?? C.pace.normal);
const heroPaceMs = () => C.heroAI.delayMs != null ? C.heroAI.delayMs : paceMs();
const narrCap = () => paceKey() === 'test' ? 60 : C.narrator.maxWaitMs;
function applySettings() {
  const S = SET(); if (!window.NARR) return;
  NARR.cfg.on = !!S.narrator; NARR.cfg.voice = S.voice || ''; NARR.cfg.volume = +S.volume;
  window.NARR_WAIT_CAP = narrCap(); NARR.captionOnlyMs = Math.min(1600, Math.max(250, paceMs()));
}
// one readable beat: the pace, then wait for the narrator to finish its line (never longer than CONFIG.narrator.maxWaitMs)
async function beat(frac = 1, ms) { const npc = G && current && current()?.side === 'npc' ? (C.anim.npcPaceFactor || 1) : 1; await sleep((ms ?? paceMs()) * frac * npc); if (window.NARR) await NARR.idle(narrCap()); }
// v1.9: ms per hex when an NPC token walks (CONFIG.anim.npcStepMs at Normal pace; scaled with the table speed; off in the e2e 'test' pace)
const walkStepMs = () => paceKey() === 'test' ? 0 : Math.round((C.anim.npcStepMs || 300) * paceMs() / C.pace.normal);
async function playWalk(m) {
  const pts = WALK[m.id]; delete WALK[m.id]; if (!pts || pts.length < 2) return;
  ANIM.walks.push({ id: m.id, steps: pts.length - 1, at: Date.now() });
  const per = walkStepMs(); renderTable(); if (!per) return;
  const e = tokEl(m); if (!e || !e.animate) return;
  const kf = pts.map(p => { const q = hexPx(p.c, p.r); return { left: q.x / GR.imgW * 100 + '%', top: q.y / GR.imgH * 100 + '%' }; });
  const ms = per * (pts.length - 1); e.style.transition = 'none'; e.animate(kf, { duration: ms, easing: 'linear' }); await sleep(ms + 40);
}
const ANIM = { n: 0, hurts: [], misses: [], walks: [], last: null };
const WALK = {};   // v1.9: NPC id -> hexes it just walked (played back slowly by playWalk)
const PICK = { react: null, area: null };   // v1.9: pending hex choices (kept outside G so undo snapshots stay cloneable)
try { document.documentElement.style.setProperty('--hurt-ms', (C.anim.hurtMs || 1000) + 'ms'); document.documentElement.style.setProperty('--miss-ms', (C.anim.missMs || 950) + 'ms'); } catch (e) { /* no DOM */ }
const HURT = {};
const HOLD = { n: 0, downs: [] };   // during an attack, 'X is down' is narrated after the hit line
function releaseHold() { HOLD.n = Math.max(0, HOLD.n - 1); if (!HOLD.n) HOLD.downs.splice(0).forEach(t => narrate('down', { t })); }
const fxLayer = () => document.getElementById('fxLayer') || (() => { const d = document.createElement('div'); d.id = 'fxLayer'; document.body.appendChild(d); return d; })();
const tokEl = u => u && document.querySelector(`.token[data-tok="${u.id}"]`);
function centerOf(u) { const e = tokEl(u); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
const animMs = () => Math.max(160, Math.min(700, paceMs() * 0.45));
// melee = a short lunge + slash at the target; ranged / spell = a projectile travelling the distance
function animateAttack(a, t, kind) {
  const P = centerOf(a), Q = centerOf(t); ANIM.n++; ANIM.last = { a: a?.id, t: t?.id, kind, at: Date.now() };
  if (!P || !Q || !document.body.animate) return 0;
  const L = fxLayer(), ms = animMs(), dx = Q.x - P.x, dy = Q.y - P.y, ang = Math.atan2(dy, dx) * 180 / Math.PI;
  if (kind === 'melee') {
    const te = tokEl(a); te?.animate([{ transform: 'translate(-50%,-50%)' }, { transform: `translate(calc(-50% + ${dx * 0.35}px),calc(-50% + ${dy * 0.35}px))` }, { transform: 'translate(-50%,-50%)' }], { duration: ms, easing: 'ease-in-out' });
    const s = document.createElement('div'); s.className = 'fx-slash'; s.style.left = Q.x + 'px'; s.style.top = Q.y + 'px'; L.appendChild(s);
    s.animate([{ opacity: 0, transform: `translate(-50%,-50%) rotate(${ang - 50}deg) scale(.4)` }, { opacity: 1, transform: `translate(-50%,-50%) rotate(${ang + 20}deg) scale(1.1)`, offset: .55 }, { opacity: 0, transform: `translate(-50%,-50%) rotate(${ang + 45}deg) scale(1.2)` }],
      { duration: ms * 1.4, easing: 'ease-out', delay: ms * 0.3 }).onfinish = () => s.remove();
    setTimeout(() => s.remove(), ms * 2 + 400);
  } else {
    const pr = document.createElement('div'); pr.className = 'fx-proj ' + (kind === 'spell' ? 'spell' : 'arrow'); pr.style.left = P.x + 'px'; pr.style.top = P.y + 'px'; L.appendChild(pr);
    const d = Math.max(ms, Math.min(1100, Math.hypot(dx, dy) * 2.2));
    pr.animate([{ transform: `translate(-50%,-50%) rotate(${ang}deg)`, opacity: .2 }, { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${ang}deg)`, opacity: 1 }], { duration: d, easing: 'cubic-bezier(.3,.1,.6,1)' }).onfinish = () => pr.remove();
    setTimeout(() => pr.remove(), d + 400);
    return d;
  }
  return ms * 1.5;
}
// red flash for about 1 s, ONLY when the target actually takes Damage (called from damage())
function flashHurt(u) {
  HURT[u.id] = Date.now() + C.anim.hurtMs; ANIM.hurts.push({ id: u.id, at: Date.now() });
  const e = tokEl(u); if (e) { e.classList.remove('hurt'); void e.offsetWidth; e.classList.add('hurt'); }
  setTimeout(() => { if (HURT[u.id] && HURT[u.id] <= Date.now()) { delete HURT[u.id]; tokEl(u)?.classList.remove('hurt'); } }, C.anim.hurtMs + 30);
}
function missPuff(u) {
  const Q = centerOf(u); ANIM.misses.push({ id: u?.id, at: Date.now() }); if (!Q) return;
  const m = document.createElement('div'); m.className = 'fx-miss'; m.textContent = 'Miss'; m.style.left = Q.x + 'px'; m.style.top = Q.y + 'px'; fxLayer().appendChild(m);
  const ms = C.anim.missMs || 950;
  m.animate?.([{ opacity: 0, transform: 'translate(-50%,-30%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-90%) scale(1.1)', offset: .3 }, { opacity: 0, transform: 'translate(-50%,-170%) scale(1)' }], { duration: ms, easing: 'ease-out' });
  // v1.9: the target wobbles (dodges) for most of the puff
  tokEl(u)?.animate?.([0, -7, 7, -5, 5, -2, 0].map(x => ({ transform: `translate(calc(-50% + ${x}px),-50%)` })), { duration: ms * 0.7, easing: 'ease-in-out' });
  setTimeout(() => m.remove(), ms + 50);
}
const COND_WORDS = { poisoned: n => `poisoned${n ? ' ' + n : ''}`, pounced: () => 'pounced upon, minus one Attack', weakened: () => 'weakened, minus one Attack', held: () => 'held fast', pushed: () => 'knocked back', pulled: () => 'dragged off balance', hidden: () => 'hidden from sight' };
function narrate(kind, d) {
  if (!window.NARR || !G) return;
  if (kind === 'attack') {
    const pc = d.a.side === 'pc', k = (pc ? 'pc' : 'npc') + (d.hit ? (d.dmg > 0 ? (d.crit ? 'HitCrit' : 'Hit') : 'HitNoDmg') : 'Miss');
    NARR.say(k, { a: d.a.name, t: d.t.name, d: d.dmg, w: (d.w || (d.ranged ? 'shot' : pc ? 'blade' : 'attack')).toLowerCase() });
  } else if (kind === 'cond') NARR.say(d.t.side === 'pc' ? 'condPc' : 'condNpc', { t: d.t.name, c: (COND_WORDS[d.cond] || (() => d.cond))(d.n) });
  else if (kind === 'down') NARR.say(d.t.side === 'pc' ? 'downPc' : 'downNpc', { t: d.t.name });
  else if (kind === 'dying') NARR.say('dyingPc', { t: d.t.name, n: d.n });
  else if (kind === 'dyingHit') NARR.say('dyingHit', { t: d.t.name });
  else if (kind === 'dead') NARR.say('deadPc', { t: d.t.name });
  else if (kind === 'up') NARR.say('upPc', { t: d.t.name });
  else if (kind === 'legendary') NARR.say('legendary', { a: d.a.name, w: d.w });
  else if (kind === 'end') NARR.say(d.win ? 'victory' : 'defeat', {});
}
// caption on screen for every narrated line
function showCaption(it) {
  let c = document.getElementById('narrCaption');
  if (!c) { c = document.createElement('div'); c.id = 'narrCaption'; document.body.appendChild(c); }
  if (!it) { c.classList.remove('show'); return; }
  c.className = 'show ' + it.mood; c.innerHTML = `<span class="who">🎙 Narrator</span> ${esc(it.text)}`;
}
if (window.NARR) { NARR.caption = showCaption; NARR.onVoices = () => { if (document.querySelector('.settings-modal')) openSettings(true); }; }
function openSettings(refresh) {
  const S = SET(); document.querySelector('.settings-modal')?.closest('.modal-back')?.remove();
  const vs = window.NARR ? NARR.voices() : [], cur = window.NARR ? NARR.pick() : null;
  const m = modal(`<h3>⚙ Table settings</h3>
    <label class="set-row">Action speed (Auto DM and NPC heroes)
      <span class="toggle" id="setPace">${['slow', 'normal', 'fast'].map(k => `<button data-pace="${k}" class="${S.pace === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</span></label>
    <label class="set-row"><input type="checkbox" id="setNarr" ${S.narrator ? 'checked' : ''}> 🎙 Narrator (spoken lines; captions always show)</label>
    <label class="set-row">Voice <select id="setVoice"><option value="">Automatic (${esc(cur?.name || 'none found')})</option>${vs.map(v => `<option value="${esc(v.name)}" ${S.voice === v.name ? 'selected' : ''}>${esc(v.name)} — ${esc(v.lang)}</option>`).join('')}</select></label>
    <label class="set-row">Volume <input type="range" id="setVol" min="0" max="1" step="0.05" value="${S.volume}"></label>
    <div class="muted small" id="setVoiceNow">Speaking with: ${esc(window.NARR ? NARR.voiceName() : 'none')}</div>
    <div class="btnrow"><button id="setTest">▶ Test the narrator</button><button data-close class="primary">Done</button></div>`, 'settings-modal');
  const save_ = () => { save(); applySettings(); };
  m.querySelectorAll('[data-pace]').forEach(b => b.onclick = () => { S.pace = b.dataset.pace; save_(); m.querySelectorAll('[data-pace]').forEach(x => x.classList.toggle('on', x === b)); });
  m.querySelector('#setNarr').onchange = e => { S.narrator = e.target.checked; save_(); if (!S.narrator) NARR?.stop(); };
  m.querySelector('#setVoice').onchange = e => { S.voice = e.target.value; save_(); m.querySelector('#setVoiceNow').textContent = 'Speaking with: ' + NARR.voiceName(); };
  m.querySelector('#setVol').oninput = e => { S.volume = +e.target.value; save_(); };
  m.querySelector('#setTest').onclick = () => { NARR?.say('pcHit', { a: 'Gorham', t: 'the Goblin', d: 1 }); NARR?.say('npcMiss', { a: 'The Goblin', t: 'Gorham', w: 'short bow' }); };
  m.querySelectorAll('[data-close]').forEach(b => b.onclick = () => m.remove());
  m.onclick = e => { if (e.target === m) m.remove(); };
}
const uid = () => Math.random().toString(36).slice(2, 10);
// v1.10.1: cache-busting for card images (CONFIG.assetVersion), so re-rendered art reloads
const copiesMax = lvl => (C.powerupCopies && C.powerupCopies[lvl]) || 1;   // v1.11: max copies of one power-up card per level
const IMGV = p => typeof p === 'string' && p.startsWith('img/') && !p.includes('?') ? `${p}?v=${window.CONFIG.assetVersion || '0'}` : p;
for (const c of [...Object.values(window.DECKS).flat(), ...(window.NPC_CARDS || []), ...(window.MONSTERS_L1 || [])]) for (const k of ['img', 'imgFull', 'full']) if (c && c[k]) c[k] = IMGV(c[k]);
const CARD = {}; Object.values(window.DECKS).flat().forEach(c => CARD[c.id] = c);
// v1.13 note 8 (user decision 2026-10-29): cantrips are removed completely, with no replacement basic attack; Casters use
// their spells. Card text that mentions cantrips is trimmed; cards that only work with cantrips leave every pool.
// The printed art of these cards still shows the old text (Angela to re-render). List: cards/notes/cantrip_removal_v1.13.csv
window.CANTRIP_TEXT_V113 = {
  'DRU-CLS-01': { text: '' }, 'WIZ-CLS-01': { text: '' },
  'BRD-CLS-01': { cut: 'Cantrip: Ranged Attack, Range 5; 1d6 + Attack vs Toughness; hit 1 Damage (no Touch Attack). ' },
  'DRU-EQP-01': { cut: ' (including cantrips)' }, 'WIZ-EQP-01': { cut: ' (including cantrips)' },
  'DRU-ABL-02': { cut: ' (including cantrips)' }, 'WIZ-ABL-01': { cut: ' (including cantrips)' },
  'WIZ-EQP-02': { cut: 'your Ranged Attack cantrip or ', stats: '1/round: +1 Damage (Fire)' },
  'WIZ-ABL-06': { cut: ', and your Ranged Attack cantrip,', stats: 'Range +1 (Range 2+ spells)' },
  'DRU-PWR-04': { cut: ' or cantrip' }, 'WIZ-PWR-05': { cut: ' or cantrip' },
};
window.CANTRIP_REMOVED_V113 = new Set(['DRU-PWR-03', 'WIZ-PWR-03', 'DRU-SPL-14']);   // Quick Cast x2 (extra cantrip), Wild Shape: Bear (Touch Attack only)
for (const [id, e] of Object.entries(window.CANTRIP_TEXT_V113)) { const c = CARD[id]; if (!c) continue;
  if ('text' in e) c.text = e.text; if (e.cut) c.text = (c.text || '').split(e.cut).join('').trim();
  if (e.stats) c.stats = e.stats; c.v113cantrip = true; }
const REMOVED = window.CANTRIP_REMOVED_V113;
(window.NPC_META?.rulings || []).forEach((r, i, a) => { if (Array.isArray(r) && typeof r[1] === 'string') r[1] = r[1].replace(' that mirrors the hero caster Ranged Attack cantrip (rulebook §13)', ' (rulebook §13)'); });
if (window.CREATOR_POOLS) window.CREATOR_POOLS.cards = window.CREATOR_POOLS.cards.filter(c => !REMOVED.has(c.id));
// Alternate class looks (same card text): e.g. ASN-CLS-01b
Object.values(CARD).filter(c => c.looks).forEach(c => c.looks.slice(1).forEach(id => CARD[id] = { ...c, id, img: IMGV(`img/cards/${id}.jpg`) }));
const typeOfStyle = s => Object.keys(C.styles).find(t => C.styles[t].includes(s));
const isPlayable = s => !!((window.DECK_META[s]?.playable ?? window.DECK_META[s]?.complete) && C.playableTypes.includes(typeOfStyle(s)) && !C.forceComingSoon.includes(s));
// The Wolf companion attack works like a weapon. (v1.13 note 8: cantrips are gone, so Casters have no basic attack.)
const VWEAPON = {
  'wolf': { kind: 'melee', companion: 'wolf' },
};
CARD['wolf'] = { id: 'wolf', name: 'Wolf (companion)', text: 'Melee from the Wolf: 1d6 + 1, 1 Damage. Instead of your attack.' };
const COMPANIONS = { wolf: { name: 'Wolf', icon: '🐺', life: 2, tough: 3, speed: 3, atk: 1, color: '#6b5a3a' }, hawk: { name: 'Hawk', icon: '🦅', life: 1, tough: 4, speed: 5, flies: true, color: '#8a6d1f' } };
const isOnce = id => /once per fight/i.test(CARD[id]?.text || '');
const classCardOf = s => (window.DECKS[s] || []).find(c => c.type === 'Class');
// creature roster (Core Stats "Level 1 NPCs"); `name` = sheet spelling, `display` = typo-fixed label
const MON = {}; window.MONSTERS_L1.forEach(m => MON[m.name] = m);
const NPCC = {}; (window.NPC_CARDS || []).forEach(n => { NPCC[n.id] = n;
  if (n.img) CARD[n.id] = { id: n.id, name: n.name, type: 'NPC · ' + n.creatureType, level: n.level, text: n.text, flavor: n.flavor, img: n.img };
  FX[n.id] = FX[n.id] || { auto: true, note: [n.attackKind === 'melee' ? `${n.attackName}: melee (adjacent).` : `${n.attackName}: Spell Attack, Range ${n.range}; Close Quarters ${C.npc.spellCloseQuarters} while Engaged.`,
    ...n.abilities.map(a => `${parseNpcAbility(a).def.note || 'not automated yet (apply by hand).'}`)].join(' ') }; });
const npcCardOf = name => NPCC[MON[name]?.card];
const monLabel = m => m.display || m.name;
function creatureToken(name) {
  const t = C.creatureTokens?.[name]; if (t) return t;
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { tag: name.split(/[\s/-]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2), color: `hsl(${h} 45% 32%)` };
}
const tokenDisc = (name, txt, cls = '') => `<span class="ctok ${cls}" style="--tc:${creatureToken(name).color}">${esc(txt ?? creatureToken(name).tag)}</span>`;

// v1.8 map dropdown: every Basic map, grouped by environment (<optgroup>)
function mapOptions() {
  const envs = [...new Set(C.maps.map(m => m.env || 'Maps'))];
  return envs.map(env => `<optgroup label="${esc(env)} (${C.maps.filter(m => (m.env || 'Maps') === env).length})">${C.maps.filter(m => (m.env || 'Maps') === env).map(m => `<option value="${m.id}" ${m.id === store.mapId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('');
}
// ---------------- storage ----------------
const KEY = 'adventuresInc.v1';
const store = Object.assign({ players: [], current: null, characters: [], dmMode: 'auto', mapId: C.maps[0].id, pool: Object.keys(C.encounterPools)[0], seats: [], encMode: 'random', custom: { items: [], area: 'east' }, savedEncounters: {}, settings: { pace: 'normal', narrator: true, voice: '', volume: 0.9 } },
  JSON.parse(localStorage.getItem(KEY) || '{}'));
const save = () => localStorage.setItem(KEY, JSON.stringify(store));
// v1.11.1: saved characters move onto the consolidated v0.3 decks. Class = the Style's Class (old styles all still exist);
// MERGEd cards become the card they merged into; CUT cards are dropped and the gap is refilled from the Class deck (first legal card in deck order).
// What changed is kept on the character (ch.v03) and shown once in the lobby.
function migrateV03() {
  if (!window.GROUP_POOL) return [];
  const out = [];
  for (const ch of store.characters) {
    if (ch.v03) continue;
    const type = typeOfStyle(ch.style) || ch.type || 'Fighter'; ch.type = type;
    if (!C.styles[type].includes(ch.style)) ch.style = C.styles[type][0];
    if (!CARD[ch.classCard] || CARD[ch.classCard].type !== 'Class') ch.classCard = classCardOf(ch.style)?.id;
    const pool = window.GROUP_POOL(type), P = C.picks[type][ch.level] || C.picks[type][1], log = { merged: [], dropped: [], added: [] };
    const fix = (key, t, need, dup) => {
      let a = (ch[key] || []).map(id => { if (pool.includes(id)) return id; const m = window.MERGED_INTO(id); if (m && pool.includes(m)) { log.merged.push(`${CARD[id]?.name || id} → ${CARD[m]?.name || m}`); return m; } log.dropped.push(CARD[id]?.name || id); return null; }).filter(Boolean);
      if (!dup) a = [...new Set(a)];
      const cand = pool.filter(id => CARD[id]?.type === t && CARD[id].level <= ch.level && (dup || !a.includes(id)));
      while (a.length < (need || 0) && cand.length) { const id = dup ? cand[a.length % cand.length] : cand.shift(); a.push(id); log.added.push(CARD[id].name); }
      ch[key] = a.slice(0, need || 0);
    };
    fix('equipment', 'Equipment', P.equipment); fix('abilities', 'Ability', P.abilities); fix('spells', 'Spell', P.spells || 0); fix('powerups', 'Power-up', P.deck, true);
    ch.v03 = { at: new Date().toISOString(), ...log };
    if (log.merged.length || log.dropped.length || log.added.length) out.push(`${ch.name}: ${[log.merged.length && 'merged ' + log.merged.join(', '), log.dropped.length && 'dropped (cut) ' + log.dropped.join(', '), log.added.length && 'added ' + log.added.join(', ')].filter(Boolean).join('; ')}`);
  }
  if (store.characters.length) save();
  return out;
}

// ---------------- modal helpers ----------------
function modal(html, cls = '') {
  const m = document.createElement('div'); m.className = 'modal-back';
  m.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  document.body.appendChild(m); return m;
}
// NPC-controlled heroes answer prompts themselves (AI_ACTOR is set while the computer acts for a hero)
let AI_ACTOR = null;
function aiAnswer(buttons) {
  const units = typeof G !== 'undefined' && G ? buttons.map(b => byId(b.value)).filter(Boolean) : [];
  if (units.length === buttons.length && units.length) { // choosing a creature: weakest, then nearest
    const me = AI_ACTOR; return units.sort((a, b) => a.life - b.life || (me ? dist(me, a) - dist(me, b) : 0))[0].id; }
  return buttons[0].value; // "Play …" / "Yes" / first option
}
// v1.10: ASK_FOR = whose question this is (a hero, or 'dm'). In hero view the screen switches to that seat while the prompt is open,
// so one hero never sees another hero's cards or the DM's Legendary Action options. (Per-device play: the prompt goes to that device.)
let ASK_FOR = null;
async function asHero(h, fn) {
  if (h && h.side === 'pc' && h.control !== 'npc' && !AI_ACTOR) { const pa = ASK_FOR; ASK_FOR = h; try { return await fn(); } finally { ASK_FOR = pa; } }
  if (!h || h.control !== 'npc' || AI_ACTOR) return fn(); const prev = AI_ACTOR; AI_ACTOR = h; try { return await fn(); } finally { AI_ACTOR = prev; } }
async function askAs(who, fn) { const pa = ASK_FOR; ASK_FOR = who; try { return await fn(); } finally { ASK_FOR = pa; } }
function seatView(who) { return who === 'dm' ? { kind: 'dm' } : who && who.side === 'pc' ? { kind: 'hero', id: who.id } : null; }
async function withView(v, fn) {   // show the screen from v while fn runs (only needed when the current view is a hero's)
  const cur = G ? viewer() : null; if (!v || !cur || cur.kind !== 'hero' || (v.kind === 'hero' && v.id === cur.id)) return fn();
  const prev = VIEW.temp; VIEW.temp = v; renderTable();
  try { return await fn(); } finally { VIEW.temp = prev; if (G) renderTable(); }
}
function ask(title, body, buttons, cls = '') { // buttons: [{label, value, cls}]
  if (AI_ACTOR) return Promise.resolve(aiAnswer(buttons));
  return withView(seatView(ASK_FOR), () => new Promise(res => {
    const m = modal(`<h3>${title}</h3><div class="ask-body">${body}</div><div class="btnrow">${buttons.map((b, i) => `<button class="${b.cls || ''}" data-i="${i}">${b.label}</button>`).join('')}</div>`, 'ask ' + cls);
    $$('button[data-i]', m).forEach(b => b.onclick = () => { m.remove(); res(buttons[+b.dataset.i].value); });
  }));
}
function zoomCard(id, actions = [], full = false) { // actions: [{label, fn, disabled, why}]; full = full-size close-up (card browser)
  const c = CARD[id]; const fx = FX[id] || {};
  const m = modal(`<div class="zoom ${full ? 'full' : ''}"><img src="${full && c.imgFull ? c.imgFull : c.img}" alt="${esc(c.name)}"><div class="zoom-info">
    <h3>${esc(c.name)}</h3><div class="muted">${esc(c.type)} · Level ${c.level} · ${esc(c.id)}</div>
    <p>${esc(c.text)}</p><p class="flavor">${esc(c.flavor)}</p>
    ${fx.note ? `<p class="note">Site: ${esc(fx.note)}</p>` : ''}${fx.auto === false ? '<p class="note">Applied by hand in v1.</p>' : ''}
    <div class="btnrow">${actions.map((a, i) => `<button data-a="${i}" class="primary" ${a.disabled ? 'disabled' : ''} title="${esc(a.why || '')}">${esc(a.label)}</button>`).join('')}<button data-close>Close</button></div>
    ${actions.filter(a => a.disabled && a.why).map(a => `<div class="muted small">${esc(a.label)}: ${esc(a.why)}</div>`).join('')}
  </div></div>`, 'zoom-modal');
  $('[data-close]', m).onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  $$('[data-a]', m).forEach(b => b.onclick = () => { m.remove(); actions[+b.dataset.a].fn(); });
}
const cardImg = (id, cls = '') => `<img class="cardimg ${cls}" src="${CARD[id].img}" alt="${esc(CARD[id].name)}" title="${esc(CARD[id].name)}: ${esc(CARD[id].text)}" data-zoom="${id}">`;
function wireZoom(root = document) { $$('[data-zoom]', root).forEach(el => el.onclick = e => { e.stopPropagation(); zoomCard(el.dataset.zoom); }); }

// ---------------- stats from cards ----------------
// v1.9 USER RULE: +1 Life, +1 Attack, +1 Skill per level above 1 (CONFIG.levelGrowth)
function levelBase(type, level, style) {
  // v1.11.1: the Style's class card can set its own line (Barbarian 6/3/3/1/1/1)
  const b = { ...((style && C.styleStats?.[style]) || C.baseStats[type]) }, g = C.levelGrowth || {}, n = Math.max(0, (level || 1) - 1);
  Object.keys(b).forEach(k => { if (typeof g[k] === 'number') b[k] += g[k] * n; });
  return b;
}
// v1.9: what a hero actually adds to each kind of attack roll (passive cards like Weapon Training only show up here and in the roll)
function atkSummary(baseAtk, ids, type) {
  const fx = id => FX[id] || {}, nm = id => CARD[id]?.name || id, mods = k => ids.filter(id => fx(id).mods?.[k]);
  const out = [], ws = ids.filter(id => fx(id).weapon);
  const melee = ws.filter(id => fx(id).weapon.kind === 'melee'), ranged = ws.filter(id => fx(id).weapon.kind === 'ranged' || fx(id).weapon.throwRange);
  const mv = id => { const w = fx(id).weapon; return (w.atk || 0) + (w.hands === 1 ? mods('oneHandMeleeAtk').reduce((s, x) => s + fx(x).mods.oneHandMeleeAtk, 0) : 0) + (w.paired ? mods('pairedAtk').reduce((s, x) => s + fx(x).mods.pairedAtk, 0) : 0); };
  if (type !== 'Caster' || melee.length) {
    const bw = [...melee].sort((a, b) => mv(b) - mv(a))[0], parts = [['Base Attack', baseAtk]];
    if (bw) { const w = fx(bw).weapon; if (w.atk) parts.push([nm(bw), w.atk]); if (w.hands === 1) mods('oneHandMeleeAtk').forEach(x => parts.push([nm(x), fx(x).mods.oneHandMeleeAtk])); if (w.paired) mods('pairedAtk').forEach(x => parts.push([nm(x), fx(x).mods.pairedAtk])); }
    mods('meleeAtk').forEach(x => parts.push([nm(x), fx(x).mods.meleeAtk]));
    out.push({ k: 'Melee', v: parts.reduce((s, p) => s + p[1], 0), parts, w: bw ? nm(bw) : 'Basic Attack' });
  }
  if (ranged.length) {
    const bw = [...ranged].sort((a, b) => (fx(b).weapon.atk || 0) - (fx(a).weapon.atk || 0))[0], parts = [['Base Attack', baseAtk]];
    if (fx(bw).weapon.atk) parts.push([nm(bw), fx(bw).weapon.atk]); mods('rangedAtk').forEach(x => parts.push([nm(x), fx(x).mods.rangedAtk]));
    out.push({ k: 'Ranged', v: parts.reduce((s, p) => s + p[1], 0), parts, w: nm(bw) });
  }
  if (type === 'Caster' || mods('spellAtk').length) {
    const parts = [['Base Attack', baseAtk]]; mods('spellAtk').forEach(x => parts.push([nm(x), fx(x).mods.spellAtk]));
    out.push({ k: 'Spell', v: parts.reduce((s, p) => s + p[1], 0), parts, w: 'Spell Attacks' });
  }
  return out;
}
const atkLinesHtml = (sum, cls = '') => `<div class="atklines ${cls}">${sum.map(x => `<span class="atkline" data-kind="${x.k}" title="${esc(x.parts.map(p => `${p[0]} ${p[1] >= 0 ? '+' : ''}${p[1]}`).join(', '))}">⚔ ${x.k} <b>+${x.v}</b> <small>(${esc(x.parts.map(p => `${p[0]} ${p[1] >= 0 ? '+' : ''}${p[1]}`).join(', '))})</small></span>`).join('')}</div>`;
function cardBonuses(ids) {
  const s = { life: 0, speed: 0, tough: 0, atk: 0, res: 0, skill: 0 };
  ids.forEach(id => { const f = FX[id] || {}; Object.entries(f.stats || {}).forEach(([k, v]) => s[k] += v); });
  return s;
}
// LOCKED stat cap check (Level 1: Equipment + Abilities add at most +2 to any one stat).
// Only one weapon's Attack bonus applies per attack, so Attack = best weapon + ability bonuses.
function capCheck(ids, level) {
  const cap = C.statCap[level]; if (cap == null) return { ok: true, totals: {} };
  const t = { life: 0, speed: 0, tough: 0, atk: 0, res: 0, skill: 0 };
  let bestWeapon = 0;
  ids.forEach(id => { const f = FX[id] || {};
    Object.entries(f.stats || {}).forEach(([k, v]) => { if (v > 0) t[k] += v; });
    Object.entries(f.capStats || {}).forEach(([k, v]) => t[k] += v);
    if (f.weapon) bestWeapon = Math.max(bestWeapon, f.weapon.atk || 0);
  });
  t.atk += bestWeapon;
  const over = Object.entries(t).filter(([, v]) => v > cap).map(([k]) => k);
  return { ok: !over.length, over, totals: t, cap };
}
const STATN = { life: 'Life', speed: 'Speed', tough: 'Toughness', atk: 'Attack', res: 'Resilience', skill: 'Skill' };

// =====================================================================
// SCREEN 1: start page
// =====================================================================
const app = $('#app');
function showStart() {
  document.body.className = 'start';
  app.innerHTML = `<div class="start-wrap"><div class="start-card parchment">
    <h1>Adventures Inc</h1><div class="tag">A card-built adventure game</div>
    <label>Who's playing?</label>
    <div class="row"><select id="pickPlayer"><option value="">— pick a player —</option>${store.players.map(p => `<option ${p === store.current ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
    <div class="row"><input id="newPlayer" placeholder="…or type a new player name" maxlength="24"></div>
    <button id="join" class="primary big">Join the table</button>
    <p class="muted small">Names are saved in this browser only. No passwords.</p>
  </div></div>`;
  $('#join').onclick = () => {
    const typed = $('#newPlayer').value.trim(), picked = $('#pickPlayer').value;
    const name = typed || picked; if (!name) { $('#newPlayer').focus(); $('#newPlayer').classList.add('err'); return; }
    if (!store.players.includes(name)) store.players.push(name);
    store.current = name; save(); showLobby();
  };
  $('#newPlayer').onkeydown = e => { if (e.key === 'Enter') $('#join').click(); };
}

// =====================================================================
// SCREEN 2: waiting room
// =====================================================================
// v1.12: the lobby / waiting-room / DM setup background is the map chosen in the Map dropdown (live; other tabs follow via 'storage')
function lobbyBg() {
  const mp = C.maps.find(x => x.id === store.mapId) || C.maps[0];
  if (mp && mp.img) document.body.style.setProperty('--lobby-bg', `url("${new URL(IMGV(mp.img), location.href).href}")`); else document.body.style.removeProperty('--lobby-bg');
  document.body.dataset.lobbyMap = mp ? mp.id : '';
  return mp ? mp.id : null;
}
window.addEventListener('storage', e => { if (e.key !== KEY || !e.newValue) return;
  try { const o = JSON.parse(e.newValue); if (o.mapId && o.mapId !== store.mapId) { store.mapId = o.mapId; if (document.body.classList.contains('lobby')) { lobbyBg(); const sel = $('#mapSel'); if (sel) sel.value = o.mapId; } } } catch (_) {} });
function showLobby(flashId) {
  document.body.className = 'lobby'; lobbyBg();
  store.seats = store.seats.filter(id => store.characters.some(c => c.id === id && isPlayable(c.style))).slice(0, C.maxHeroes || 99);
  const staged = store.seats.map(id => store.characters.find(c => c.id === id));
  const lvl = Math.max(1, ...staged.map(c => c.level));
  const ctl = c => c.control === 'npc' ? 'npc' : 'user';
  const catalog = store.characters.map(c => { const on = store.seats.includes(c.id), ok = isPlayable(c.style);
    return `<div class="cat-tile ${on ? 'staged' : ''} ${flashId === c.id ? 'flash' : ''}" data-char="${c.id}" draggable="${ok && !on}" title="${ok ? (on ? 'In the Staging Area' : 'Drag me into the Staging Area') : 'This deck is not playable yet'}">
      ${CARD[c.classCard] ? cardImg(c.classCard) : ''}
      <div class="cat-info"><b>${esc(c.name)}</b><div class="muted small">L${c.level} ${esc(c.style)} · ${esc(c.type || typeOfStyle(c.style))}</div><div class="muted small">by ${esc(c.owner)}</div>
        ${on ? '<div class="stagedtag">✔ In staging</div>' : ''}</div>
      <div class="cat-btns"><button class="small" data-stage="${c.id}" ${ok && !on && !(C.maxHeroes && staged.length >= C.maxHeroes) ? '' : 'disabled'}>Stage →</button><button class="small" data-edit="${c.id}">✎ Edit</button><button class="small danger" data-delc="${c.id}">🗑 Delete</button></div>
    </div>`; }).join('');
  const stagedHtml = staged.map(c => `<div class="stg ${ctl(c)}" data-char="${c.id}" draggable="true" title="Drag back to the catalog to unstage">
      ${CARD[c.classCard] ? cardImg(c.classCard) : ''}
      <div class="stg-info"><b>${esc(c.name)}</b><div class="muted small">L${c.level} ${esc(c.style)}</div>
        <div class="toggle small ctl"><button data-ctl="${c.id}|user" class="${ctl(c) === 'user' ? 'on' : ''}" title="You play this hero's turns">🎮 Run by me</button><button data-ctl="${c.id}|npc" class="${ctl(c) === 'npc' ? 'on' : ''}" title="The computer plays this hero">🤖 NPC</button></div></div>
      <button class="unstage" data-unstage="${c.id}" title="Remove from staging">✕</button></div>`).join('');
  app.innerHTML = `<header class="topbar"><b>Adventures Inc</b><span>Signed in as <b>${esc(store.current)}</b></span><span class="muted small">${esc(C.version)}</span><button id="signout">Switch player</button></header>
  <div class="lobby-grid three">
    <section class="panel parchment catpanel" id="catalog"><h2>Character Catalog <span class="muted small">${store.characters.length} saved</span></h2>
      <p class="muted small">Every saved character lives here. <b>Edit</b> or <b>Delete</b> them any time. Drag a character (or press <b>Stage →</b>) into the Staging Area to bring it to the next battle.</p>
      <div class="catalog">${catalog}<button id="create" class="cat-tile create-tile" title="Create a new character">＋<span>Create character</span></button></div>
      <div id="charView"></div>
    </section>
    <section class="panel parchment stagepanel"><h2>Staging Area <span class="muted small" id="stageCount">${staged.length} hero${staged.length === 1 ? '' : 'es'}${C.maxHeroes ? ` / ${C.maxHeroes} max${staged.length >= C.maxHeroes ? ' (full)' : ''}` : ''}</span></h2>
      <div class="dropzone ${staged.length ? '' : 'empty'}" id="staging">${stagedHtml || '<p class="muted drophint">Drag characters here from the catalog<br>(or press <b>Stage →</b> on a tile).</p>'}</div>
      <p class="muted small">Each staged hero is <b>🎮 Run by me</b> (you play its turn) or <b>🤖 NPC</b> (the computer plays it). Staging is saved in this browser.</p>
    </section>
    <section class="panel parchment dmpanel"><h2>DM panel</h2>
      <label>Map</label><select id="mapSel">${mapOptions()}</select><div class="muted small" id="mapInfo">${esc((C.maps.find(m => m.id === store.mapId) || C.maps[0]).description || '')}</div>
      <label>Monsters (EP budget = ${staged.length || 0} PCs × (Level ${lvl} + ${C.epBudgetLevelAdd ?? 2}) = <b id="lobbyBudget">${C.epBudget(staged.length, lvl)}</b>)</label>
      <div class="toggle" id="encToggle"><button data-enc="random" class="${store.encMode !== 'custom' ? 'on' : ''}">Random</button><button data-enc="custom" class="${store.encMode === 'custom' ? 'on' : ''}">DM's encounter</button></div>
      ${store.encMode === 'custom' ? `<div class="enc-sum">${encSummary(staged.length, lvl)}</div>`
        : `<select id="poolSel">${Object.keys(C.encounterPools).map(p => `<option ${p === store.pool ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>`}
      <button id="dmSetup">🐉 DM setup: pick creatures</button>
      <label>Who runs the monsters?</label>
      <div class="toggle" id="dmToggle"><button data-dm="auto" class="${store.dmMode === 'auto' ? 'on' : ''}">Auto DM</button><button data-dm="human" class="${store.dmMode === 'human' ? 'on' : ''}">Human DM</button></div>
      <button id="joinTable" class="primary big everyone" ${staged.length ? '' : 'disabled title="Stage at least one character first"'}>⚔ Join table${staged.length ? ` (${staged.length} hero${staged.length > 1 ? 'es' : ''} + DM)` : ''}</button>
    </section>
  </div>`;
  const stage = id => { if (C.maxHeroes && store.seats.length >= C.maxHeroes && !store.seats.includes(id)) { toast(`The Staging Area is full: up to ${C.maxHeroes} characters.`); showLobby(); return; }
    if (!store.seats.includes(id) && isPlayable(store.characters.find(c => c.id === id)?.style)) { store.seats.push(id); save(); } showLobby(); };
  const unstage = id => { store.seats = store.seats.filter(x => x !== id); save(); showLobby(); };
  $('#signout').onclick = showStart;
  $('#create').onclick = () => openCreator();
  $$('[data-stage]').forEach(b => b.onclick = () => stage(b.dataset.stage));
  $$('[data-unstage]').forEach(b => b.onclick = () => unstage(b.dataset.unstage));
  $$('[data-edit]').forEach(b => b.onclick = () => openCreator(store.characters.find(c => c.id === b.dataset.edit)));
  $$('[data-ctl]').forEach(b => b.onclick = () => { const [id, v] = b.dataset.ctl.split('|'); const c = store.characters.find(x => x.id === id); c.control = v; save(); showLobby(); });
  // drag and drop: catalog tile -> Staging Area; staged tile -> back to the catalog
  $$('[draggable="true"][data-char]').forEach(el => el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', (el.classList.contains('stg') ? 'out:' : 'in:') + el.dataset.char); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); }));
  const zone = (el, prefix, fn) => { el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); }); el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); const v = e.dataTransfer.getData('text/plain'); if (v.startsWith(prefix)) fn(v.slice(prefix.length)); }); };
  zone($('#staging'), 'in:', stage); zone($('#catalog'), 'out:', unstage);
  $$('.cat-tile .cardimg, .stg .cardimg').forEach(img => img.setAttribute('draggable', 'false'));
  $$('[data-delc]').forEach(b => b.onclick = async () => { const id = b.dataset.delc; const c = store.characters.find(x => x.id === id);
    if (await ask('Delete character?', `Delete <b>${esc(c.name)}</b> (L${c.level} ${esc(c.style)}) from this browser? This can't be undone.`, [{ label: 'Delete', value: true, cls: 'danger' }, { label: 'Cancel', value: false }])) {
      store.characters = store.characters.filter(x => x.id !== id); store.seats = store.seats.filter(x => x !== id); save(); showLobby(); toast(`Deleted ${c.name}.`); } });
  $('#mapSel').onchange = e => { store.mapId = e.target.value; save(); lobbyBg(); const mi = $('#mapInfo'); if (mi) mi.textContent = (C.maps.find(m => m.id === store.mapId) || {}).description || ''; };
  if ($('#poolSel')) $('#poolSel').onchange = e => { store.pool = e.target.value; save(); };
  $$('[data-enc]').forEach(b => b.onclick = () => { store.encMode = b.dataset.enc; save(); showLobby(); });
  $('#dmSetup').onclick = () => showDmSetup();
  $$('[data-dm]').forEach(b => b.onclick = () => { store.dmMode = b.dataset.dm; save(); showLobby(); });
  $('#joinTable').onclick = () => startTable();
  wireZoom();
  if (flashId) $(`.cat-tile[data-char="${flashId}"]`)?.scrollIntoView({ block: 'nearest' });
}

// =====================================================================
// SCREEN 2b: DM setup — pick the creatures for the battle
// =====================================================================
function partyInfo() {
  const seated = store.seats.map(id => store.characters.find(c => c.id === id)).filter(Boolean);
  const lvl = Math.max(1, ...seated.map(c => c.level));
  return { n: seated.length, lvl, budget: C.epBudget(seated.length, lvl) };
}
// keep only creatures still in the sheet and within each creature's QTY (sheet edits can shrink it)
function cleanItems(items) {
  const n = {}; return (items || []).filter(it => { const m = MON[it.kind]; if (!m) return false; n[it.kind] = (n[it.kind] || 0) + 1; return n[it.kind] <= m.qty; })
    .map(it => ({ kind: it.kind, label: String(it.label || '').slice(0, 32) }));
}
// v1.8 EP pricing (Malcom, OPEN): a lower-level NPC costs +1 EP per level below the party (CONFIG.npcPricing.levelGapEp)
const priceOf = (m, lvl) => !m ? 0 : m.ep + Math.max(0, (lvl || 1) - (m.level || 1)) * (C.npcPricing?.levelGapEp ?? 1);
const encEp = (items, lvl = partyInfo().lvl) => items.reduce((s, it) => s + priceOf(MON[it.kind], lvl), 0);
// encounter warnings (OPEN rules from npc_levels_v0.1 §3 / rulebook §15): shown, never enforced
function encWarnings(items, P) {
  const w = [], ms = items.map(it => MON[it.kind]).filter(Boolean); if (!ms.length || !P.n) return w;
  const ep = encEp(items, P.lvl), atLvl = ms.filter(m => (m.level || 1) === P.lvl);
  if (ms.some(m => (m.level || 1) > P.lvl)) w.push(`Above the party's Level: ${[...new Set(ms.filter(m => (m.level || 1) > P.lvl).map(m => monLabel(m)))].join(', ')} (allowed, much harder).`);
  if (C.npcPricing?.encounterLevelRule && P.lvl > 1 && (!atLvl.length || atLvl.reduce((s, m) => s + priceOf(m, P.lvl), 0) * 2 < ep)) w.push(`Encounter Level rule: a Level ${P.lvl} fight should have at least 1 Level ${P.lvl} NPC and at least half its EP at Level ${P.lvl} (OPEN).`);
  if (C.npcPricing?.soloBuysLowerOnly && P.n === 1 && atLvl.length && P.lvl > 1) w.push(`A solo hero: Malcom suggests lower-level NPCs only (a same-level NPC is a near-boss for 1 hero, OPEN).`);
  if (P.n <= 3 && ms.filter(m => (m.level || 1) === 3 && /elite|boss/i.test(m.role || '')).length >= 2) w.push('Two 2-Damage Level 3 elites/bosses against 3 or fewer heroes: Malcom says never do this (heroes win 0-16%).');
  return w;
}
function encSummary(n, lvl) {
  const items = cleanItems(store.custom.items), budget = C.epBudget(n, lvl), ep = encEp(items, lvl);
  if (!items.length) return '<span class="warn">No creatures picked yet. Open DM setup.</span>';
  const cnt = {}; items.forEach(it => cnt[it.kind] = (cnt[it.kind] || 0) + 1);
  return `${Object.entries(cnt).map(([k, v]) => `${tokenDisc(k)} ${esc(monLabel(MON[k]))}${v > 1 ? ' ×' + v : ''}`).join(' · ')}
    <div class="${ep > budget ? 'warn' : 'muted'} small">${ep}/${budget} EP${ep > budget ? ' (over budget, harder fight)' : ''}</div>`;
}
function showDmSetup() {
  document.body.className = 'lobby dmsetup'; lobbyBg();
  store.custom = { area: 'east', ...store.custom, items: cleanItems(store.custom?.items) };
  store.savedEncounters = store.savedEncounters || {};
  const P = partyInfo(), items = store.custom.items, ep = encEp(items, P.lvl), over = P.n ? ep - P.budget : 0;
  const lvTab = store.dmLevel ?? Math.min(3, Math.max(1, P.lvl || 1)), warns = encWarnings(items, P);
  const shown = window.MONSTERS_L1.filter(m => lvTab === 'all' || (m.level || 1) === +lvTab);
  const count = k => items.filter(it => it.kind === k).length;
  const pct = P.budget ? Math.min(100, ep / P.budget * 100) : (ep ? 100 : 0);
  const saved = Object.keys(store.savedEncounters).sort();
  const num = {};
  app.innerHTML = `<header class="topbar"><b>Adventures Inc</b><span>DM setup · signed in as <b>${esc(store.current)}</b></span><button id="dmBack">← Waiting room</button></header>
  <div class="dm-grid">
    <section class="panel parchment roster"><h2>Creatures <span class="muted small">Level 1-3 NPCs (Core Stats sheet)</span></h2>
      <div class="lvtabs" id="lvTabs">${['all', 1, 2, 3].map(v => `<button class="small ${String(lvTab) === String(v) ? 'on' : ''}" data-lv="${v}">${v === 'all' ? 'All levels' : 'Level ' + v} <span class="muted">${v === 'all' ? window.MONSTERS_L1.length : window.MONSTERS_L1.filter(m => (m.level || 1) === v).length}</span></button>`).join('')}</div>
      <div class="muted small">Cards: ${esc(window.NPC_META?.file || '')} ${esc((window.NPC_META?.version || '').split(' - ')[0])} · click a card to zoom.${(window.NPC_META?.diffs || []).length ? ` <span class="warn">NPC deck differs from Core Stats (deck used): ${esc(window.NPC_META.diffs.join('; '))}</span>` : ''}</div>
      <div class="ctiles">${shown.map(m => { const n = count(m.name), pr = priceOf(m, P.lvl), nc = npcCardOf(m.name), fxn = nc && window.NPC_FX[nc.id];
        return `<div class="ctile ${n ? 'picked' : ''} lv${m.level || 1}" data-kind="${esc(m.name)}" data-level="${m.level || 1}">
          ${m.card && CARD[m.card] ? `<img class="cardimg ctcard" src="${CARD[m.card].img}" data-zoom="${m.card}" alt="${esc(monLabel(m))} card" title="Zoom: ${esc(CARD[m.card].text)}">` : ''}
          <div class="ct-head">${tokenDisc(m.name)}<div><b>${esc(monLabel(m))}</b>${m.display && m.display !== m.name ? `<div class="muted small" title="Spelling in the sheet">sheet: ${esc(m.name)}</div>` : ''}</div><span class="ep" title="${pr !== m.ep ? `${m.ep} EP + ${pr - m.ep} (Level ${m.level} NPC in a Level ${P.lvl} fight: +1 EP per level below, Malcom, OPEN)` : 'EP cost'}">${pr} EP${pr !== m.ep ? `<small> (${m.ep}+${pr - m.ep})</small>` : ''}</span></div>
          <div class="ct-badges"><span class="st lvl">L${m.level || 1}</span>${m.role && !/^L\d$/.test(m.role) ? `<span class="st role" title="${esc(m.role)}">${esc(m.role.replace(/\s*\(.*\)$/, ''))}</span>` : ''}<span class="st tac" title="Auto DM tactic">${esc(m.tactic || 'Charger')}</span>${fxn?.la ? `<span class="st la" title="Legendary Action: ${esc(fxn.la.text)}">⚡ ${esc(fxn.la.name)}</span>` : ''}</div>
          <div class="ct-stats"><span title="Life">❤ ${m.life}</span><span title="Speed">🏃 ${m.speed}</span><span title="Toughness">🛡️ ${m.tough}</span><span title="Attack">⚔ ${m.atk}</span><span title="Resilience">✦ ${m.res}</span><span title="Skill">★ ${m.skill}</span></div>
          ${nc ? `<div class="ct-abil small">${npcAttackOptions(m.name, nc).map(o => `<b title="${esc(o.type || '')}">${o.melee ? '⚔' : o.spell ? '🔥' : '🏹'} ${esc(o.name)}</b> ${o.melee ? 'melee' : `R${o.range}`}${o.area ? ' area' : ''} ${o.noDamage ? '(no Dmg)' : o.dmg + ' Dmg'}`).join(' / ')}${nc.abilities.map(a => { const pa = parseNpcAbility(a); return ` · <span class="st ab ${pa.def.auto === false ? 'partial' : ''}" title="${esc(pa.def.note || '')}">${esc(pa.def.badge || a)}</span>`; }).join('')}</div>` : ''}
          <div class="ct-qty"><button class="small" data-minus="${esc(m.name)}" ${n ? '' : 'disabled'}>−</button><b class="cnt">${n}</b><span class="muted">/ ${m.qty}</span><button class="small" data-plus="${esc(m.name)}" ${n >= m.qty ? 'disabled title="QTY limit reached"' : ''}>+</button></div>
        </div>`; }).join('')}</div>
    </section>
    <section class="panel parchment encpanel"><h2>This encounter</h2>
      <div class="epmeter ${over > 0 ? 'over' : ''}" id="epMeter"><div class="bar"><i style="width:${pct}%"></i></div>
        <div><b id="epSpent">${ep}</b> / <b id="epBudget">${P.budget}</b> EP <span class="muted small">(budget = ${P.n} PCs × (Level ${P.lvl} + ${C.epBudgetLevelAdd ?? 2}))</span></div>
        ${over > 0 ? `<div class="warn" id="epWarn">⚠ Over budget by ${over} EP. Allowed: this will be a harder fight.</div>` : P.n ? '' : '<div class="muted small">Stage heroes in the waiting room to set the budget.</div>'}
        ${warns.map(x => `<div class="warn small encwarn">⚠ ${esc(x)}</div>`).join('')}
        <div class="muted small">Prices: Level ${P.lvl} party; lower-level NPCs cost +${C.npcPricing?.levelGapEp ?? 1} EP per level below (Malcom, OPEN).</div></div>
      <div class="btnrow"><button id="encRandom">🎲 Random encounter</button><button id="encClear" class="danger" ${items.length ? '' : 'disabled'}>Clear</button></div>
      <label class="small muted">Random encounters use the pool: <select id="dmPool">${Object.keys(C.encounterPools).map(p => `<option ${p === store.pool ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <div class="enclist">${items.length ? items.map((it, i) => { num[it.kind] = (num[it.kind] || 0) + 1; const m = MON[it.kind];
        return `<div class="encrow">${tokenDisc(it.kind, creatureToken(it.kind).tag + num[it.kind])}<input data-rename="${i}" value="${esc(it.label)}" maxlength="32" placeholder="${esc(monLabel(m))} ${num[it.kind]}" title="Optional name, e.g. Grak the Troll"><span class="muted small">L${m.level || 1} · ${priceOf(m, P.lvl)} EP</span><button class="small" data-del="${i}" title="Remove">✕</button></div>`; }).join('')
        : '<p class="muted">Pick creatures with + on the left, or roll a random encounter.</p>'}</div>
      <label>Starting area <span class="muted small">(drag tokens to exact hexes at the table before Start Battle)</span></label>
      <select id="encArea">${Object.entries(C.monsterAreas).map(([k, a]) => `<option value="${k}" ${k === store.custom.area ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <h3>Saved encounters</h3>
      <div class="row"><input id="encName" placeholder="Name this encounter" maxlength="40"><button id="encSave" ${items.length ? '' : 'disabled'}>💾 Save encounter</button></div>
      ${saved.length ? `<div class="row"><select id="encLoadSel">${saved.map(n => `<option>${esc(n)}</option>`).join('')}</select><button id="encLoad">Load</button><button id="encDelSaved" class="danger">Delete</button></div>` : '<p class="muted small">No saved encounters yet.</p>'}
      <button id="encUse" class="primary big" ${items.length && P.n ? '' : 'disabled'}>Use this encounter → game table</button>
      ${P.n ? '' : '<div class="muted small">Stage at least one hero to play.</div>'}
    </section>
  </div>`;
  const commit = () => { save(); showDmSetup(); };
  wireZoom(app);
  $('#dmBack').onclick = () => showLobby();
  $$('[data-lv]').forEach(b => b.onclick = () => { store.dmLevel = b.dataset.lv === 'all' ? 'all' : +b.dataset.lv; commit(); });
  $$('[data-plus]').forEach(b => b.onclick = () => { const k = b.dataset.plus; if (count(k) < MON[k].qty) { items.push({ kind: k, label: '' }); store.encMode = 'custom'; } commit(); });
  $$('[data-minus]').forEach(b => b.onclick = () => { const k = b.dataset.minus; const i = items.map(it => it.kind).lastIndexOf(k); if (i >= 0) items.splice(i, 1); commit(); });
  $$('[data-del]').forEach(b => b.onclick = () => { items.splice(+b.dataset.del, 1); commit(); });
  $$('[data-rename]').forEach(inp => inp.onchange = () => { items[+inp.dataset.rename].label = inp.value.trim(); save(); });
  $('#encRandom').onclick = () => { const e = buildEncounter(P.n || 1, P.lvl); store.custom.items = e.list.map(m => ({ kind: m.name, label: '' })); store.encMode = 'custom'; commit(); };
  $('#encClear').onclick = () => { store.custom.items = []; commit(); };
  $('#dmPool').onchange = e => { store.pool = e.target.value; save(); };
  $('#encArea').onchange = e => { store.custom.area = e.target.value; save(); };
  $('#encSave').onclick = () => { const n = $('#encName').value.trim(); if (!n) { $('#encName').classList.add('err'); $('#encName').focus(); return; }
    store.savedEncounters[n] = { items: items.map(it => ({ ...it })), area: store.custom.area, savedAt: new Date().toISOString() }; commit(); toast(`Saved "${n}".`); };
  if ($('#encLoad')) {
    $('#encLoad').onclick = () => { const s = store.savedEncounters[$('#encLoadSel').value]; if (!s) return;
      const before = (s.items || []).length; store.custom = { items: cleanItems(s.items), area: C.monsterAreas[s.area] ? s.area : 'east' }; store.encMode = 'custom'; commit();
      if (store.custom.items.length < before) toast('Some creatures were dropped: no longer in the sheet or over QTY.'); };
    $('#encDelSaved').onclick = async () => { const n = $('#encLoadSel').value;
      if (await ask('Delete saved encounter?', `Delete <b>${esc(n)}</b>?`, [{ label: 'Delete', value: true, cls: 'danger' }, { label: 'Cancel', value: false }])) { delete store.savedEncounters[n]; commit(); } };
  }
  $('#encUse').onclick = () => { store.encMode = 'custom'; save(); startTable(); };
}

// =====================================================================
// Character creation dialog
// =====================================================================
function openCreatorLegacy(edit) {   // pre-v1.12 step creator: only for the older regression tests (localStorage adventuresInc.legacyPool = 1)
  const d = edit ? { type: edit.type || typeOfStyle(edit.style), level: edit.level, style: edit.style, classCard: edit.classCard, equipment: [...edit.equipment], abilities: [...edit.abilities], spells: [...(edit.spells || [])], powerups: [...edit.powerups], name: edit.name }
    : { type: 'Fighter', level: 1, style: 'Warrior', classCard: classCardOf('Warrior')?.id, equipment: [], abilities: [], spells: [], powerups: [], name: '' };
  let step = 0;
  const m = modal('<div id="cr"></div>', 'creator');
  const close = () => m.remove();
  const P = () => ((LEGACYPOOL() && C.picksLegacy) || C.picks)[d.type][d.level];
  const deck = () => window.GROUP_POOL && !LEGACYPOOL() ? window.GROUP_POOL(d.type).map(id => CARD[id]).filter(Boolean) : isPlayable(d.style) ? window.DECKS[d.style] : [];   // v1.11.1: the whole Class deck (v0.3) is the pick pool
  const pool = t => deck().filter(c => c.type === t && c.level <= d.level);
  // the steps depend on the Type: casters and hybrids pick Spells too
  const STEPS = () => [{ k: 'style', label: 'Class & Level' }, { k: 'equipment', t: 'Equipment', label: 'Equipment' }, { k: 'abilities', t: 'Ability', label: 'Abilities' },
    ...(P().spells ? [{ k: 'spells', t: 'Spell', label: 'Spells' }] : []), { k: 'powerups', t: 'Power-up', label: 'Power-ups' }, { k: 'name', label: 'Name & save' }];
  const needOf = k => ({ equipment: P().equipment, abilities: P().abilities, spells: P().spells, powerups: P().deck })[k];
  function render() {
    const steps = STEPS(), S = steps[step], p = P(); let body = '', ok = true, msg = '';
    if (S.k === 'style') {
      body = `<div class="cr-cols"><div><label>Class</label><div class="toggle" id="crClass">${Object.keys(C.styles).map(t => `<button data-type="${t}" class="${d.type === t ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label>Level</label><div class="toggle">${[1, 2, 3].map(l => `<button data-lvl="${l}" class="${d.level === l ? 'on' : ''}">Level ${l}</button>`).join('')}</div>
        <label>Character card <span class="muted small">(sets your class card and base stats; every card in the ${d.type} deck is open to you)</span></label><div class="styles">${C.styles[d.type].map(s => `<button data-style="${s}" class="style ${d.style === s ? 'on' : ''}" ${isPlayable(s) ? '' : 'disabled'}>${s}${isPlayable(s) ? `<small class="ver">${esc((window.DECK_META[s].version.match(/v[\d.]+/) || [''])[0])}${window.DECK_META[s].complete ? '' : ' · some text cards'}</small>` : '<small>coming soon</small>'}</button>`).join('')}</div>
        <div class="picks-summary">Level ${d.level} ${d.type}: <b>${p.equipment}</b> Equipment, <b>${p.abilities}</b> Abilities${p.spells ? `, <b>${p.spells}</b> Spells` : ''}, <b>${p.deck}</b>-card power-up deck, ${p.slots} slots, draw/play ${p.draw}/${p.play} per turn.</div>
        ${d.type === 'Caster' ? '<p class="muted small">Casters attack with their spells (no basic attack).</p>' : ''}</div>
        ${isPlayable(d.style) ? `<div><label>Character card (pick a look)</label><div class="looks">${(classCardOf(d.style).looks || [classCardOf(d.style).id]).map(id => `<img src="${IMGV(`img/cards/${id}.jpg`)}" class="look ${d.classCard === id ? 'on' : ''}" data-look="${id}">`).join('')}</div></div>` : ''}</div>`;
      ok = isPlayable(d.style); if (!ok) msg = 'That Style\'s deck isn\'t in the shared folder yet (coming soon).';
    } else if (S.t) {
      const need = needOf(S.k), list = pool(S.t);
      const sel = d[S.k];
      const cap = S.k === 'equipment' || S.k === 'abilities' ? capCheck([...d.equipment, ...d.abilities], d.level) : { ok: true };
      body = `<div class="pick-head">Pick <b>${need}</b> ${S.k === 'abilities' ? 'Abilities' : S.k === 'spells' ? 'Spells' : S.t + (S.k === 'powerups' ? 's for your draw deck' : '')} — selected <b class="${sel.length === need ? 'good' : ''}" id="pickCount">${sel.length}/${need}</b>
        ${S.k === 'powerups' ? `<span class="muted" id="copyRule"> · You may take the same power-up more than once: up to <b>${copiesMax(d.level)}</b> copies of a card at Level ${d.level} (user rule). Click a card to add a copy, − to remove one.</span>` : ''}
        ${S.k === 'spells' ? '<span class="muted"> · Spells are picked, not drawn: cast one, it flips face down, and it flips back up at the start of your next turn.</span>' : ''}
        ${C.statCap[d.level] != null && (S.k === 'equipment' || S.k === 'abilities') ? `<span class="muted"> · Level 1 cap: Equipment + Abilities add at most +${C.statCap[d.level]} to any stat.</span>` : ''}</div>
        <div class="pick-grid">${list.map(c => `<div class="pick ${sel.includes(c.id) ? 'on' : ''}" data-pick="${c.id}">${S.k === 'powerups' && sel.includes(c.id) ? `<span class="copies" data-copies="${sel.filter(x => x === c.id).length}">×${sel.filter(x => x === c.id).length}</span><button class="pminus" data-pminus="${c.id}" title="Remove one copy">−</button>` : ''}<img src="${c.img}" alt="${esc(c.name)}" title="${esc(c.name)}: ${esc(c.text)}">${c.textOnly ? '<span class="tonly" title="Text only: the site does not run this card yet. You can still pick it and play it by hand.">text only</span>' : ''}<button class="zoombtn" data-zoom="${c.id}" title="View larger">🔍</button>${c.level > 1 ? `<span class="lvl">L${c.level}</span>` : ''}${isOnce(c.id) && S.k === 'spells' ? '<span class="once">1/fight</span>' : ''}</div>`).join('')}</div>`;
      ok = sel.length === need && cap.ok;
      if (sel.length !== need) msg = `Pick ${need - sel.length > 0 ? need - sel.length + ' more' : sel.length - need + ' fewer'}.`;
      if (!cap.ok) msg = `Stat cap: ${cap.over.map(k => STATN[k] + ' +' + cap.totals[k]).join(', ')} is over +${cap.cap}. Swap a card.`;
      const two = d.equipment.filter(id => FX[id]?.weapon?.hands === 2).length, sh = d.equipment.filter(id => FX[id]?.shield).length;
      if (S.k === 'equipment' && two && sh) msg += (msg ? ' ' : '') + 'Heads-up: a two-handed weapon can\'t be used with a shield (proposed gear rule). You can still save.';
    } else {
      const b = cardBonuses([...d.equipment, ...d.abilities]), base = levelBase(d.type, d.level, d.style), b1 = levelBase(d.type, 1, d.style);
      body = `<div class="cr-cols"><div><label>Character name</label><input id="cname" value="${esc(d.name)}" maxlength="24" placeholder="e.g. Brakka Ironside">
        <div class="statgrid" id="sheetStats">${Object.keys(base).map(k => { const g = base[k] - b1[k]; return `<div data-stat="${k}"><span>${STATN[k]}</span><b>${base[k] + b[k]}</b>${g || b[k] ? `<small>${b1[k]}${g ? ` +${g} (L${d.level})` : ''}${b[k] ? ` ${b[k] > 0 ? '+' : ''}${b[k]} cards` : ''}</small>` : ''}</div>`; }).join('')}</div>
        ${d.level > 1 ? `<p class="small growth" id="growthNote">Level ${d.level}: +${d.level - 1} Life, +${d.level - 1} Attack, +${d.level - 1} Skill from leveling (user rule).</p>` : ''}
        ${atkLinesHtml(atkSummary(base.atk + b.atk, [...d.equipment, ...d.abilities], d.type), 'sheet')}
        <p class="muted small">The Attack tile is your base Attack. The ⚔ lines show the full bonus for each kind of attack (weapon + passive cards like Weapon Training).</p></div>
        <div class="mini-cards">${[d.classCard, ...d.equipment, ...d.abilities, ...d.spells].map(id => cardImg(id)).join('')}</div></div>`;
      ok = true;
    }
    const last = step === steps.length - 1;
    $('#cr', m).innerHTML = `<div class="cr-head"><h2>${edit ? 'Edit ' + esc(edit.name) : 'Create character'}</h2><ol class="steps">${steps.map((s, i) => `<li class="${i === step ? 'on' : i < step ? 'done' : ''}">${s.label}</li>`).join('')}</ol></div>
      <div class="cr-body">${body}</div>
      <div class="cr-foot"><span class="msg">${esc(msg)}</span><button id="crCancel">Cancel</button>${step ? '<button id="crBack">Back</button>' : ''}
      <button id="crNext" class="primary" ${ok ? '' : 'disabled'}>${last ? (edit ? 'Save changes' : 'Save character') : 'Next'}</button></div>`;
    $('#crCancel', m).onclick = close;
    if (step) $('#crBack', m).onclick = () => { step--; render(); };
    $('#crNext', m).onclick = () => {
      if (last) { d.name = $('#cname', m).value.trim() || d.style; finish(); return; }
      step++; render();
    };
    $$('[data-type]', m).forEach(b => b.onclick = () => { d.type = b.dataset.type; d.style = C.styles[d.type].find(isPlayable) || C.styles[d.type][0]; d.classCard = classCardOf(d.style)?.id; reset(); render(); });
    $$('[data-lvl]', m).forEach(b => b.onclick = () => { d.level = +b.dataset.lvl; trim(); render(); });
    $$('[data-style]', m).forEach(b => b.onclick = () => { if (d.style !== b.dataset.style) { d.style = b.dataset.style; d.classCard = classCardOf(d.style)?.id; if (!window.GROUP_POOL || LEGACYPOOL()) reset(); } render(); });
    $$('[data-look]', m).forEach(b => b.onclick = () => { d.classCard = b.dataset.look; render(); });
    $$('[data-pick]', m).forEach(el => el.onclick = () => {
      const key = S.k, need = needOf(key), id = el.dataset.pick;
      const a = d[key]; const i = a.indexOf(id);
      if (key === 'powerups') {   // v1.11 user rule: repeats allowed (2 / 3 / 4 copies at Level 1 / 2 / 3)
        const n = a.filter(x => x === id).length;
        if (n < copiesMax(d.level) && a.length < need) a.push(id);
        else if (n >= copiesMax(d.level)) toast(`At most ${copiesMax(d.level)} copies of one power-up at Level ${d.level}. Use − to remove one.`);
        else if (n) toast(`Your deck is full (${need}). Use − on a card to make room.`);
        else { a.shift(); a.push(id); }
      } else
      if (i >= 0) a.splice(i, 1); else if (a.length < need) a.push(id); else { a.shift(); a.push(id); }
      render();
    });
    $$('[data-pminus]', m).forEach(b => b.onclick = e => { e.stopPropagation(); const a = d.powerups, i = a.lastIndexOf(b.dataset.pminus); if (i >= 0) a.splice(i, 1); render(); });
    if (S.k === 'name') $('#cname', m).focus();
    wireZoom(m);
  }
  function reset() { d.equipment = []; d.abilities = []; d.spells = []; d.powerups = []; }
  function trim() { ['equipment', 'abilities', 'spells', 'powerups'].forEach(k => { d[k] = d[k].filter(id => CARD[id] && CARD[id].level <= d.level).slice(0, needOf(k) || 0); });
    const seen = {}; d.powerups = d.powerups.filter(id => (seen[id] = (seen[id] || 0) + 1) <= copiesMax(d.level)); }
  function finish() {
    const fields = { name: d.name, type: d.type, style: d.style, level: d.level, classCard: d.classCard, equipment: d.equipment, abilities: d.abilities, spells: d.spells, powerups: d.powerups, v03: (edit && edit.v03) || { at: new Date().toISOString(), created: true, merged: [], dropped: [], added: [] } };
    let id;
    if (edit) { const c = store.characters.find(x => x.id === edit.id); Object.assign(c, fields, { edited: new Date().toISOString() }); id = c.id; }
    else { id = uid(); store.characters.push({ id, owner: store.current, ...fields, created: new Date().toISOString() }); }
    save(); close(); showLobby(id);
    toast(edit ? `Saved changes to ${d.name}.` : `${d.name} added to the Character Catalog.`);
  }
  render();
}

// =====================================================================
// v1.12.0 CHARACTER CREATOR — three screens (slides 2-12): deck backs → hero cards → level picks (+ Spells screen for Casters/Hybrids).
// Every pool, pick count, swap limit and copy limit comes from js/creator_pools.js (tools/build_creator_pools.py reads Malcom's grid).
// Level-up model (brief v0.4): at level L you ADD the level's picks from any level you can reach (this level's cards by default, "earlier
// levels" shows the rest) and may REPLACE (drop) older cards of that type; Caster spells must drop 1 at L2/L3 (Wizard 3 → 4 → 5 known).
// Power-ups: deck of 10 at L1 (max 2 copies); at L2/L3 add up to the swap limit and drop the same number so the deck stays 10.
// The saved character keeps the old shape (equipment/abilities/spells/powerups/level) plus build = { v:112, add, drop } for re-editing.
// =====================================================================
const CPOOL = window.CREATOR_POOLS;
const CGROUPS = ['equipment', 'abilities', 'powerups', 'spells'];
const CGLBL = { equipment: 'Equipment', abilities: 'Abilities', powerups: 'Power-Ups', spells: 'Spells' };
const CGTY = { equipment: 'equip', abilities: 'abil', powerups: 'pu', spells: 'spell' };
const emptyLv = () => ({ equipment: [], abilities: [], powerups: [], spells: [] });
const gridCard = (type, id) => CPOOL.cards.find(c => c.cls === type && c.id === id);
const gridLevel = (type, id) => gridCard(type, id)?.level ?? CARD[id]?.level ?? 1;
const groupOfType = t => ({ Equipment: 'equipment', Ability: 'abilities', 'Power-up': 'powerups', Spell: 'spells' })[t];
// a saved character without a build (made before v1.12) gets one from its cards: each card goes in at its level (nothing is lost)
function buildFromChar(ch) {
  const type = ch.type || typeOfStyle(ch.style), lv = Math.max(1, Math.min(3, ch.level || 1)), add = { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() };
  for (const g of CGROUPS) for (const id of ch[g] || []) add[Math.max(1, Math.min(lv, gridLevel(type, id)))][g].push(id);
  return { v: 112, add, drop: { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }, migrated: true };
}
function migrateV112() {
  if (!CPOOL) return 0; let n = 0;
  for (const ch of store.characters) if (!ch.build) { ch.build = buildFromChar(ch); n++; }
  if (n) save(); return n;
}
function openCreator(edit) {
  if (!CPOOL || LEGACYUI()) return openCreatorLegacy(edit);
  const b0 = edit ? JSON.parse(JSON.stringify(edit.build || buildFromChar(edit))) : null;
  const d = { type: edit ? edit.type || typeOfStyle(edit.style) : null, style: edit?.style || null, classCard: edit?.classCard || null, name: edit?.name || '',
    level: 1, screen: edit ? 'cards' : 'deck', add: b0?.add || { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }, drop: b0?.drop || { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }, earlier: { spells: true } };   // spells: any level reached is shown by default
  for (const L of [1, 2, 3]) { d.add[L] = { ...emptyLv(), ...(d.add[L] || {}) }; d.drop[L] = { ...emptyLv(), ...(d.drop[L] || {}) }; }
  const m = modal('<div id="cr2" class="cr2"></div>', 'creator2'); const root = $('#cr2', m);
  const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
  const PK = L => CPOOL.picks[d.type][L], DROP = (L, g) => CPOOL.mustDrop?.[d.type]?.[L]?.[g] || 0, MAXC = CPOOL.maxCopies || 2, DECK = CPOOL.deckSize || 10;
  const hasSpells = () => !!(d.type && PK(1).spells);
  const take = (arr, rm) => { const a = [...arr]; for (const x of rm) { const i = a.indexOf(x); if (i >= 0) a.splice(i, 1); } return a; };
  const held = (L, g) => { let a = []; for (let l = 1; l <= L; l++) a = [...take(a, d.drop[l][g]), ...d.add[l][g]]; return a; };
  const pool = (L, g, earlier) => CPOOL.cards.filter(c => c.cls === d.type && c.type === g && (earlier ? c.level <= L : c.level === L) && CARD[c.id])   // v1.13 note 3 (THE KEY RULE): every hero of a Class picks from the WHOLE Class deck; only the level matters
    .map(c => c.id).filter((id, i, a) => a.indexOf(id) === i);
  const need = (L, g) => { const n = g === 'powerups' && L === 1 ? DECK : (PK(L)[g] || 0); if (g === 'powerups') return n;
    const avail = pool(L, g, true).filter(id => !held(L - 1, g).includes(id)).length; return Math.min(n, avail); };
  const full = (L, g) => d.add[L][g].length >= need(L, g);
  const done = (L, g) => { const a = d.add[L][g].length, r = d.drop[L][g].length;
    if (g === 'powerups') return L === 1 ? a === DECK : held(L, g).length === DECK && a <= need(L, g);
    if (g === 'spells') return a === need(L, g) && r === Math.min(DROP(L, g), held(L - 1, g).length);
    return a === need(L, g) && r >= Math.min(DROP(L, g), held(L - 1, g).length) && r <= a; };
  const groupsOf = scr => scr === 'spells' ? ['spells'] : ['equipment', 'abilities', 'powerups'];
  const lvDone = (L, scr) => (scr === 'all' ? [...groupsOf('cards'), ...(hasSpells() ? ['spells'] : [])] : groupsOf(scr)).every(g => done(L, g));
  const upTo = (L, scr) => [1, 2, 3].filter(l => l <= L).every(l => lvDone(l, scr));
  // keep later levels consistent after an earlier level changes
  function sanitize() { for (const g of CGROUPS) for (const L of [1, 2, 3]) {
    if (g === 'spells' && !DROP(L, g)) d.drop[L][g] = [];   // only Casters replace spells
    const before = held(L - 1, g);
    d.drop[L][g] = d.drop[L][g].filter((id, i, a) => a.slice(0, i + 1).filter(x => x === id).length <= before.filter(x => x === id).length);
    if (g !== 'powerups') d.add[L][g] = d.add[L][g].filter((id, i, a) => !take(before, d.drop[L][g]).includes(id) && a.indexOf(id) === i);
    else d.add[L][g] = d.add[L][g].filter((id, i, a) => held(L - 1, g).filter(x => x === id).length - d.drop[L][g].filter(x => x === id).length + a.slice(0, i + 1).filter(x => x === id).length <= MAXC);
  } }
  const copies = (L, id) => held(L, 'powerups').filter(x => x === id).length;
  function pick(id, g, on) {   // on: true add / false remove one / undefined toggle
    const L = d.level, a = d.add[L][g], has = a.includes(id);
    if (g === 'powerups') {
      if (on === false) { const i = a.lastIndexOf(id); if (i >= 0) a.splice(i, 1); return true; }
      if (copies(L, id) >= MAXC) { toast(`At most ${MAXC} copies of one Power-Up.`); return false; }
      if (a.length >= need(L, g)) { toast(L === 1 ? `Your Power-Up deck is full (${DECK}). Remove one first.` : `Level ${L}: swap up to ${need(L, g)} Power-Ups. Remove one first.`); return false; }
      a.push(id); return true;
    }
    if (has && on !== true) { a.splice(a.indexOf(id), 1); return true; }
    if (has) return true; if (on === false) return false;
    if (held(L - 1, g).includes(id)) { toast(d.drop[L][g].includes(id) ? 'That card is being replaced: pick a different one.' : 'You already have that card.'); return false; }
    if (a.length >= need(L, g)) { toast(`${CGLBL[g]}: ${need(L, g)} pick${need(L, g) > 1 ? 's' : ''} at Level ${L}. Remove one first.`); return false; }
    a.push(id); return true;
  }
  function toggleDrop(id, g) { const L = d.level, r = d.drop[L][g], i = r.indexOf(id);
    if (i >= 0) { r.splice(i, 1); return; }
    if (g === 'spells' && !DROP(L, g)) { toast(`${d.type}s never swap spells: they keep every spell they know.`); return; }   // ruling: only Casters replace a spell
    if (g === 'spells' && r.length >= DROP(L, g)) { toast(`Level ${L}: replace exactly ${DROP(L, g)} spell.`); return; }
    const lim = g === 'powerups' ? need(L, g) : d.add[L][g].length || need(L, g);
    if (r.length >= lim) { toast(g === 'powerups' ? `Level ${L}: swap up to ${need(L, g)} Power-Ups.` : 'Each new pick can replace one older card.'); return; }
    r.push(id); }
  // ---------- zoom (up to 90% of the screen; ‹ › step through the group) ----------
  let Z = null;
  function zoom(list, i, kind, g) { Z = { list, i, kind, g }; drawZoom(); }
  function drawZoom() {
    $('.cz', m)?.remove(); if (!Z) return; const id = Z.list[Z.i], c = CARD[id]; if (!c) return;
    let acts = '';
    if (Z.kind === 'hero') acts = `<button class="primary big" id="czSelect">Select ${esc(c.name)}</button>`;
    else if (Z.kind === 'pool' && Z.g === 'powerups') { const n = d.add[d.level].powerups.filter(x => x === id).length;
      acts = `<div class="czqty">Copies this level: ${[0, 1, 2].map(q => `<button data-czq="${q}" class="${n === q ? 'on' : ''}">${q}</button>`).join('')}</div>`; }
    else if (Z.kind === 'pool') { const on = d.add[d.level][Z.g].includes(id); acts = `<button class="primary big" id="czPick">${on ? 'Remove' : 'Select'}</button>`; }
    const div = document.createElement('div'); div.className = 'cz';
    div.innerHTML = `<button class="cznav" id="czPrev" ${Z.list.length > 1 ? '' : 'disabled'}>‹</button><figure><img src="${c.imgFull || c.img}" alt="${esc(c.name)}"><div class="czside"><figcaption>${esc(c.name)}${c.textOnly ? ' · <i>text only (not yet playable)</i>' : ''} · ${Z.i + 1}/${Z.list.length}</figcaption><div class="czacts">${acts}<button id="czClose">Close</button></div></div></figure><button class="cznav" id="czNext" ${Z.list.length > 1 ? '' : 'disabled'}>›</button>`;
    m.appendChild(div);
    div.onclick = e => { if (e.target === div) { Z = null; drawZoom(); } };
    $('#czClose', div).onclick = () => { Z = null; drawZoom(); };
    $('#czPrev', div).onclick = () => { Z.i = (Z.i - 1 + Z.list.length) % Z.list.length; drawZoom(); };
    $('#czNext', div).onclick = () => { Z.i = (Z.i + 1) % Z.list.length; drawZoom(); };
    if ($('#czSelect', div)) $('#czSelect', div).onclick = () => { const st = Object.keys(CPOOL.heroOrder).length && heroStyles().find(s => classCardOf(s)?.id === id);
      if (st !== d.style) { d.add = { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }; d.drop = { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }; }
      d.style = st; d.classCard = id; d.level = 1; d.screen = 'cards'; Z = null; drawZoom(); render(); };
    if ($('#czPick', div)) $('#czPick', div).onclick = () => { pick(id, Z.g); sanitize(); render(); drawZoom(); };
    $$('[data-czq]', div).forEach(bt => bt.onclick = () => { const q = +bt.dataset.czq, a = d.add[d.level].powerups; let n = a.filter(x => x === id).length;
      while (n > q) { a.splice(a.lastIndexOf(id), 1); n--; } while (n < q && pick(id, 'powerups', true)) n++; render(); drawZoom(); });
  }
  const onKey = e => { if (!document.body.contains(m)) return document.removeEventListener('keydown', onKey);
    if (!Z) return; if (e.key === 'Escape') { Z = null; drawZoom(); } else if (e.key === 'ArrowRight') $('#czNext', m)?.click(); else if (e.key === 'ArrowLeft') $('#czPrev', m)?.click(); };
  document.addEventListener('keydown', onKey);
  const heroStyles = () => CPOOL.heroOrder[d.type].filter(s => classCardOf(s));
  const img = (id, cls = '', attrs = '') => `<img class="crc ty-${tyOf(id)} ${cls}" src="${CARD[id].img}" alt="${esc(CARD[id].name)}" title="${esc(CARD[id].name)}: ${esc(CARD[id].text)}" ${attrs}>`;
  // v1.13 note 11: cards scale to fill their area. For each box, choose the number of rows that gives the biggest card that still fits.
  // Cards in a row may overlap (each card shows at least `vis` of its width; hover lifts it) when that gives a bigger card.
  function fitBox(box, n, vis = 1, gap = 6, ratio = 1.4) {
    if (!box || !n) return; const W = box.clientWidth - 4, H = box.clientHeight - 4; let best = { h: 0, slot: 0, cols: 1 };
    for (let r = 1; r <= n; r++) {
      const cols = Math.ceil(n / r); let h = (H - gap * (r - 1)) / r, w = h / ratio, slot = w + gap;
      if (cols * w + (cols - 1) * gap > W) {                       // too wide side by side: overlap, or shrink if the overlap would hide too much
        slot = cols > 1 ? (W - w) / (cols - 1) : W;
        if (cols > 1 && slot < w * vis) { w = W / (1 + (cols - 1) * vis); h = w * ratio; slot = w * vis; }
        if (cols === 1) { w = Math.min(w, W); h = w * ratio; slot = w; }
      }
      if (h > best.h + 0.5) best = { h, slot, cols };
    }
    box.style.setProperty('--ch', Math.max(48, Math.floor(best.h)) + 'px');
    box.style.setProperty('--slot', Math.max(10, Math.floor(best.slot)) + 'px');
    box.style.setProperty('--cols', best.cols);
  }
  function fitCards() {
    $$('.cr2 .pfan', root).forEach(b => fitBox(b, b.querySelectorAll('.pc').length, 0.5));
    $$('.cr2 .crow', root).forEach(b => fitBox(b, b.querySelectorAll('.cslot').length, 0.45));
  }
  if (!window.__crFit) { window.__crFit = true; window.addEventListener('resize', () => { const r = document.querySelector('#cr2'); if (r && r.__fit) r.__fit(); }); }
  root.__fit = () => fitCards();
  // ---------- screens ----------
  function render() {
    sanitize();
    const top = (title, back) => `<div class="cr2-head"><h2>${title}</h2><span class="sp"></span>${back ? `<button id="crBack2">‹ Back</button>` : ''}<button id="crCancel2">Cancel</button></div>`;
    if (d.screen === 'deck') {
      root.innerHTML = top(edit ? 'Edit ' + esc(edit.name) : 'Create character — choose your deck', false) + `<div class="decks">${['Fighter', 'Caster', 'Hybrid'].map(t => `
        <button class="deckback db-${t.toLowerCase()} ${d.type === t ? 'on' : ''}" data-deck="${t}" title="${t} deck"><div class="dbface"><span class="dbname">${t}</span><span class="dborn">✦ ⚔ ✦</span><span class="dbsub">Adventures Inc</span></div>
          <img src="${IMGV(`img/decks/back_${t.toLowerCase()}.jpg`)}" alt="${t} deck" onerror="this.remove()"></button>`).join('')}</div>`;
    } else if (d.screen === 'hero') {
      root.innerHTML = top(`${d.type} — choose your hero card`, true) + `<div class="heroes" style="--n:${heroStyles().length}">${heroStyles().map(s => { const id = classCardOf(s).id; return `<figure class="herofig ${d.style === s ? 'on' : ''}" data-hero="${id}">${img(id, 'hero')}<figcaption>${esc(s)}</figcaption></figure>`; }).join('')}</div>
        <p class="muted center">Click a card to see it large, then <b>Select</b> it. Every ${d.type} hero builds from the same ${d.type} deck; the hero card gives the base stats.</p>`;
    } else {
      const L = d.level, scr = d.screen, gs = groupsOf(scr);
      const base = levelBase(d.type, L, d.style), bon = cardBonuses([...held(L, 'equipment'), ...held(L, 'abilities')]);
      const lvBtn = l => { const ok = l === 1 || upTo(l - 1, scr); return `<button data-lv="${l}" class="${l === L ? 'on' : ''}" ${ok ? '' : 'disabled title="Finish the earlier level first"'}>Level ${l}</button>`; };
      const cardsDone = lvDone(L, 'cards'), spellsDone = !hasSpells() || lvDone(L, 'spells'), allDone = upTo(L, 'all');
      const btns = scr === 'cards'
        ? `${hasSpells() ? `<button id="crSpells" class="${cardsDone ? 'ready' : ''}">Choose Spells (L${L})</button>` : ''}${L < 3 ? `<button id="crNextLv" class="${cardsDone ? 'ready' : ''}" ${cardsDone ? '' : 'disabled'}>Next Level Choices</button>` : ''}`
        : `<button id="crCardsScr">‹ Equipment, Abilities & Power-Ups</button>${L < 3 ? `<button id="crNextLv" class="${spellsDone ? 'ready' : ''}" ${spellsDone ? '' : 'disabled'}>Next Spell Level</button>` : ''}`;
      const chosen = g => { const before = held(L - 1, g), drops = d.drop[L][g], adds = d.add[L][g];
        let olds = before.map((id, i) => ({ id, dropped: before.slice(0, i + 1).filter(x => x === id).length <= drops.filter(x => x === id).length }));
        const items = [...olds.map(o => ({ ...o, old: true })), ...adds.map(id => ({ id }))].sort((a, b) => g === 'powerups' ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : 0);
        const n = held(L, g).length, tgt = g === 'powerups' ? DECK : before.length + need(L, g) - Math.max(DROP(L, g), 0);
        const st = g === 'powerups' && L > 1 ? `swapped ${adds.length}/${need(L, g)} · deck ${n}/${DECK}` : `${adds.length}/${need(L, g)} picked${L > 1 ? ` · ${drops.length} replaced${DROP(L, g) ? ` (must replace ${DROP(L, g)})` : ''}` : ''}`;
        return `<section class="chosen g-${g} ${done(L, g) ? 'done' : ''}" data-cg="${g}"><h4>${CGLBL[g]} <small>(LVL${L})</small> <span class="cnt" data-cnt="${g}">${st}</span></h4>
          <div class="crow">${items.map(o => `<div class="cslot ${o.old ? 'old' : 'new'} ${o.dropped ? 'dropped' : ''}">${img(o.id, '', `data-chz="${g}|${o.id}"`)}${o.old && L > 1 && (g !== 'spells' || DROP(L, g)) ? `<button class="small repl" data-drop="${g}|${o.id}" title="Replace this older card with one of this level's picks">${o.dropped ? '↺ Keep' : '✕ Replace'}</button>` : ''}${!o.old ? `<button class="small rm" data-rm="${g}|${o.id}" title="Remove">✕</button>` : ''}${o.old ? `<span class="lvtag">L${d.add[1][g].includes(o.id) ? 1 : 2}</span>` : ''}</div>`).join('') || '<span class="muted small">Nothing chosen yet: pick from the cards below.</span>'}</div></section>`; };
      const poolHtml = g => { const ids = pool(L, g, !!d.earlier[g] || pool(L, g).length === 0), fl = full(L, g);
        return `<div class="pgrp g-${g} ${fl ? 'full' : ''}" data-pg="${g}" style="flex:${Math.max(3, ids.length)} 1 0"><div class="plbl">${CGLBL[g]} <small>L${L}${d.earlier[g] || !pool(L, g).length ? ' + earlier' : ''} · ${ids.length} cards</small>${L > 1 ? `<label class="small"><input type="checkbox" data-earlier="${g}" ${d.earlier[g] ? 'checked' : ''}> earlier levels</label>` : ''}</div>
          <div class="pfan" style="--n:${ids.length}">${ids.map(id => { const on = d.add[L][g].includes(id), heldOld = g !== 'powerups' && held(L - 1, g).includes(id);
            const grey = !on && (fl || heldOld || (g === 'powerups' && copies(L, id) >= MAXC));
            return `<div class="pc ${on ? 'on' : ''} ${grey ? 'grey' : ''}">${img(id, '', `data-pz="${g}|${id}"`)}${CARD[id].textOnly ? '<span class="tonly">text only</span>' : ''}${g === 'powerups' && copies(L, id) ? `<span class="copies">×${copies(L, id)}</span>` : ''}</div>`; }).join('')}</div></div>`; };
      root.innerHTML = `<div class="cr2-head"><h2>${esc(d.style)} · ${scr === 'spells' ? 'Spells' : 'Cards'}</h2><div class="toggle lvtog">${[1, 2, 3].map(lvBtn).join('')}</div><span class="sp"></span>
          <button id="crBack2">‹ Hero cards</button><button id="crCancel2">Cancel</button>
          <div class="cr2-btns">${btns}<button id="crSave" class="primary ${allDone ? 'ready' : ''}" ${allDone ? '' : 'disabled title="Finish the picks of every level up to this one"'}>Save Character</button></div></div>
        <div class="cr2-main"><div class="cr2-hero"><h4>Hero Card <small>(LVL${L})</small></h4>${img(d.classCard, 'hero', `data-chz="hero|${d.classCard}"`)}
            <input id="crName" maxlength="50" placeholder="Character name" value="${esc(d.name)}">
            <div class="crstats">${Object.keys(base).map(k => `<span data-stat="${k}">${STATN[k]} <b>${base[k] + bon[k]}</b></span>`).join('')}</div></div>
          <div class="cr2-chosen">${gs.map(chosen).join('')}</div></div>
        <div class="cr2-pool">${gs.map(poolHtml).join('')}</div>`;
      $('#crName', root).oninput = e => { d.name = e.target.value; };
      $$('[data-lv]', root).forEach(bt => bt.onclick = () => { d.level = +bt.dataset.lv; render(); });
      $$('[data-pz]', root).forEach(el => el.onclick = () => { const [g, id] = el.dataset.pz.split('|'); zoom([...$$(`[data-pg="${g}"] [data-pz]`, root)].map(x => x.dataset.pz.split('|')[1]), [...$$(`[data-pg="${g}"] [data-pz]`, root)].indexOf(el), 'pool', g); });
      $$('[data-chz]', root).forEach(el => el.onclick = () => { const [g, id] = el.dataset.chz.split('|'); const l = [...$$(`[data-chz^="${g}|"]`, root)].map(x => x.dataset.chz.split('|')[1]); zoom(l, l.indexOf(id), 'view', g); });
      $$('[data-drop]', root).forEach(bt => bt.onclick = () => { const [g, id] = bt.dataset.drop.split('|'); toggleDrop(id, g); render(); });
      $$('[data-rm]', root).forEach(bt => bt.onclick = () => { const [g, id] = bt.dataset.rm.split('|'); pick(id, g, false); render(); });
      $$('[data-earlier]', root).forEach(cb => cb.onchange = () => { d.earlier[cb.dataset.earlier] = cb.checked; render(); });
      if ($('#crSpells', root)) $('#crSpells', root).onclick = () => { d.screen = 'spells'; render(); };
      if ($('#crCardsScr', root)) $('#crCardsScr', root).onclick = () => { d.screen = 'cards'; render(); };
      if ($('#crNextLv', root)) $('#crNextLv', root).onclick = () => { d.level++; render(); };
      $('#crSave', root).onclick = finish;
    }
    $('#crCancel2', root).onclick = close;
    if ($('#crBack2', root)) $('#crBack2', root).onclick = () => { d.screen = d.screen === 'hero' ? 'deck' : 'hero'; render(); };
    $$('[data-deck]', root).forEach(bt => bt.onclick = () => { if (d.type !== bt.dataset.deck) { d.type = bt.dataset.deck; d.style = null; d.add = { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }; d.drop = { 1: emptyLv(), 2: emptyLv(), 3: emptyLv() }; } d.screen = 'hero'; render(); });
    $$('[data-hero]', root).forEach(el => el.onclick = () => { const l = heroStyles().map(s => classCardOf(s).id); zoom(l, l.indexOf(el.dataset.hero), 'hero'); });
    fitCards();
  }
  function finish() {
    const L = d.level; if (!upTo(L, 'all')) return;
    const name = (d.name || '').trim() || d.style, trimL = o => ({ 1: o[1], 2: L >= 2 ? o[2] : emptyLv(), 3: L >= 3 ? o[3] : emptyLv() });
    const fields = { name, type: d.type, style: d.style, level: L, classCard: d.classCard, equipment: held(L, 'equipment'), abilities: held(L, 'abilities'), spells: held(L, 'spells'), powerups: held(L, 'powerups'),
      build: { v: 112, add: trimL(d.add), drop: trimL(d.drop) }, v03: (edit && edit.v03) || { at: new Date().toISOString(), created: true, merged: [], dropped: [], added: [] } };
    let id;
    if (edit) { const c = store.characters.find(x => x.id === edit.id); Object.assign(c, fields, { edited: new Date().toISOString() }); id = c.id; }
    else { id = uid(); store.characters.push({ id, owner: store.current, ...fields, created: new Date().toISOString() }); }
    save(); close(); showLobby(id);
    toast(edit ? `Saved changes to ${name}.` : `${name} added to the Character Catalog: drag it into the Staging Area.`);
  }
  render();
}

// =====================================================================
// HEX GRID (matches maps/hexgrid.py: pointy-top, radius 40px on 1920x1080, odd rows shifted right)
// =====================================================================
// v1.11: the grid is per map (C.mapGrids[id].hexRadius; default C.grid.hexRadius = 40 = the grid printed on the art).
// Start hexes / avoid lists / monster areas are authored on the base 40px grid and are converted by pixel position.
let GR = { ...C.grid }, HW = Math.sqrt(3) * GR.hexRadius, HH = 1.5 * GR.hexRadius, GMAX = { c: 28, r: 18 }, GK = 1;
function setGrid(map) {
  const rad = (map && C.mapGrids && C.mapGrids[map.id] && C.mapGrids[map.id].hexRadius) || C.grid.hexRadius;
  GR = { ...C.grid, hexRadius: rad }; HW = Math.sqrt(3) * rad; HH = 1.5 * rad; GK = C.grid.hexRadius / rad;
  GMAX = { c: Math.ceil(GR.imgW / HW) + 1, r: Math.ceil(GR.imgH / HH) + 1 };
}
const baseHexPx = (c, r) => { const w = Math.sqrt(3) * C.grid.hexRadius; return { x: c * w + (r & 1 ? w / 2 : 0), y: r * 1.5 * C.grid.hexRadius }; };
const fromBase = (c, r) => { if (GK === 1) return { c, r }; const p = baseHexPx(c, r); return pxToHex(p.x, p.y); };
function allHexes() { const out = []; for (let r = 0; r <= GMAX.r; r++) for (let c = 0; c <= GMAX.c; c++) if (inMap(c, r)) out.push({ c, r }); return out; }
const hexPx = (c, r) => ({ x: c * HW + (r & 1 ? HW / 2 : 0), y: r * HH });
const inMap = (c, r) => { const p = hexPx(c, r); const m = Math.min(20, GR.hexRadius / 2); return r >= 1 && p.y <= GR.imgH - m && p.x >= m && p.x <= GR.imgW - m; };
function pxToHex(x, y) {
  const s = GR.hexRadius; let q = (Math.sqrt(3) / 3 * x - y / 3) / s, rr = (2 / 3 * y) / s;
  let cx = q, cz = rr, cy = -cx - cz; let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { c: rx + (rz - (rz & 1)) / 2, r: rz };
}
const cube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
function hexDist0(a, b) { const A = cube(a.c, a.r), B = cube(b.c, b.r); return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2])); }
// v1.11 token sizes: a Giant covers 7 hexes (centre + the 6 around it). Distance/adjacency/range use the nearest footprint hex.
const isGiant = u => !!u && u.size === 'Giant' && u.side === 'npc';
function hexDist(a, b) { const d = hexDist0(a, b); return isGiant(a) || isGiant(b) ? Math.max(0, d - (isGiant(a) ? 1 : 0) - (isGiant(b) ? 1 : 0)) : d; }
const footprint = (u, at) => { const c = at ? at.c : u.c, r = at ? at.r : u.r; return isGiant(u) ? [{ c, r }, ...NB[r & 1].map(([dc, dr]) => ({ c: c + dc, r: r + dr }))] : [{ c, r }]; };
const NB = [[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]];
const neighbors = (c, r) => NB[r & 1].map(([dc, dr]) => ({ c: c + dc, r: r + dr })).filter(h => inMap(h.c, h.r));
const hk = h => `${h.c},${h.r}`;
function hexPoly(c, r) { const p = hexPx(c, r), s = GR.hexRadius - 1.5; return [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 180 * (60 * i - 30); return `${(p.x + s * Math.cos(a)).toFixed(1)},${(p.y + s * Math.sin(a)).toFixed(1)}`; }).join(' '); }

// =====================================================================
// GAME STATE + ENGINE
// =====================================================================
let G = null;
const units = () => [...G.heroes, ...(G.comps || []), ...G.monsters];
const byId = id => G && units().find(u => u.id === id);
const alive = a => a.filter(u => u.life > 0);
const liveHeroes = () => alive(G.heroes), liveMonsters = () => alive(G.monsters);
const liveComps = () => alive(G.comps || []);
// v1.8 USER RULE Dying (heroes only): at 0 Life a hero is Down (not dead) until healed, 3 rounds pass, or 3 enemy hits land.
const isDownHero = u => !!u && u.side === 'pc' && !u.comp && u.life <= 0 && !u.dead && C.downedRule === 'dying';
const helpHeroes = () => G.heroes.filter(h => h.life > 0 || isDownHero(h));   // heroes a heal can target (standing or Down)
const compOf = (h, kind) => (G.comps || []).find(c => c.ownerId === h.id && c.comp === kind && c.life > 0);
const cardsOf = u => u.side === 'pc' ? [...u.cards.equipment, ...u.cards.abilities] : [];
const has = (u, id) => cardsOf(u).includes(id);
const hasFlag = (u, k) => cardsOf(u).some(id => FX[id]?.[k]);
const modSum = (u, k) => cardsOf(u).reduce((s, id) => s + (typeof FX[id]?.mods?.[k] === 'number' ? FX[id].mods[k] : 0), 0);
const hasMod = (u, k) => cardsOf(u).some(id => FX[id]?.mods?.[k]);
const dist = (a, b) => hexDist(a, b);
const adjacent = (a, b) => !!a && !!b && a !== b && hexDist(a, b) === 1;
const engaged = u => (u.side === 'pc' ? liveMonsters() : [...liveHeroes(), ...liveComps()]).some(e => adjacent(u, e));
const weaponOf = id => VWEAPON[id] || FX[id.split('|')[0]]?.weapon;
const weaponsOf = h => h.cards.equipment.filter(id => FX[id]?.weapon);
const isHidden = u => u.fx.some(f => f.hidden);
const enforce = () => C.enforceMoveAndRange && !G.freeMove;
// v1.11 Game Log: every log line is kept (G.log, the "Full log" view); DM/NPC actions, damage and hero rolls also get a one-line brief
function briefOf(msg) {
  if (!G || typeof msg !== 'string') return null;
  const us = units().slice().sort((a, b) => b.name.length - a.name.length);
  const a = us.find(u => msg.startsWith(u.name + ' ')); if (!a) return null;
  const rest = msg.slice(a.name.length + 1); let m;
  const res = /→ (CRITICAL HIT|HIT|MISS)/.exec(msg);
  if (res && /^(attacks |casts .+? at |ripostes |.{1,40}?: attacks )/.test(rest)) {
    const t = us.find(u => u !== a && rest.includes(' ' + u.name)); if (!t) return null;
    return { b: `${a.name} attacks ${t.name} and ${res[1] === 'MISS' ? 'misses' : res[1] === 'CRITICAL HIT' ? 'hits (Critical)' : 'hits'}.`, k: a.side === 'npc' ? 'npc' : 'roll' };
  }
  if ((m = rest.match(/^takes (\d+) (?:poison )?Damage/))) return { b: `${a.name} takes ${m[1]} damage.`, k: 'dmg' };
  if (a.side === 'npc' && (m = rest.match(/^uses (.+?)(?: \(|[.:]|$)/))) return { b: `The ${a.name} uses "${m[1]}"`, k: 'npc', abil: true };
  if (a.side === 'pc' && (m = rest.match(/^(?:is (Poisoned \d+|pushed \d+ spaces?|pulled \d+ spaces?)|can't (move or attack on its next turn|attack on its next turn))/))) return { eff: `${a.name} ${m[1] ? 'is ' + m[1].replace(/^P/, 'p') : "can't " + m[2]}` };
  if (/^(is Down|is down|has died)/.test(rest)) return { b: msg.split(' (')[0].replace(/!$/, '') + '.', k: 'dmg' };
  return null;
}
function log(msg, cls = '') {
  const e = { msg, cls, round: G.round }; let b = null; try { b = briefOf(msg); } catch (_) {}
  if (/the attack (misses|MISSES)/.test(msg)) { const prev = G.log.slice(0, 6).find(x => x.k === 'npc' && / and hits/.test(x.b || '')); if (prev) prev.b = prev.b.replace(/ and hits.*$/, ' and misses.'); }
  if (b && b.eff) { const prev = G.log.slice(0, 6).find(x => x.abil && x.round === G.round); if (prev) (prev.effs = prev.effs || []).push(b.eff); else e.b = b.eff + '.'; }
  else if (b) Object.assign(e, b);
  G.log.unshift(e);
}
const briefText = l => l.b + (l.effs ? ` (${l.effs.join('; ')})` : '') + (l.abil && !l.b.endsWith('.') ? '.' : '');
const current = () => G && G.turn >= 0 ? byId(G.order[G.turn]) : null;

function addFx(u, fx, until, owner, label) {
  if (u.side === 'npc' && (fx.atk < 0 || fx.speedZero || fx.held) && npcHas(u, 'unstoppable')) { log(`${u.name} is Unstoppable: ${label || 'that effect'} has no effect.`, 'play'); return; }
  if (fx.speed && G.phase === 'battle' && current() === u) u.moveLeft = Math.max(0, (u.moveLeft || 0) + fx.speed);
  u.fx.push({ ...fx, until, owner: owner?.id, label: label || 'Effect', appliedAt: u.turnCount || 0, ownerAt: owner?.turnCount || 0 });
}
function hide(h) {
  h.fx = h.fx.filter(f => !f.hidden);
  addFx(h, { hidden: true }, 'ownerEndNextTurn', h, 'Hidden');
  log(`${h.name} is Hidden.`, 'play');
}
function unhide(h, why) { if (isHidden(h)) { h.fx = h.fx.filter(f => !f.hidden); log(`${h.name} is no longer Hidden (${why}).`, 'muted'); } }
function poison(t, n) { if (t.life <= 0) return; const p0 = t.poison || 0; t.poison = Math.max(p0, n); log(`${t.name} is Poisoned ${t.poison}.`, 'play'); if (t.poison > p0) narrate('cond', { t, cond: 'poisoned', n: t.poison }); }
// v1.8 USER RULE: no healing unless a spell, card or ability does it. EVERY Life gain goes through gainLife(), names its source
// in the log and is recorded in G.heals; auditLife() (every render) flags any Life increase that did not come through here.
function gainLife(u, n, src) {
  if (!u || !(n > 0) || u.dead) return 0;
  const wasDown = isDownHero(u);
  if (u.life <= 0 && !wasDown) return 0;   // NPCs and companions at 0 Life are defeated: never revived
  const b = u.life; u.life = Math.min(u.maxLife, u.life + n); const k = u.life - b;
  if (!src) console.warn('Adventures Inc: heal without a named source', u.name);
  if (G.lifeSeen) G.lifeSeen[u.id] = u.life;
  if (k > 0) (G.heals = G.heals || []).push({ round: G.round, who: u.name, id: u.id, n: k, src: src || '(no source given)' });
  log(k > 0 ? `${u.name} heals ${k} (${u.life}/${u.maxLife}) — source: ${src || 'not named (bug)'}.` : `${u.name} is already at full Life (${u.life}/${u.maxLife}).`, k > 0 ? 'heal' : 'muted');
  if (wasDown && u.life > 0) { u.downRounds = 0; u.downHits = 0; log(`${u.name} is back up with ${u.life} Life (${src || 'heal'}).`, 'play'); narrate('up', { t: u }); }
  return k;
}
function heal(u, n, src) { return gainLife(u, n, src); }
function auditLife() {
  if (!G || G.noAudit) return;   // G.noAudit: only the e2e rigs set it while they edit Life by hand
  if (!G.lifeSeen || G.phase !== 'battle') { G.lifeSeen = {}; units().forEach(u => G.lifeSeen[u.id] = u.life); return; }
  for (const u of units()) { const s0 = G.lifeSeen[u.id];
    if (s0 != null && u.life > s0) { (G.unexplained = G.unexplained || []).push({ round: G.round, who: u.name, from: s0, to: u.life });
      console.warn('Adventures Inc life audit: unexplained Life gain', u.name, s0, '->', u.life);
      log(`⚠ Life audit: ${u.name} went from ${s0} to ${u.life} Life with no logged source (please report this).`, 'warn'); }
    G.lifeSeen[u.id] = u.life; }
}
const syncLife = () => { if (G) { G.lifeSeen = {}; units().forEach(u => G.lifeSeen[u.id] = u.life); } };
// a Down hero is hit by an enemy: 3 hits kill (CONFIG.dying.hitsToDie)
function downHit(h, src) {
  h.downHits = (h.downHits || 0) + 1;
  log(`${h.name} is Down and takes a hit from ${src.name}: ${h.downHits} of ${C.dying.hitsToDie} hits.`, 'down');
  flashHurt(h);
  if (h.downHits >= C.dying.hitsToDie) heroDies(h, `${C.dying.hitsToDie} enemy hits while Down`); else narrate('dyingHit', { t: h });
}
function heroDies(h, why) {
  h.dead = true; h.life = 0; h.downRounds = 0; h.fx = []; h.poison = 0;
  log(`☠ ${h.name} has died (${why}). They are removed from the map.`, 'down');
  narrate('dead', { t: h });
  (G.comps || []).filter(c => c.ownerId === h.id && c.life > 0).forEach(c => { c.life = 0; log(`${c.name} leaves the fight.`, 'muted'); });
}
const downBadge = h => `Down: ${h.downRounds} round${h.downRounds === 1 ? '' : 's'} / ${h.downHits || 0} of ${C.dying.hitsToDie} hits`;
// a hero's spell / ability heals another: Oath of Devotion +1, Mistletoe Sprig +1 once per round, Healer's Touch +1 Toughness once per round
function healBy(src, t, n, why) {
  if (!t || (t.life <= 0 && !isDownHero(t))) return;
  let k = n;
  if (src && src.side === 'pc') {
    if (src && hasMod(src, 'healPlus')) k += 1;
    if (src && hasMod(src, 'healBonusRound') && !src.usedRound.has('mistletoe')) { src.usedRound.add('mistletoe'); k += 1; }
    if (src && hasMod(src, 'healTough') && !src.usedRound.has('healTouch')) { src.usedRound.add('healTouch'); addFx(t, { tough: 1 }, 'ownerNextTurn', src, "Healer's Touch"); }
  }
  gainLife(t, k, why || (src ? `${src.name}` : 'heal'));
}
function dmgNoRoll(t, n, why, o = {}) { if (!t || t.life <= 0) return; const k = damage(t, n, { byHero: true, ...o }); log(`${t.name} takes ${k} Damage${why ? ' (' + why + ')' : ''} — ${t.life}/${t.maxLife} Life.`, 'hit'); }
const mostHurt = list => list.filter(u => u && (u.life > 0 || isDownHero(u))).sort((a, b) => (b.maxLife - b.life) - (a.maxLife - a.life) || a.life - b.life)[0];
// push (dir 1) / pull (dir -1) one space at a time; stops at creatures and the map edge
function pushUnit(src, t, n, dir) {
  if (!t || t.life <= 0) return; let moved = 0;
  if (t.side === 'npc' && npcHas(t, 'unstoppable')) { log(`${t.name} is Unstoppable: it can't be ${dir > 0 ? 'pushed' : 'pulled'}.`, 'play'); return; }
  if (t.fx.some(f => f.immovable)) { log(`${t.name} can't be moved.`, 'muted'); return; }
  for (let i = 0; i < n; i++) {
    const d0 = hexDist(src, t);
    if (dir < 0 && d0 <= 1) break;
    const opts = neighbors(t.c, t.r).filter(p => !occupied(p.c, p.r, t) && hexDist(src, p) === d0 + dir);
    if (!opts.length) break;
    const A = cube(src.c, src.r), T = cube(t.c, t.r);
    const line = p => { const P = cube(p.c, p.r); return Math.abs((P[0] - A[0]) * (T[1] - A[1]) - (P[1] - A[1]) * (T[0] - A[0])); };
    const p = opts.sort((a, b) => line(a) - line(b))[0]; t.c = p.c; t.r = p.r; moved++;
  }
  log(moved ? `${t.name} is ${dir > 0 ? 'pushed' : 'pulled'} ${moved} space${moved > 1 ? 's' : ''}.` : `${t.name} can't be ${dir > 0 ? 'pushed' : 'pulled'} (blocked).`, 'play');
  if (moved) narrate('cond', { t, cond: dir > 0 ? 'pushed' : 'pulled' });
}
// returns the Damage actually dealt (after Hardened / Unbreakable / Unyielding). o: { crit, fire, byHero }
function damage(t, n, o = {}) {
  if (n <= 0 || t.life <= 0 || t.dead) return 0;
  if (t.side === 'npc') {
    if (npcHas(t, 'hardened') && n >= 2) { n -= 1; log(`Hardened (${t.name}): the hit deals 1 less Damage (${n}).`, 'play'); }
    const ub = npcAbil(t, 'unbreakable'), floor = o.save ? 0 : (C.minHitDamage ?? 1);
    // v1.9 USER RULE: a hit always deals at least 1 Damage. Unbreakable now REDUCES the hit to 1 (it used to cancel it: 0 Damage).
    if (ub && n >= 3 && o.byHero !== false && (t.ubUsed || 0) < ub) { t.ubUsed = (t.ubUsed || 0) + 1; log(`Unbreakable (${t.name}, ${ub - t.ubUsed} of ${ub} left): the ${n}-Damage hit is reduced to ${Math.max(1, floor)} (minimum Damage rule).`, 'play'); n = Math.max(1, floor); }
    if ((o.crit || o.fire) && npcHas(t, 'regenerate')) { t.regenStopAt = t.turnCount + 1; log(`${t.name} took a ${o.fire ? 'Fire' : 'Critical'} hit: no Regenerate at the start of its next turn.`, 'muted'); }
    // v1.9: Unyielding only works while it has 2+ Life (staying at 1 must still cost it at least 1 Damage)
    if (npcHas(t, 'unyielding') && !t.usedFight.has('unyielding') && t.life - n <= 0 && t.life >= 2) { t.usedFight.add('unyielding'); n = t.life - 1; log(`Unyielding (${t.name}, once per fight): it stays at 1 Life.`, 'play'); }
  }
  t.life = Math.max(0, t.life - n);
  if (G.lifeSeen) G.lifeSeen[t.id] = t.life;
  flashHurt(t);
  if (t.side === 'pc') unhide(t, 'took Damage');
  if (t.life === 0) {
    if (isDownHero(t)) { t.downRounds = C.dying.roundsToHeal; t.downHits = 0; t.downRound = G.round;
      log(`${t.name} is Down! (0 Life — the party has ${C.dying.roundsToHeal} rounds to heal them; ${C.dying.hitsToDie} enemy hits kill them)`, 'down'); }
    else log(`${t.name} is down!`, 'down');
    if (HOLD.n) HOLD.downs.push(t); else narrate('down', { t });
  } else if (t.side === 'npc') checkBloodied(t);
  return n;
}
function offGuard(m, attacker) {
  if (!m || m.side !== 'npc' || m.life <= 0) return false;
  if (m.fx.some(f => f.offGuard)) return true;
  if (attacker && attacker.fx.some(f => f.targetsOffGuard)) return true;
  if (G.phase !== 'battle') return false;
  if (C.offGuard === 'firstRound' && G.round > 1) return false;
  return !G.acted.has(m.id);
}
function fxSum(u, k) { return u.fx.reduce((a, f) => a + (typeof f[k] === 'number' ? f[k] : 0), 0); }
function effSpeed(u) { if (u.fx.some(f => f.speedZero)) return 0; return Math.max(0, u.stats.speed + fxSum(u, 'speed')); }
// v1.7 USER DECISION (2026-10-18): the Pinned condition is removed from the game (CONFIG.pinned = false).
// Cards that used to Pin (Pounce, Snare, Barbed Arrows, Pinning Volley, Vine Snare, Nature's Ally, the pin spells) skip the Pin part
// until Malcom and David's rewritten deck data lands (then rerun tools/build_data.py).
function weaken(t, by, src) {
  if (t.side === 'npc' && npcHas(t, 'unstoppable')) { log(`${t.name} is Unstoppable: it can't be given -1 Attack.`, 'play'); return; }
  t.fx = t.fx.filter(f => !f.weakened); addFx(t, { atk: -1, weakened: true }, 'bearerEndNextTurn', by, `${src || 'Weakened'}: -1 Attack`);
  log(`${t.name} gets -1 Attack until the end of its next turn${src ? ` (${src})` : ''}.`, 'play'); narrate('cond', { t, cond: 'weakened' });
}
const pinSkipped = (who, src) => log(`${src ? src + ': ' : ''}the Pin part is skipped — Pinned was removed from the game (card being rewritten).`, 'muted');
function effTough(u) {
  let t = u.stats.tough + fxSum(u, 'tough');
  if (u.side === 'pc') G.heroes.forEach(h => { if (h !== u && h.life > 0 && hasFlag(h, 'guardian') && adjacent(h, u)) t += 1; });
  if (u.side === 'pc' && G.heroes.some(h => h !== u && h.life > 0 && hasFlag(h, 'auraTough') && dist(h, u) <= 1)) t += 1; // Defender's Vow (Aura 1)
  if (u.side === 'npc' && G.monsters.some(w => w !== u && w.life > 0 && npcAbil(w, 'aura') && npcAbil(w, 'aura').kinds.includes(u.kind) && dist(w, u) <= npcAbil(w, 'aura').radius)) t += 1; // Warchief (Aura 2)
  return Math.max(0, t);
}
function usedOnce(u, key, per) { return per === 'fight' ? u.usedFight.has(key) : u.usedRound.has(key); }
function markUsed(u, key, per) { (per === 'fight' ? u.usedFight : u.usedRound).add(key); }

// ---- engine API handed to keywords.js ----
const E = {
  get G() { return G; }, log, pinSkipped: (t, src) => pinSkipped(t, src), weaken: (t, by, src) => weaken(t, by, src), narrate: (k, d) => narrate(k, d), roll: () => roll(C.combat.die), addFx, hide, poison, heal, adjacent, dist, engaged, isHidden, offGuard, byId,
  liveHeroes: () => liveHeroes(), liveMonsters: () => liveMonsters(), weaponsOf, weapon: weaponOf, hasFlag, hasMod,
  ask, evalAttack: () => evalAttack(),
  healBy, dmgNoRoll, mostHurt, push: pushUnit, helpHeroes: () => helpHeroes(), isFire: card => isFireCard(card),
  resistStun: t => { if (t.side !== 'npc') return false; if (npcHas(t, 'unstoppable')) { log(`${t.name} is Unstoppable: it can't be stunned.`, 'play'); return true; }
    const ub = npcAbil(t, 'unbreakable'); if (ub && (t.ubUsed || 0) < ub) { t.ubUsed = (t.ubUsed || 0) + 1; log(`Unbreakable (${t.name}, ${ub - t.ubUsed} of ${ub} left): the stun is cancelled.`, 'play'); return true; } return false; }, isDown: (h, id) => h.spellDown?.has(id),
  pickAlly: (h, range, title) => pickAlly(h, range, title), flipAllUp: h => flipAllUp(h), flipOneUp: h => flipOneUp(h),
  castSpell: (h, id, o) => castSpell(h, id, o), useOneAction: h => useOneAction(h), mark: (h, t) => markEnemy(h, t), placeSnare: (h, n) => placeSnare(h, n),
  terrain: (h, t, type, radius, until) => addTerrain(h, t, type, radius, until), reactMove: (h, n) => reactMove(h, n, false, 'Reaction move'), counterShot: (h, m) => counterShot(h, m),
  addAttackToken: (h, tok) => h.attacks.push({ uid: uid(), ...tok }),
  attackMode: (h, mode, card) => {
    const replace = !mode.add;
    if (replace) { if (ACT_ON()) useOneAction(h); else h.attacks = h.attacks.filter(t => t.kind !== 'normal'); }   // v1.9: replaces ONE of your attacks
    let n = mode.count === 'adjacentEnemies' ? liveMonsters().filter(m => adjacent(m, h)).length : mode.count;
    const group = uid();
    const tok = { kind: 'special', label: mode.label, mode, group };
    if (mode.differentFromLast) tok.exclude = [G.atk?.target || G.lastTarget].filter(Boolean);
    for (let i = 0; i < n; i++) h.attacks.unshift({ uid: uid(), ...tok });
    G.groups[group] = [];
    log(`${mode.label}: ${n} attack${n === 1 ? '' : 's'}${mode.distinct ? ' (different enemies)' : ''}${replace ? ' — replaces your normal attack' : ''}.`, 'play');
  },
  pickUnit: async (title, list) => list.length <= 1 ? list[0] : byId(await ask(title, '', list.map(u => ({ label: esc(u.name), value: u.id, cls: 'primary' })))),
  pickUnits: (title, list, max) => new Promise(res => {
    if (list.length <= max) return res(list);
    if (AI_ACTOR) return res([...list].sort((a, b) => a.life - b.life || dist(AI_ACTOR, a) - dist(AI_ACTOR, b)).slice(0, max));
    const m = modal(`<h3>${esc(title)}</h3><div class="ask-body">${list.map(u => `<label class="chk"><input type="checkbox" value="${u.id}"> ${esc(u.name)} (${u.life}/${u.maxLife})</label>`).join('')}</div><div class="btnrow"><button class="primary" id="pk">OK</button></div>`, 'ask');
    $$('input', m).forEach(i => i.onchange = () => { const on = $$('input:checked', m); if (on.length > max) i.checked = false; });
    $('#pk', m).onclick = () => { const ids = $$('input:checked', m).map(i => i.value); m.remove(); res(ids.length ? ids.map(byId) : list.slice(0, max)); };
  }),
};

// Fire hits stop Regenerate (Troll Brute / Chieftain). Searing Smite is NOT Fire (David's ruling).
function isFireCard(card) { if (!card) return false; const id = card.id || ''; if (id === 'PAL-SPL-07') return false;
  return /fire/i.test(card.school || '') || /\b(fire|flame|ember|burn)/i.test(card.name || ''); }
// ---- encounter + setup ----
function buildEncounter(nHeroes, level) {
  const budget = C.epBudget(nHeroes, level);
  const names = C.encounterPools[store.pool];
  const pool = window.MONSTERS_L1.filter(m => names == null ? (m.level || 1) === 1 : names === 'level' ? (m.level || 1) <= level : typeof names === 'number' ? (m.level || 1) === names : names.includes(m.name))
    .map(m => ({ ...m, ep: priceOf(m, level), baseEp: m.ep }));
  let best = [], bestEp = -1;
  for (let t = 0; t < 400; t++) {
    let left = budget; const list = [], used = {};
    while (true) {
      const opts = pool.filter(m => m.ep <= left && (used[m.name] || 0) < m.qty);
      if (!opts.length) break;
      const m = opts[Math.floor(Math.random() * opts.length)]; list.push(m); used[m.name] = (used[m.name] || 0) + 1; left -= m.ep;
    }
    if (budget - left > bestEp) { best = list; bestEp = budget - left; }
    if (left === 0) break;
  }
  return { list: best, ep: bestEp, budget };
}
function baseUnit(extra) { return { fx: [], poison: 0, turnCount: 0, usedFight: new Set(), usedRound: new Set(), ...extra }; }
function makeHero(ch, i) {
  const type = ch.type || typeOfStyle(ch.style);
  const base = levelBase(type, ch.level, ch.style), b = cardBonuses([...ch.equipment, ...ch.abilities]);
  const s = {}; Object.keys(base).forEach(k => s[k] = base[k] + b[k]);
  return baseUnit({ id: 'h' + i, side: 'pc', name: ch.name, owner: ch.owner, charId: ch.id, control: ch.control === 'npc' ? 'npc' : 'user', style: ch.style, type, level: ch.level, classCard: ch.classCard,
    cards: { equipment: [...ch.equipment], abilities: [...ch.abilities] }, picks: C.picks[type][ch.level],
    stats: s, life: s.life, maxLife: s.life, deck: shuffle(ch.powerups.filter(id => !REMOVED.has(id))), hand: [], discard: [], playsUsed: 0, preplays: 0, attacks: [], thrown: {}, moveLeft: 0, freeMove: 0,
    spells: [...(ch.spells || [])].filter(id => CARD[id] && !REMOVED.has(id)), spellDown: new Set(), spellSpent: new Set(), extraCasts: 0, freeCasts: 0, castThisTurn: false,
    lohLeft: ch.style === 'Paladin' ? 1 + modSum({ side: 'pc', cards: { equipment: ch.equipment, abilities: ch.abilities } }, 'lohUses') : 0 });
}
// Companion tokens (Druid Wolf, Ranger Hawk): move on their hero's turn, never in the initiative order
function makeComp(h, kind, i) {
  const k = COMPANIONS[kind];
  return baseUnit({ id: 'c' + i, side: 'pc', comp: kind, ownerId: h.id, name: `${h.name}'s ${k.name}`, owner: h.owner, control: h.control, icon: k.icon, color: k.color, flies: !!k.flies,
    cards: { equipment: [], abilities: [] }, hand: [], picks: { play: 0, slots: 0, draw: 0 }, playsUsed: 0, attacks: [], thrown: {}, spells: [],
    stats: { life: k.life, speed: k.speed, tough: k.tough, atk: k.atk || 0, res: 0, skill: 0 }, life: k.life, maxLife: k.life, moveLeft: 0, freeMove: 0 });
}
const compOwner = c => G.heroes.find(h => h.id === c.ownerId);
function makeMonster(t, i, idx) {
  const tk = creatureToken(t.name), nc = npcCardOf(t.name), nfx = (nc && window.NPC_FX[nc.id]) || {};
  const abil = {}; (nc?.abilities || []).forEach(a => { const p = parseNpcAbility(a); abil[p.name] = p.def; });
  if (nfx.bloodied && abil.Bloodied) abil.Bloodied.bloodied = nfx.bloodied;
  const atks = npcAttackOptions(t.name, nc), main = atks[0];
  const npcx = { card: nc?.id, level: t.level || nc?.level || 1, tactic: t.tactic || nc?.tactic || 'Charger', role: t.role || nc?.role || '', atks, atkName: main.name, atkKind: main.kind, range: main.range, abil,
    alt: atks.find(x => x.key === 'alt') || null, la: nfx.la ? { ...nfx.la } : null, usesLeft: {}, recharging: {}, attacksLeft: 1 };
  return baseUnit({ id: 'm' + i, side: 'npc', name: t.label || `${monLabel(t)} ${idx}`, kind: t.name, kindLabel: monLabel(t), color: tk.color, ep: t.ep, stats: { life: t.life, speed: t.speed, tough: t.tough, atk: t.atk, res: t.res, skill: t.skill },
    life: t.life, maxLife: t.life, tag: tk.tag + idx, num: idx, size: (nc && window.NPC_SIZES && window.NPC_SIZES[nc.id]) || 'Medium', moveLeft: 0, ...npcx });
}
function occupied(c, r, except) { return units().find(u => u !== except && (u.life > 0 || isDownHero(u)) && (u.c === c && u.r === r || (isGiant(u) && hexDist0(u, { c, r }) === 1))); }
// can u stand with its centre on (c, r)? (Giants need all 7 hexes on the map and free)
function fits(u, c, r) { return footprint(u, { c, r }).every(p => inMap(p.c, p.r) && !occupied(p.c, p.r, u)) && !(isGiant(u) && units().some(o => o !== u && (o.life > 0 || isDownHero(o)) && footprint(u, { c, r }).some(p => footprint(o).some(q => q.c === p.c && q.r === p.r)))); }
// after any spawn: move each Giant whose footprint doesn't fit to the nearest hex where it does
function fitGiants() {
  for (const g of G.monsters.filter(isGiant)) { if (g.c >= 0 && fits(g, g.c, g.r)) continue;
    const from = g.c >= 0 ? { c: g.c, r: g.r } : { c: Math.round(GMAX.c * 0.7), r: Math.round(GMAX.r / 2) };
    const best = allHexes().filter(p => fits(g, p.c, p.r)).sort((a, b) => hexDist0(a, from) - hexDist0(b, from))[0];
    if (best) { g.c = best.c; g.r = best.r; } }
}
function placeLine(list, col, rows) {
  list.forEach((u, i) => {
    let c = col + (i % 2), r = rows[0] + Math.round(i * (rows[1] - rows[0]) / Math.max(1, list.length - 1));
    while (occupied(c, r, u) || !inMap(c, r)) { r++; if (r > GMAX.r - 2) { r = 2; c++; } }
    u.c = c; u.r = r;
  });
}
// v1.8: each map has hand-checked start hexes (tools/build_maps.py: no dark rock / deep water); false = use the old lines
function placeStart(list, cells) {
  if (!cells || cells.length < list.length) return false;
  const free = cells.map(([c, r]) => ({ c, r })).filter(p => inMap(p.c, p.r));
  list.forEach(u => { u.c = -9; u.r = -9; const p = free.find(q => !occupied(q.c, q.r, u)); if (p) { u.c = p.c; u.r = p.r; } });
  return list.every(u => u.c >= 0);
}
function placeArea(list, area) {
  const A0 = C.monsterAreas[area] || C.monsterAreas.east, A = A0.ring ? { ...A0, ring: Math.round(A0.ring * GK) } : { ...A0, cols: A0.cols.map(n => Math.round(n * GK)), rows: A0.rows.map(n => Math.round(n * GK)) };
  const cells = [];
  if (A.ring) { // hexes at distance ring from the heroes' centre, spread around
    const live = G.heroes; const cc = Math.round(live.reduce((s, h) => s + h.c, 0) / live.length), cr = Math.round(live.reduce((s, h) => s + h.r, 0) / live.length);
    for (let d = A.ring; d <= A.ring + 3 && cells.length < list.length * 3; d++) {
      const ring = []; for (let r = 1; r <= GMAX.r; r++) for (let c = 0; c <= GMAX.c; c++) if (inMap(c, r) && Math.min(...live.map(h => hexDist({ c, r }, h))) === d) ring.push({ c, r, a: Math.atan2(r - cr, c - cc) });
      ring.sort((x, y) => x.a - y.a); cells.push(...ring);
    }
    const step = Math.max(1, Math.floor(cells.length / Math.max(1, list.length)));
    const pick = []; for (let i = 0; pick.length < list.length && i < cells.length * 2; i += step) { const h = cells[i % cells.length]; if (!pick.includes(h)) pick.push(h); }
    list.forEach((u, i) => { u.c = -9; u.r = -9; let k = 0, h = pick[i] || cells[0]; while (occupied(h.c, h.r, u)) h = cells[(cells.indexOf(h) + 1 + k++) % cells.length]; u.c = h.c; u.r = h.r; });
    return;
  }
  for (let c = A.cols[0]; c <= A.cols[1]; c++) for (let r = A.rows[0]; r <= A.rows[1]; r++) if (inMap(c, r)) cells.push({ c, r });
  // spread evenly: centre-out ordering along the long axis
  const midC = (A.cols[0] + A.cols[1]) / 2, midR = (A.rows[0] + A.rows[1]) / 2;
  cells.sort((x, y) => (Math.abs(x.r - midR) + Math.abs(x.c - midC) * 0.6) - (Math.abs(y.r - midR) + Math.abs(y.c - midC) * 0.6));
  const spaced = cells.filter(h => (A.cols[1] - A.cols[0] > A.rows[1] - A.rows[0]) ? h.c % 2 === 0 : h.r % 2 === 1).concat(cells);
  list.forEach(u => { u.c = -9; u.r = -9; const h = spaced.find(h => !occupied(h.c, h.r, u)) || { c: Math.round(17 * GK), r: Math.round(9 * GK) }; u.c = h.c; u.r = h.r; });
}
function startTable() {
  UNDO.stack = []; UI.open.clear();
  const chars = store.seats.map(id => store.characters.find(c => c.id === id)).filter(c => c && isPlayable(c.style));
  if (!chars.length) { showLobby(); return; }
  const lvl = Math.max(...chars.map(c => c.level));
  const budget = C.epBudget(chars.length, lvl);
  const custom = store.encMode === 'custom' ? cleanItems(store.custom?.items) : [];
  const enc = custom.length ? { list: custom.map(it => ({ ...MON[it.kind], label: it.label })), ep: encEp(custom, lvl), budget, custom: true, area: store.custom.area }
    : buildEncounter(chars.length, lvl);
  const count = {};
  G = { heroes: chars.map((c, i) => makeHero(c, i)), monsters: [], log: [], round: 0, order: [], turn: -1, phase: 'setup', acted: new Set(), groups: {},
    dmMode: store.dmMode, map: C.maps.find(m => m.id === store.mapId) || C.maps[0], atk: null, busy: false, over: null, enc, freeMove: false };
  setGrid(G.map);
  G.monsters = enc.list.map((t, i) => { count[t.name] = (count[t.name] || 0) + 1; return makeMonster(t, i, count[t.name]); });
  G.comps = []; G.terrain = new Map(); G.snares = {}; G.tick = 0;
  G.heroes.forEach(h => cardsOf(h).forEach(id => { const k = FX[id]?.companion; if (k) G.comps.push(makeComp(h, k, G.comps.length)); }));
  units().forEach(u => { u.c = -9; u.r = -9; });
  const SB = cells => cells && cells.map(([c, r]) => { const p = fromBase(c, r); return [p.c, p.r]; }), K = n => Math.round(n * GK);
  placeStart(G.heroes, SB(G.map.heroStart)) || placeLine(G.heroes, K(8), [K(6), K(11)]);
  G.comps.forEach(c => { const h = compOwner(c); const p = neighbors(h.c, h.r).sort((a, b) => a.c - b.c).find(p => !occupied(p.c, p.r, c)) || { c: h.c - 1, r: h.r }; c.c = p.c; c.r = p.r; });
  if (enc.custom && enc.area !== 'east') placeArea(G.monsters, enc.area); else placeStart(G.monsters, SB(G.map.monStart)) || (enc.custom ? placeArea(G.monsters, enc.area) : placeLine(G.monsters, K(16), [K(4), K(13)]));
  fitGiants();
  log(`Encounter: ${G.monsters.map(m => m.name).join(', ')} — ${enc.ep}/${enc.budget} EP (${enc.custom ? "DM's encounter" : store.pool}).`);
  if (enc.ep > enc.budget) log(`⚠ Over the EP budget by ${enc.ep - enc.budget}: a harder fight.`, 'warn');
  log('Place your tokens (they snap to the map hexes), then press Start Battle.');
  renderTable();
}

// ---- triggers from Equipment/Abilities ----
function triggersOf(h, on, filt = {}) {
  const out = [];
  cardsOf(h).forEach(id => (FX[id]?.triggers || []).forEach((t, i) => {
    if (t.on !== on) return;
    if (t.kind && filt.kind && t.kind !== filt.kind) return;
    const key = id + ':' + i;
    if (t.per && usedOnce(h, key, t.per)) return;
    out.push({ ...t, id, key });
  }));
  return out;
}
async function fireTriggers(h, on, x = {}) {
  for (const t of triggersOf(h, on, x)) {
    if (!t.do) continue;
    if (t.ask && !(await ask(CARD[t.id].name, t.ask, [{ label: 'Yes', value: true, cls: 'primary' }, { label: 'Not now', value: false }]))) continue;
    if (t.per) markUsed(h, t.key, t.per);
    log(`${CARD[t.id].name} triggers.`, 'muted');
    for (const op of t.do) await KW.run(E, { h, t: x.t, A: x.A, card: CARD[t.id] }, op);
  }
}

// ---- initiative (LOCKED: 1d6 + Speed each; Quick Reflexes pause) ----
async function startBattle() {
  UNDO.stack = []; HOLD.n = 0; HOLD.downs.length = 0; window.NARR?.stop(); applySettings();
  G.phase = 'battle'; G.round = 1; G.busy = true; G.heals = []; G.unexplained = []; G.laUsed = []; syncLife();
  G.laPool = laPoolSize(); G.laDamaging = 0; G.laRound = 0;
  G.monsters.forEach(m => { const own = npcAbil(m, 'ownPool'); if (own) m.laLeft = own; });
  for (const h of G.heroes) await asHero(h, async () => {
    await fireTriggers(h, 'fightStart');
    if (hasFlag(h, 'quarry')) await chooseQuarry(h);
  });
  G.heroes.forEach(h => draw(h, C.firstDrawFillsSlots ? h.picks.slots : h.picks.draw, true));
  units().filter(u => !u.comp).forEach(u => { u.initDie = roll(C.initiative.die); u.initRoll = u.initDie + (C.initiative.addSpeed ? effSpeed(u) : 0) + modSum(u, 'initBonus'); });
  renderTable();
  // pause: "Play when initiative is rolled" power-ups (Quick Reflexes) before the order is fixed
  for (const h of G.heroes.filter(x => x.control === 'npc')) {
    for (const id of h.hand.filter(id => FX[id]?.when === 'initiative')) { if (h.preplays >= h.picks.play) break;
      h.hand.splice(h.hand.indexOf(id), 1); h.discard.push(id); h.preplays++; log(`${h.name} (NPC hero) plays ${CARD[id].name}.`, 'play');
      await asHero(h, async () => { for (const op of FX[id].do) await KW.run(E, { h, card: CARD[id] }, op); }); }
  }
  for (let guard = 0; guard < 10; guard++) {
    const can = G.heroes.filter(h => h.control !== 'npc').flatMap(h => h.hand.filter(id => FX[id]?.when === 'initiative' && h.preplays < h.picks.play).map(id => ({ h, id })));
    if (!can.length) break;
    const rows = units().filter(u => !u.comp).map(u => `<tr class="${u.side}"><td>${esc(u.name)}</td><td>${u.initDie} + ${effSpeed(u)}${modSum(u, 'initBonus') ? ' + ' + modSum(u, 'initBonus') : ''}${u.initRoll - u.initDie - effSpeed(u) - modSum(u, 'initBonus') ? ' + ' + (u.initRoll - u.initDie - effSpeed(u) - modSum(u, 'initBonus')) : ''}</td><td><b>${u.initRoll}</b></td></tr>`).join('');
    const v = await ask('Initiative rolled', `<table class="init">${rows}</table><p>Before the turn order is fixed, a hero may play:</p>`,
      [...can.map((x, i) => ({ label: `${esc(x.h.name)}: ${esc(CARD[x.id].name)}`, value: i, cls: 'primary' })), { label: 'Lock turn order', value: -1 }]);
    if (v === -1) break;
    const { h, id } = can[v];
    h.hand.splice(h.hand.indexOf(id), 1); h.discard.push(id); h.preplays++;
    log(`${h.name} plays ${CARD[id].name}.`, 'play');
    for (const op of FX[id].do) await KW.run(E, { h, card: CARD[id] }, op);
  }
  const list = units().filter(u => !u.comp).map(u => ({ u, sp: effSpeed(u), rnd: Math.random() })); // companions act on their owner's turn
  list.sort((a, b) => {
    if (b.u.initRoll !== a.u.initRoll) return b.u.initRoll - a.u.initRoll;
    const alertA = a.u.side === 'pc' && hasMod(a.u, 'winInitTiesVsEnemies'), alertB = b.u.side === 'pc' && hasMod(b.u, 'winInitTiesVsEnemies');
    if (a.u.side !== b.u.side && (alertA || alertB)) return alertA ? -1 : 1;
    return b.sp - a.sp || (a.u.side === 'pc' ? -1 : 0) - (b.u.side === 'pc' ? -1 : 0) || a.rnd - b.rnd;
  });
  G.order = list.map(x => x.u.id);
  log(`Initiative (1d6 + Speed): ${list.map(x => `${x.u.name} ${x.u.initRoll}`).join(', ')}.`, 'sys');
  log('— Round 1 —', 'round');
  G.busy = false; G.turn = -1; await nextTurn();
}
async function chooseQuarry(h) {
  const list = liveMonsters(); if (!list.length) return;
  const t = await E.pickUnit(`${h.name}: choose your Quarry`, list);
  h.quarry = t.id; log(`${h.name} chooses ${t.name} as Quarry.`, 'play');
}
// v1.13 (note 9): "At the start of your turn, draw power-ups until you hold your in-play number." Automatic, every PC.
// An empty draw pile draws nothing (no reshuffle) and says so in the log.
function refillPU(h) {
  const need = Math.max(0, h.picks.slots - h.hand.length); if (!need) return 0;
  const n = Math.min(need, h.deck.length);
  for (let i = 0; i < n; i++) h.hand.push(h.deck.shift());
  if (n) log(`${h.name} draws ${n} power-up${n > 1 ? 's' : ''} at the start of the turn (${h.hand.length}/${h.picks.slots} in play; deck ${h.deck.length}).`, 'muted');
  if (n < need) log(`${h.name}'s power-up deck is empty: ${need - n === need ? 'no power-up drawn' : `${need - n} short`} (${h.hand.length}/${h.picks.slots} in play; ${h.discard.length} in the discard pile).`, 'muted');
  return n;
}
function draw(h, n, first) {
  let drew = 0;
  for (let i = 0; i < n && h.hand.length < h.picks.slots; i++) {
    if (!h.deck.length) { if (C.reshuffleDiscard && h.discard.length) { h.deck = shuffle(h.discard); h.discard = []; } else { log(`${h.name}'s power-up deck is empty (no reshuffle during a battle — OPEN).`, 'muted'); break; } }
    h.hand.push(h.deck.shift()); drew++;
  }
  if (drew) log(`${h.name} draws ${drew} power-up${drew > 1 ? 's' : ''}${first ? ' (fill slots)' : ''}.`, 'muted');
}

// ---- turns ----
async function nextTurn() {
  if (checkEnd()) return;
  for (let guard = 0; guard < 60; guard++) {
    G.turn++;
    if (G.turn >= G.order.length) {
      G.turn = 0; G.round++; G.acted = new Set(); log(`— Round ${G.round} —`, 'round');
      units().forEach(u => { u.blockUsed = false; u.plateUsed = false; u.riposteUsed = 0; u.usedRound = new Set(); });
    }
    const u = current(); if (u && u.life > 0) break;
    if (u && isDownHero(u) && G.round > (u.downRound ?? 0) && !G.acted.has(u.id)) {   // Dying: one of the 3 rounds passes at the Down hero's turn
      G.acted.add(u.id); u.downRounds--;
      if (u.downRounds <= 0) heroDies(u, `not healed within ${C.dying.roundsToHeal} rounds`);
      else { log(`${u.name} is Down (${downBadge(u)}). Heal them before it's too late!`, 'down'); narrate('dying', { t: u, n: u.downRounds }); }
      if (checkEnd()) return;
    }
  }
  const u = current();
  u.turnCount++; G.tick = (G.tick || 0) + 1;
  units().forEach(x => x.fx = x.fx.filter(f => !(f.owner === u.id && f.until === 'ownerNextTurn')));
  for (const [k, t] of [...G.terrain]) if (t.owner === u.id && t.until === 'ownerNextTurn') G.terrain.delete(k);
  G.atk = null;
  log(`${u.name}'s turn${u.side === 'pc' ? ` (${u.owner})` : ''}.`, 'turn');
  // Poisoned N: 1 Damage at the start of its turn, then N - 1
  if (u.poison > 0) {
    log(`${u.name} takes 1 poison Damage (Poisoned ${u.poison}).`, 'hit');
    damage(u, 1); u.poison--;
    if (checkEnd()) return;
    if (u.life <= 0) { G.acted.add(u.id); renderTable(); await sleep(150); return nextTurn(); }
  }
  if (u.side === 'npc') { npcTurnStart(u); npcMenace(u); if (checkEnd()) return; }
  if (u.side === 'npc' && u.life > 0 && terrainAt(u)?.type === 'thorns' && !npcHas(u, 'flies')) { u.thornTurn = u.turnCount; dmgNoRoll(u, 1, 'Thorns'); if (checkEnd()) return; if (u.life <= 0) { G.acted.add(u.id); renderTable(); await sleep(150); return nextTurn(); } }
  if (u.side === 'pc') heroTurnStart(u);
  u.moveLeft = effSpeed(u);
  if (u.side === 'pc') {
    if (u.drawStarted) refillPU(u); else u.drawStarted = true;   // v1.13 note 9: the opening hand is already full on the first turn
    u.playsUsed = u.preplays || 0; u.preplays = 0; u.attackedThisTurn = false; u.cleaveUsed = false;
    u.attacks = [{ uid: uid(), kind: 'normal', label: 'Normal attack' }]; u.acts = []; syncNormals(u);   // v1.9: Fighters 2-3 attacks at L2-L3
    if (hasFlag(u, 'quarry') && (!u.quarry || byId(u.quarry).life <= 0)) await asHero(u, () => chooseQuarry(u));
    renderTable();
    if (u.control === 'npc') await autoHeroTurn(u);
  } else {
    u.attacked = false;
    renderTable();
    if (G.dmMode === 'auto') await autoMonsterTurn(u);
  }
}
// start of a hero's turn: spells flip face up, per-turn spell state resets, auras, companions
function heroTurnStart(u) {
  if (u.comp) return;
  const down = [...(u.spellDown || [])].filter(id => !u.spellSpent.has(id));
  u.spellDown = new Set(u.spellSpent || []);
  if (down.length) log(`${u.name}'s spells flip face up: ${down.map(id => CARD[id].name).join(', ')}.`, 'muted');
  u.dashed = false; u.castThisTurn = false; u.extraCasts = 0; u.freeCasts = 0; u.empower = false; u.bigArea = false; u.teleportMove = false; u.checkBonus = 0; u.skirmished = false;
  u.sinceTick = u.curTick ?? 0; u.curTick = G.tick;
  // start-of-turn heals (v1.8 audit: these are the ONLY start-of-turn heals for heroes; each names its card)
  const gb = u.fx.find(f => f.regenNext); if (gb) { u.fx = u.fx.filter(f => f !== gb); if (u.life > 0) heal(u, 1, `Goodberry (${byId(gb.owner)?.name || 'Ranger'}'s spell, second heal at the start of the next turn)`); }
  if (hasFlag(u, 'auraHeal')) { const t = mostHurt(helpHeroes().filter(x => dist(x, u) <= 2 && x.life < x.maxLife)); if (t) heal(t, 1, `Aura of Vitality (${u.name}'s Paladin ability, start of ${u.name}'s turn)`); }
  (G.comps || []).filter(c => c.ownerId === u.id && c.life > 0).forEach(c => { c.moveLeft = effSpeed(c); c.control = u.control; });
}
function expireEndOfTurn(u) {
  // effects that end at the end of this unit's turn
  units().forEach(x => x.fx = x.fx.filter(f => {
    if (f.owner === u.id && (f.until === 'endTurn' || f.until === 'ownerEndTurn')) return false;
    if (f.owner === u.id && (f.until === 'ownerEndNextTurn' || f.until === 'nextAttackOrOwnerEndNextTurn') && u.turnCount > f.ownerAt) { if (f.hidden) log(`${x.name}'s Hidden ends (end of next turn).`, 'muted'); return false; }
    if (x === u && f.until === 'bearerEndNextTurn' && u.turnCount > f.appliedAt) return false;
    return true;
  }));
}
async function endTurn() {
  const u = current(); if (!u || G.busy) return;
  G.acted.add(u.id);
  expireEndOfTurn(u);
  u.moveLeft = 0;
  if (u.side === 'pc') { u.freeMove = 0; u.teleportMove = false; u.attacks = []; u.dashed = false;   // v1.13: no end-of-turn draw (refill at the start of the next turn)
    (G.comps || []).filter(c => c.ownerId === u.id).forEach(c => { c.moveLeft = 0; expireEndOfTurn(c); }); }
  // v1.8 Legendary Actions: at the end of a hero's turn (Auto DM uses them itself; Human DM gets a prompt)
  if (u.side === 'pc' && !u.comp && !G.over && liveMonsters().some(m => m.la)) {
    const prevAI = AI_ACTOR; G.busy = true; if (G.dmMode === 'human') AI_ACTOR = null;
    try { await legendaryWindow(u); } finally { AI_ACTOR = prevAI; G.busy = false; }
    if (checkEnd()) return;
  }
  await nextTurn();
}
function checkEnd() {
  if (G.over) return true;
  if (!liveMonsters().length) G.over = 'win'; else if (!liveHeroes().length) G.over = 'lose';   // defeat: every hero dead or Down
  if (G.over) { G.busy = false; log(G.over === 'win' ? 'Victory! All monsters are down.' : `The party has fallen (${G.heroes.map(h => `${h.name} ${h.dead ? 'dead' : 'Down'}`).join(', ')}).`, 'round'); narrate('end', { win: G.over === 'win' }); renderTable(); return true; }
  return false;
}

// ---- movement ----
// Dijkstra over hexes. Enemies of the mover block (unless it Flies / moves through / Teleports);
// Overgrowth and Thorns cost an enemy (NPC) 2 Speed per space; Hold the Line stops NPCs next to the Warrior.
function reachable(u, budget) {
  const enemies = u.side === 'pc' ? G.monsters : [...G.heroes, ...(G.comps || [])];
  const flies = (u.side === 'npc' && npcHas(u, 'flies')) || !!u.flies;
  const through = (u.side === 'pc' && (hasMod(u, 'moveThroughEnemies') || u.teleportMove)) || flies;
  const holders = u.side === 'npc' && !(flies && C.npc.fliesIgnoresHoldLine) ? liveHeroes().filter(h => hasFlag(h, 'holdLine')) : [];
  const slowed = u.side === 'npc' && !flies;
  const out = new Map(), parent = new Map(); const start = { c: u.c, r: u.r }; out.set(hk(start), 0);
  let frontier = [{ ...start, cost: 0 }];
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost); const f = frontier.shift();
    if (f.cost > (out.get(hk(f)) ?? 99)) continue;
    if (f.cost > 0 && holders.some(h => hexDist(h, f) === 1)) continue; // Hold the Line: must stop here
    for (const n of neighbors(f.c, f.r)) {
      if (isGiant(u) && !footprint(u, n).every(p => inMap(p.c, p.r) && (!occupied(p.c, p.r, u) || (!enemies.includes(occupied(p.c, p.r, u)) || through)))) continue;
      const occ = occupied(n.c, n.r, u);
      if (occ && enemies.includes(occ) && !through) continue;
      if (occ && !enemies.includes(occ) && !C.moveThroughAllies && !flies) continue;
      const tt = slowed && G.terrain?.get(hk(n));
      const cost = f.cost + (tt && (tt.type === 'overgrowth' || tt.type === 'thorns') ? 2 : 1);
      if (cost > budget || cost >= (out.get(hk(n)) ?? 99)) continue;
      out.set(hk(n), cost); parent.set(hk(n), hk(f)); frontier.push({ ...n, cost });
    }
  }
  // you can't end your move on an occupied space
  for (const k of [...out.keys()]) { const [c, r] = k.split(',').map(Number); if (occupied(c, r, u) || (isGiant(u) && k !== hk(start) && !fits(u, c, r))) out.delete(k); }
  out.parent = parent;
  return out;
}
function pathTo(reach, u, to) {
  const path = []; let k = hk(to);
  while (k && k !== hk(u)) { const [c, r] = k.split(',').map(Number); path.unshift({ c, r }); k = reach.parent.get(k); }
  return path;
}
const terrainAt = p => G.terrain?.get(hk(p));
// an NPC walks its path: Snares and Thorns trigger on the way (rulebook §12)
function walkNpc(m, path) {
  let steps = 0; WALK[m.id] = [{ c: m.c, r: m.r }, ...path.map(p => ({ c: p.c, r: p.r }))];
  for (const p of path) {
    m.c = p.c; m.r = p.r; steps++;
    const sn = Object.entries(G.snares || {}).find(([, s]) => s.c === p.c && s.r === p.r);
    if (sn && !npcHas(m, 'flies')) { delete G.snares[sn[0]];
      log(`${m.name} steps into ${byId(sn[0])?.name || 'a'}'s Snare.`, 'play'); dmgNoRoll(m, 1, 'Snare'); if (m.life <= 0) break; weaken(m, byId(sn[0]), 'Snare'); }
    const t = terrainAt(p);
    if (t?.type === 'thorns' && !npcHas(m, 'flies') && m.thornTurn !== m.turnCount) { m.thornTurn = m.turnCount; dmgNoRoll(m, 1, 'Thorns'); if (m.life <= 0) break; }
  }
  return steps;
}
function moveBudget(u) { return (u.moveLeft || 0) + (u.freeMove || 0); }
// v1.6 Double move / Dash (USER-APPROVED, CONFIG.dash): give up the attack, move up to 2 x Speed, nothing else
function dashBlock(h) {
  if (!C.dash?.enabled) return 'Dash is turned off in CONFIG.';
  if (!G || G.phase !== 'battle' || G.over || current() !== h || h.side !== 'pc' || h.comp) return 'Only on your own turn.';
  if (h.dashed) return 'Already dashing this turn.';
  if (G.atk && G.atk.d6 != null) return 'Finish the current attack first.';
  if (h.attackedThisTurn || h.castThisTurn || !h.attacks.some(t => t.kind === 'normal')) return 'Only before you attack: your attack is already used this turn.';
  if (effSpeed(h) <= 0) return `${moveBlockReason(h) || 'Speed 0'} (Dash: 2 × 0 = 0).`;
  return null;
}
function doDash(h) {
  if (dashBlock(h)) return false;
  const sp = effSpeed(h), add = sp * (C.dash.multiplier - 1);
  h.dashed = true; h.moveLeft = (h.moveLeft || 0) + add; h.attacks = []; G.atk = null;
  log(`${h.name} Dashes: gives up the attack to move up to ${C.dash.multiplier} × Speed (${sp * C.dash.multiplier} this turn, ${moveBudget(h)} left). No attack, spell or attack power-up this turn.`, 'play');
  return true;
}
const DASHED = 'You Dashed this turn: no attack or spell (only moving and non-attack power-ups).';
const DASHED_CARD = 'You Dashed this turn: no attack, spell or attack power-up.';
// Dash rule (user, 2026-10-17): after a Dash no attack, spell or anything that makes/replaces an attack. Other power-ups are fine.
const DASH_ATTACK_OPS = /"(attackMode|extraAttack|extraCast|castFree|useAction|attack)"/;
const dashBlocksCard = id => { const fx = FX[id] || {}; return DASH_ATTACK_OPS.test(JSON.stringify(fx.do || [])) || DASH_ATTACK_OPS.test(JSON.stringify(fx.activate?.do || [])) || !!fx.activate?.usesAction; };
// v1.6: why a unit can't move right now (null = it can). Shown in the dock, on the token and as a toast.
function moveBlockReason(u) {
  if (!G || G.phase !== 'battle' || G.over || !u) return null;
  if (G.freeMove || !C.enforceMoveAndRange) return null;
  if (u.life <= 0) return `${u.name} is down.`;
  const your = u.side === 'pc' ? 'your' : 'its';
  const sz = u.fx.find(f => f.speedZero); if (sz) return `${sz.label}: Speed 0 — can't move until it ends.`;
  if (effSpeed(u) <= 0 && !(u.freeMove > 0)) return 'Speed 0: can\'t move.';
  const cur = current(), mine = u.comp ? compOwner(u) === cur : cur === u;
  if (!mine && !(u.freeMove > 0)) return `It's ${cur ? cur.name + "'s" : 'not your'} turn.`;
  if (moveBudget(u) <= 0) return u.dashed ? 'No movement left (the Dash is used up).' : `No movement left this turn (Speed ${effSpeed(u)} already used).`;
  const reach = reachable(u, moveBudget(u)); if ([...reach.values()].every(c => !c)) return 'Surrounded: every space next to you is occupied (you can\'t move through enemies).';
  return null;
}
function canDrag(u) {
  if (PICK.react) return PICK.react.id === u.id;
  if (PICK.area) return false;
  if (G.over) return false;
  if (G.phase === 'setup' || G.freeMove || !C.enforceMoveAndRange) return true;
  if (G.busy || u.life <= 0) return false;
  const cur = current();
  if (u.comp) { const o = compOwner(u); return cur === o && o.control !== 'npc' && moveBudget(u) > 0; }
  if (u.side === 'pc') return u.control !== 'npc' && ((cur === u && moveBudget(u) > 0) || u.freeMove > 0);
  return cur === u && G.dmMode === 'human' && (moveBudget(u) > 0 || u.blinking);
}
function tryMove(u, to) {
  if (PICK.react && PICK.react.id === u.id) { const p = PICK.react.cells.find(x => x.c === to.c && x.r === to.r); if (!p) return `${PICK.react.label}: pick one of the highlighted spaces.`; endPick('react', p); return null; }
  if (!inMap(to.c, to.r)) return 'Off the map.';
  if (occupied(to.c, to.r, u)) return 'That space is taken.';
  if (isGiant(u) && !fits(u, to.c, to.r)) return `${u.name} is Giant: all 7 of its spaces must be free and on the map.`;
  if (to.c === u.c && to.r === u.r) return null;
  if (u.blinking) { const e = blinkTo(u, to); return e; }
  if (G.phase === 'setup' || G.freeMove || !C.enforceMoveAndRange) { u.c = to.c; u.r = to.r; afterMove(u); return null; }
  const reach = reachable(u, moveBudget(u)); const cost = reach.get(hk(to));
  if (cost == null) return `Too far: ${u.name} can move ${moveBudget(u)} space${moveBudget(u) === 1 ? '' : 's'} this turn.`;
  let c = cost; const fm = Math.min(u.freeMove || 0, c); u.freeMove -= fm; c -= fm; u.moveLeft -= c;
  const prev = { c: u.c, r: u.r };
  if (u.side === 'npc' && G.phase === 'battle') { walkNpc(u, pathTo(reach, u, to)); delete WALK[u.id]; } else { u.c = to.c; u.r = to.r; }
  u.moved = true;
  log(`${u.name} moves ${cost} space${cost === 1 ? '' : 's'}${moveBudget(u) ? ` (${moveBudget(u)} left)` : ''}.`, 'muted');
  afterMove(u);
  if (u.side === 'npc' && G.phase === 'battle' && u.life > 0) { G.busy = true; monsterMoved(u, prev).finally(() => { G.busy = false; if (!checkEnd()) renderTable(); }); }
  return null;
}
function afterMove(u) {
  if (u.side !== 'pc') return;
  Object.keys(u.thrown).forEach(w => {
    const all = thrownAt(u, w), keep = all.filter(pos => hexDist(u, pos) > 1), got = all.length - keep.length;
    if (!got) return;
    if (keep.length) u.thrown[w] = keep; else delete u.thrown[w];
    const n = carryOf(w);
    log(`${u.name} picks up ${n > 1 ? (got > 1 ? got + ' ' : 'a ') : 'the '}${n > 1 ? CARD[w].name.replace(/s$/, '') + (got > 1 ? 's' : '') : CARD[w].name}${n > 1 ? ` (${n - keep.length} of ${n} carried)` : ''}.`, 'muted');
  });
}
// thrown weapons: h.thrown[id] = list of spaces where a throw landed. carry = how many the hero has (Javelins 2, others 1).
const carryOf = id => weaponOf(id)?.carry || 1;
function thrownAt(h, id) { const v = h.thrown[id]; return !v ? [] : Array.isArray(v) ? v : [v]; }
const inHand = (h, id) => carryOf(id) - thrownAt(h, id).length;
const usableW = (h, id) => inHand(h, id) > 0;

// ---- hero attacks ----
const noBasic = h => h.type === 'Caster';
function weaponChoices(h, tok) {
  const m = tok.mode || {}; const out = [];
  const usable = id => usableW(h, id);
  const melee = weaponsOf(h).filter(id => weaponOf(id).kind === 'melee' && usable(id));
  const ranged = weaponsOf(h).filter(id => weaponOf(id).kind === 'ranged' && usable(id));
  const multi = m.multi || m.distinct || tok.kind === 'extra';
  const okSlow = id => !(multi && weaponOf(id).slow);
  const basic = !noBasic(h);   // v1.13 note 8: Casters have no basic attack (no cantrips either)
  if (m.spell) return [{ v: '', label: m.label }];
  if (m.noWeaponBonus) return [{ v: '', label: m.kind === 'ranged' ? `${m.label} (no weapon bonuses)` : 'Basic / shield (no weapon bonuses)' }];
  if (m.useMeleeWeapon) return melee.map(id => ({ v: id, label: `${CARD[id].name} (thrown)` }));
  if (m.kind === 'melee') { if (!m.oneHand && !m.paired) { if (basic) out.push({ v: '', label: 'Basic Attack' }); } melee.filter(id => (!m.oneHand || weaponOf(id).hands === 1) && (!m.paired || weaponOf(id).paired)).forEach(id => out.push({ v: id, label: CARD[id].name })); return out; }
  if (m.kind === 'ranged') return ranged.filter(okSlow).map(id => ({ v: id, label: CARD[id].name }));
  if (basic) out.push({ v: '', label: 'Basic Attack (melee)' });
  if (tok.kind === 'normal' && compOf(h, 'wolf')) out.push({ v: 'wolf', label: `🐺 Wolf attacks instead (from the Wolf, 1d6 + 1)` });
  melee.forEach(id => { out.push({ v: id, label: CARD[id].name + (weaponOf(id).reach > 1 ? ` (reach ${weaponOf(id).reach})` : '') }); if (weaponOf(id).throwRange) out.push({ v: id + '|throw', label: `${CARD[id].name} (throw, range ${weaponOf(id).throwRange})` }); });
  ranged.filter(okSlow).forEach(id => out.push({ v: id, label: `${CARD[id].name} (range ${weaponOf(id).range}${carryOf(id) > 1 ? `, ${inHand(h, id)} of ${carryOf(id)} left` : ''})` }));
  Object.keys(h.thrown).filter(id => !usableW(h, id)).forEach(id => out.push({ v: '#' + id, label: `${CARD[id].name} — ${carryOf(id) > 1 ? 'all thrown' : 'thrown'}, pick ${carryOf(id) > 1 ? 'one' : 'it'} up first (move into or next to its space)`, disabled: true }));
  return out;
}
function attackKind(tok, weapon) {
  const m = tok.mode || {};
  if (m.kind === 'ranged' || m.useMeleeWeapon) return 'ranged';
  if (m.kind === 'melee') return 'melee';
  if (weapon && weapon.endsWith('|throw')) return 'ranged';
  return weapon ? weaponOf(weapon).kind : 'melee';
}
const originOf = (h, A) => (A?.weapon === 'wolf' && compOf(h, 'wolf')) || h;
const spellRng = (h, r) => r >= 2 ? r + modSum(h, 'spellRange') : r;
const isSpellA = A => !!(A?.tok?.mode?.spell || (A?.weapon && weaponOf(A.weapon)?.spell));
// v1.10: Range cap (user): the Longbow is exactly CONFIG.range.longestTotal (10); every other ranged/spell attack stops at capOthers (9)
const RG = () => C.range || { default: 3 };
function capRange(r, weaponId) {
  const R = RG(); if (!R.longestTotal) return r;
  const base = weaponId && String(weaponId).split('|')[0];
  return base === R.longest ? Math.min(r, R.longestTotal) : Math.min(r, R.capOthers ?? R.longestTotal - 1);
}
function attackRange(h, A) {
  const m = A.tok.mode || {}; const w = A.weapon ? weaponOf(A.weapon) : null;
  if (A.kind === 'melee') return (w && !m.noWeaponBonus && w.reach) || 1;
  if (m.spell) return capRange(spellRng(h, m.range || RG().default) + (A.mods.range || 0));
  let r = m.range || (A.weapon?.endsWith('|throw') ? w.throwRange : w?.range) || RG().default;
  return capRange(r + modSum(h, 'rangedRange') + (A.mods.range || 0), m.noWeaponBonus || m.range ? null : A.weapon);
}
// v1.10: re-apply the range rule from CONFIG to the card data at load (so CONFIG is the single source of truth)
// v1.10.2: spells marked ownRange (the Wizard L2/L3 spells, Range 7-8, user-approved 2026-10-21) keep their printed range.
function applyRangeRule() {
  const R = C.range; if (!R?.default) return [];
  const out = [];
  for (const [id, fx] of Object.entries(FX)) {
    const w = fx.weapon;
    if (w && w.kind === 'ranged') { const v = R.default + (R.weaponBonus?.[id] || 0); if (w.range !== v) { out.push([id, w.range, v]); w.range = v; } }
    if (w && w.throwRange && w.throwRange !== R.default) { out.push([id, w.throwRange, R.default]); w.throwRange = R.default; }
    const sp = fx.spell; if (sp && sp.kind === 'attack' && sp.range && !sp.ownRange && sp.range !== R.default) { out.push([id, sp.range, R.default]); sp.range = R.default; }
    const ops = [...(fx.do || []), ...(fx.activate?.do || [])];
    ops.forEach(op => { if (op[0] === 'attackMode' && op[1]?.kind === 'ranged' && op[1].range && op[1].range !== R.default) { out.push([id, op[1].range, R.default]); op[1].range = R.default; } });
  }
  if (out.length) console.info('v1.10 range rule re-applied to', out);
  return out;
}
function targetCheck(h, A, t) {
  if (!t || t.life <= 0) return 'Down.';
  if (!A || !A.tok) return 'No attack available.';
  const m = A.tok.mode || {};
  if (A.tok.fixed) return t.id === A.tok.fixed ? null : `This roll is against ${byId(A.tok.fixed)?.name || 'another enemy'}.`;
  if (noBasic(h) && !A.weapon && !m.spell && !m.kind && !m.range && !m.noWeaponBonus) return 'Casters have no basic attack: cast a spell, or attack with a weapon card.';
  if (m.distinct && G.groups[A.tok.group]?.includes(t.id)) return 'Already attacked with this power-up.';
  if (A.tok.exclude?.includes(t.id)) return 'Must be a different enemy.';
  if (A.tok.adjacentOnly && !adjacent(h, t)) return 'Must be adjacent.';
  if (m.needOffGuardOrHidden && !isHidden(h) && !offGuard(t, h)) return 'Needs an Off Guard target (or you Hidden).';
  if (m.targetLifeMax && t.life > m.targetLifeMax) return `Needs ${m.targetLifeMax} Life or less.`;
  const o = originOf(h, A);
  if (enforce() && dist(o, t) > attackRange(h, A)) return `Out of range (${dist(o, t)} spaces${o !== h ? ' from the ' + o.name : ''}, range ${attackRange(h, A)}).`;
  return null;
}
function newAttack(h) {
  const tok = h.attacks[0]; if (!tok) return null;
  const A = { tok, weapon: '', target: null, d6: null, mods: {}, extraDmg: [], adjust: 0, critical: false, played: [], onHitOps: [], locked: false };
  Object.defineProperty(A, 'spell', { get: () => isSpellA(A), enumerable: false });
  chooseWeapon(h, A);
  return A;
}
// pick the weapon that can reach a target with the best Attack (players can change it)
function chooseWeapon(h, A) {
  let best = null;
  for (const o of weaponChoices(h, A.tok).filter(x => !x.disabled)) {
    A.weapon = o.v; A.kind = attackKind(A.tok, o.v);
    const legal = liveMonsters().filter(m => !targetCheck(h, A, m)).length;
    const score = (legal ? 100 : 0) + attackParts(h, A).reduce((s, p) => s + p[1], 0) + (o.v ? 0.1 : 0);
    if (!best || score > best.score) best = { v: o.v, score };
  }
  A.weapon = best ? best.v : ''; A.kind = attackKind(A.tok, A.weapon); A.target = null;
  pickBestTarget(h, A);
}
function pickBestTarget(h, A) {
  const legal = liveMonsters().filter(m => !targetCheck(h, A, m)).sort((a, b) => dist(h, a) - dist(h, b));
  if (!A.target || targetCheck(h, A, byId(A.target))) A.target = (legal[0] || liveMonsters().filter(m => !(A.tok.mode?.distinct && G.groups[A.tok.group]?.includes(m.id))).sort((a, b) => dist(h, a) - dist(h, b))[0])?.id || null;
}
function targetParts(h, A, parts) {
  const t = A.target && byId(A.target); if (!t) return parts;
  if (h.markId && h.markId === t.id && hasMod(h, 'markAtk')) parts.push(["Hunter's Eye (Marked)", modSum(h, 'markAtk')]);
  if (liveComps().some(c => c.comp === 'hawk' && adjacent(c, t))) parts.push(['Hawk (next to it)', 1]);
  const vs = fxSum(t, 'atkVsMe'); if (vs) parts.push([t.fx.filter(f => f.atkVsMe).map(f => f.label).join(', '), vs]);
  if (A.kind === 'ranged' && (terrainAt(originOf(h, A))?.type === 'fog' || terrainAt(t)?.type === 'fog')) parts.push(['Fog', -2]);
  return parts;
}
function attackParts(h, A) {
  const m = A.tok.mode || {}; const wid = A.weapon ? A.weapon.split('|')[0] : ''; const w = wid ? weaponOf(wid) : null;
  if (wid === 'wolf') return targetParts(h, A, [['Wolf 1d6 + 1', COMPANIONS.wolf.atk]]);
  const parts = [['Base Attack', h.stats.atk]];
  const useW = w && !m.noWeaponBonus;
  if (A.spell) {
    if (modSum(h, 'spellAtk')) cardsOf(h).forEach(id => { const v = FX[id]?.mods?.spellAtk; if (v) parts.push([CARD[id].name, v]); });
    if (A.kind === 'ranged' && engaged(h) && !hasMod(h, 'ignoreCloseQuarters') && !A.mods.ignoreCQ) parts.push(['Close Quarters', C.spells.spellCloseQuarters]);
  }
  if (A.kind === 'melee' && useW && w.paired && hasMod(h, 'pairedAtk')) parts.push(['Dual Wielder', modSum(h, 'pairedAtk')]);
  if (A.kind === 'melee') h.fx.forEach(f => { if (f.meleeAtkBonus) parts.push([f.label, f.meleeAtkBonus]); });
  targetParts(h, A, parts);
  if (useW && w.atk) parts.push([CARD[wid].name, w.atk]);
  if (A.kind === 'melee') {
    cardsOf(h).forEach(id => { const md = FX[id]?.mods || {}; if (md.meleeAtk) parts.push([CARD[id].name, md.meleeAtk]); if (md.oneHandMeleeAtk && useW && w.hands === 1) parts.push([CARD[id].name, md.oneHandMeleeAtk]); });
  } else {
    cardsOf(h).forEach(id => { const md = FX[id]?.mods || {}; if (md.rangedAtk) parts.push([CARD[id].name, md.rangedAtk]); });
    if (useW && w.closeQuarters && engaged(h) && !hasMod(h, 'ignoreCloseQuarters') && !A.mods.ignoreCQ) parts.push(['Close Quarters', C.closeQuarters]);
  }
  if (m.atk) parts.push([m.label, m.atk]);
  h.fx.forEach(f => { if (f.atk) parts.push([f.label, f.atk]); });
  if (A.mods.atk) parts.push([A.played.join(', ') || 'This attack', A.mods.atk]);
  return parts;
}
function critMin(h, A, t) {
  let c = 6;
  if (hasMod(h, 'critMin')) c = Math.min(c, ...cardsOf(h).map(id => FX[id]?.mods?.critMin || 6));
  t.fx.forEach(f => { if (f.markedBy === h.id) c = Math.min(c, f.markMin); });
  if (A.kind === 'ranged' && h.quarry === t.id && hasFlag(h, 'quarry')) c = Math.min(c, 5);
  if (A.mods.critMin) c = Math.min(c, A.mods.critMin);
  if (A.spell && hasMod(h, 'spellCritMin')) c = Math.min(c, modSum(h, 'spellCritMin'));
  return c;
}
function evalAttack() {
  const h = current(), A = G.atk; if (!A || A.d6 == null) return;
  const t = byId(A.target), m = A.tok.mode || {};
  const wid = A.weapon ? A.weapon.split('|')[0] : ''; const w = wid && !m.noWeaponBonus ? weaponOf(wid) : null;
  A.parts = attackParts(h, A); A.atkTotal = A.parts.reduce((s, p) => s + p[1], 0);
  A.tough = effTough(t); A.face = A.critical ? 6 : A.d6;
  A.hit = A.face + A.atkTotal >= A.tough; A.deadeye = false;
  if (!A.hit && A.kind === 'ranged' && hasMod(h, 'deadeye') && !h.usedRound.has('deadeye') && A.face + A.atkTotal === A.tough - 1) { A.hit = true; A.deadeye = true; }
  A.critMin = critMin(h, A, t); A.crit = A.hit && A.face >= A.critMin;
  A.offGuard = offGuard(t, h); A.hiddenAtRoll = A.hiddenAtRoll ?? isHidden(h);
  const dmg = [];
  if (m.killOnHit) dmg.push([m.label + ': drops to 0', t.life]);
  else if (m.fixedDmg) dmg.push([`${m.label} (fixed)`, m.fixedDmg]);
  else if (m.noDamage) dmg.push([`${m.label}: no Damage`, 0]);
  else if (wid === 'wolf') { dmg.push(['Wolf bite', C.combat.baseDamage]); if (A.crit && C.combat.critBonusDamage) dmg.push(['Critical', C.combat.critBonusDamage]); }
  else {
    dmg.push(['Hit', m.spell && m.dmg != null ? m.dmg : C.combat.baseDamage]);
    if (A.crit && C.combat.critBonusDamage) dmg.push(['Critical', C.combat.critBonusDamage]);   // USER RULE v1.8: a Critical does +1 Damage
    if (A.spell && A.crit && hasMod(h, 'spellCritDmg')) dmg.push(['Potent Spells (Critical)', modSum(h, 'spellCritDmg')]);
    bonusHits(h, A, t).forEach(b => dmg.push([b.label, b.dmg]));
    if (w?.dmg) dmg.push([CARD[wid].name, w.dmg]);
    if (w?.dmgIfD6AtLeast && A.face >= w.dmgIfD6AtLeast) dmg.push([`${CARD[wid].name} (d6 ${A.face})`, 1]);
    if (w?.critDmg && A.crit) dmg.push([`${CARD[wid].name} (Critical)`, w.critDmg]);
    if (w?.dmgVsOffGuard && A.offGuard) dmg.push([`${CARD[wid].name} (Off Guard)`, w.dmgVsOffGuard]);
    if (w?.dmgVsUnengaged && !liveHeroes().some(x => adjacent(x, t))) dmg.push([`${CARD[wid].name} (not Engaged)`, w.dmgVsUnengaged]);
    if (w?.hands === 2 && A.face === 6 && hasFlag(h, 'heavyHitter')) dmg.push(['Heavy Hitter (d6 6)', 1]);
    triggersOf(h, 'hitDmg').forEach(tr => { if (condOK(tr, A)) dmg.push([CARD[tr.id].name, tr.dmg]); });
    if (A.crit) triggersOf(h, 'crit', { kind: A.kind }).forEach(tr => { if (tr.dmg) dmg.push([`${CARD[tr.id].name} (Critical)`, tr.dmg]); });
    h.fx.forEach(f => { if (f.dmg) dmg.push([f.label, f.dmg]); });
    if (A.mods.dmgOnHit) dmg.push([A.played.join(', '), A.mods.dmgOnHit]);
    A.extraDmg.forEach(e => dmg.push(e));
  }
  A.dmgParts = dmg; A.dmg = Math.max(A.hit && !(A.tok.mode || {}).noDamage ? (C.minHitDamage ?? 1) : 0, dmg.reduce((s, p) => s + p[1], 0) + A.adjust);   // v1.9: a hit deals at least 1
}
function condOK(tr, A) {
  if (tr.cond === 'offGuardOrHidden') return A.offGuard || A.hiddenAtRoll;
  if (tr.cond === 'spell') return A.spell;
  if (tr.cond === 'emberWand') return /fire/i.test(A.tok.mode?.school || '');
  return false;
}
// once-per-round bonus Damage from Marks, Oath of Vengeance, Crusader's Mantle (used up in finishAttack)
function bonusHits(h, A, t) {
  const out = [];
  if (h.markId === t.id && !h.usedRound.has('mark')) out.push({ key: 'mark', label: "Hunter's Mark", dmg: 1 });
  if (A.kind === 'melee' && hasFlag(h, 'vengeance') && (t.hurtTick || 0) > (h.sinceTick || 0) && !h.usedRound.has('vengeance')) out.push({ key: 'vengeance', label: 'Oath of Vengeance', dmg: 1 });
  if (A.kind === 'melee' && !h.usedRound.has('mantle') && G.heroes.some(p => p.life > 0 && p.fx.some(f => f.mantle) && dist(p, h) <= 2)) out.push({ key: 'mantle', label: "Crusader's Mantle", dmg: 1 });
  return out;
}
function rollHeroAttack() {
  const h = current(), A = G.atk; const t = byId(A.target); if (!t) return;
  const why = targetCheck(h, A, t); if (why && enforce()) { toast(why); return; }
  A.hiddenAtRoll = isHidden(h);
  A.d6 = roll(C.combat.die); evalAttack();
  const tw = A.weapon && weaponOf(A.weapon)?.rerollMiss;
  if (!A.hit && tw && !h.usedRound.has('twin')) { h.usedRound.add('twin'); log(`${h.name} misses with a d6 ${A.d6} — ${CARD[A.weapon].name}: reroll (once per round).`, 'muted'); A.d6 = roll(C.combat.die); evalAttack(); }
  animateAttack(originOf(h, A), t, A.spell ? 'spell' : A.kind);
  log(`${h.name} ${A.tok.kind === 'special' ? A.tok.label + ': ' : ''}attacks ${t.name}${A.weapon ? ' with ' + CARD[A.weapon.split('|')[0]].name + (A.weapon.endsWith('|throw') ? ' (thrown)' : '') : ''} (${A.spell ? 'Spell Attack, ' : ''}${A.kind}, ${dist(originOf(h, A), t)} sp): d6 ${A.d6} + ${A.atkTotal} = ${A.d6 + A.atkTotal} vs Toughness ${A.tough} → ${A.hit ? (A.crit ? 'CRITICAL HIT' : 'HIT') : 'MISS'}${A.deadeye ? ' (Deadeye)' : ''}${A.offGuard ? ' · Off Guard' : ''}${A.hiddenAtRoll ? ' · from Hidden' : ''}.`, A.hit ? 'hit' : 'miss');
  renderTable();
}
async function finishAttack(applyIt) {
  { const hh = current(); if (hh && UI.armed) delete UI.armed[hh.id]; }   // v1.11: each attack needs Attack pressed again (the weapon stays selected)
  const h = current(), A = G.atk, t = byId(A.target), m = A.tok.mode || {};
  G.busy = true;
  const life0 = t ? t.life : 0, wName = A.weapon && A.weapon !== 'wolf' ? CARD[A.weapon.split('|')[0]]?.name : A.spell ? m.label : A.weapon === 'wolf' ? 'bite' : A.kind === 'ranged' ? 'shot' : 'blade';
  if (!(A.hit && applyIt) && t) missPuff(t);
  HOLD.n++;
  if (A.hit && applyIt) {
    if (A.deadeye) h.usedRound.add('deadeye');
    triggersOf(h, 'hitDmg').forEach(tr => { if (condOK(tr, A)) markUsed(h, tr.key, tr.per); });
    if (!m.killOnHit && !m.fixedDmg && !m.noDamage && A.weapon !== 'wolf') bonusHits(h, A, t).forEach(b => h.usedRound.add(b.key));
    const dealt = damage(t, m.noDamage ? A.dmg : Math.max(C.minHitDamage ?? 1, A.dmg || 0), { crit: !!A.crit, fire: isFireCard(m.card ? CARD[m.card] : m.school ? { name: m.label, school: m.school } : null), byHero: true }); log(`${t.name} takes ${dealt} Damage (${t.life}/${t.maxLife} Life left).`, 'hit');
    const x = { h, t, A, card: m.card ? CARD[m.card] : { name: m.label || 'Attack' } };
    for (const op of m.onHit || []) await KW.run(E, x, op);
    for (const [card, op] of A.onHitOps) await KW.run(E, { ...x, card }, op);
    if (t.life > 0) await fireTriggers(h, 'hit', { kind: A.kind, t, A });
    const wh = A.weapon && weaponOf(A.weapon);
    if (wh?.healOnD6 && A.face >= wh.healOnD6) { const ht = mostHurt([h, ...liveHeroes().filter(u => adjacent(u, h))]); if (ht) heal(ht, 1, `${CARD[A.weapon].name} (${h.name}'s weapon, d6 ${A.face})`); }
    if (t.life === 0 && h.markId === t.id) { h.markId = null; if (hasMod(h, 'slayerMark')) { const nx = liveMonsters().filter(mm => dist(mm, h) <= 5); if (nx.length) { const n2 = await asHero(h, () => E.pickUnit(`${h.name}: Slayer's Mark — move the Mark`, nx)); if (n2) markEnemy(h, n2); } } }
    h.fx = h.fx.filter(f => f.until !== 'nextHit');
    if (t.life === 0 && hasFlag(h, 'cleave') && !h.cleaveUsed && A.kind === 'melee' && liveMonsters().some(mm => adjacent(h, mm))) {
      h.cleaveUsed = true; h.attacks.push({ uid: uid(), kind: 'extra', label: 'Cleave', mode: { kind: 'melee' }, adjacentOnly: true, exclude: [t.id] }); log(`Cleave: ${h.name} gets one more melee attack against a different adjacent enemy.`, 'play');
    }
  }
  // thrown weapons land in the target's space
  const wid = A.weapon ? A.weapon.split('|')[0] : '';
  if (wid && (A.weapon.endsWith('|throw') || m.thrown || weaponOf(wid).carry) && !weaponOf(wid).noPickup) {
    h.thrown[wid] = [...thrownAt(h, wid), { c: t.c, r: t.r }];
    const n = carryOf(wid);
    log(n > 1 ? `A ${CARD[wid].name.replace(/s$/, '')} lands in ${t.name}'s space (${inHand(h, wid)} of ${n} left) — move into or next to that space to pick it up.`
      : `The ${CARD[wid].name} lands in ${t.name}'s space — move next to it to pick it up.`, 'muted');
  }
  h.fx = h.fx.filter(f => f.until !== 'nextAttack' && f.until !== 'nextAttackOrOwnerEndNextTurn');
  if (m.distinct || A.tok.group) (G.groups[A.tok.group] = G.groups[A.tok.group] || []).push(t.id);
  G.lastTarget = t.id;
  h.attacks = h.attacks.filter(x => x.uid !== A.tok.uid);
  if (A.tok.kind === 'normal' && ACT_ON()) { (h.acts = h.acts || []).push('W'); syncNormals(h); }   // v1.9: one weapon attack used
  h.attackedThisTurn = true;
  unhide(h, 'attacked');
  for (const op of m.after || []) await KW.run(E, { h, t, A, card: { name: m.label } }, op);
  if (h.style === 'Ranger' && !h.usedRound.has('skirmish') && h.life > 0) { h.usedRound.add('skirmish'); const n = Math.max(1, modSum(h, 'skirmish')); h.freeMove = (h.freeMove || 0) + n; log(`Skirmish: ${h.name} may move ${n} space${n > 1 ? 's' : ''} now (Disengage).`, 'muted'); }
  if (A.crit && applyIt && A.hit) await fireTriggers(h, 'crit', { kind: A.kind, t, A });
  await fireTriggers(h, 'afterAttack', { t, A });
  if (t) narrate('attack', { a: originOf(h, A), t, hit: !!(A.hit && applyIt), dmg: Math.max(0, life0 - t.life), crit: !!A.crit, w: wName, ranged: A.kind === 'ranged' });
  releaseHold();
  G.atk = null; G.busy = false;
  if (checkEnd()) return;
  renderTable();
}

// ---- power-ups ----
const canPlay = h => h.playsUsed < h.picks.play;
// v1.11.1 (user rule, note 6): every POWER-UP has exactly one timing read from its text: before attack, after attack or anytime.
// CONFIG.puTiming overrides the text reading for a card. The timing decides when it can be played and when it is greyed; the popup shows it.
const PUT_LBL = { before: 'Before attack', after: 'After attack', anytime: 'Anytime' };
function puTiming(id) {
  const c = CARD[id]; if (!c || c.type !== 'Power-up') return null;
  if (C.puTiming?.[id]) return C.puTiming[id];
  const t = (c.text || '').toLowerCase();
  if (/after you roll|after your attack|after you attack|when you hit|when you score a critical|when your [a-z ]*?(attack|shot|strike) hits/.test(t)) return 'after';
  if (/before you roll|when you attack|replaces (your normal|one of your) attacks?|\bmake (one|a) (extra |melee |ranged )?(weapon )?attack|then make a melee attack/.test(t)) return 'before';
  return 'anytime';
}
const isReactPU = id => { const w = FX[id]?.when || ''; return w.startsWith('react') || w === 'initiative'; };
function reqCheck(h, id, A) {
  for (const r of FX[id]?.req || []) { const ok = KW.REQS[r] ? KW.REQS[r](E, h, A) : true; if (ok !== true) return ok; }
  return null;
}
function playOptions(h, id) {
  const fx = FX[id] || {}, me = current() === h, A = G.atk;
  if (G.phase !== 'battle' || G.over) return [];
  const lim = !canPlay(h) ? `You've used your ${h.picks.play} play${h.picks.play > 1 ? 's' : ''} this round.` : null;
  const isAttackCard = (fx.do || []).some(op => op[0] === 'attackMode' && !op[1].add);
  let w = (me && h.dashed && dashBlocksCard(id) ? DASHED_CARD : null) || lim, label = 'Play';
  switch (fx.when) {
    case 'turn':
      w = w || (!me ? 'Play on your own turn.' : null) || (A && A.d6 != null ? 'Finish the current attack first.' : null);
      if (!w && puTiming(id) === 'after' && !h.attackedThisTurn) w = 'After attack: play it once you have attacked this turn.';   // v1.11.1 audit (Vanish, Hit and Run)
      if (!w && isAttackCard) {
        const replace = fx.attackCard !== 'warrior' || C.attackPowerups.warriorReplace;
        if (replace && !h.attacks.some(t => t.kind === 'normal')) w = 'This replaces your normal attack, which is already used.';
      }
      break;
    // v1.11.1 audit: a before-attack card is usable from the start of your turn (it was greyed until an attack was armed); playing it starts the attack
    case 'beforeRoll': w = w || (!me || (A && A.d6 != null) ? 'Play before you roll an attack.' : !A && (!h.attacks.length || h.dashed) ? 'No attack left this turn.' : null); label = A ? 'Play on this attack' : 'Play on your next attack'; break;
    case 'afterRoll': w = w || (!me || !A || A.d6 == null ? 'Play right after you roll your attack d6.' : A.critical ? 'Already played.' : A.locked ? 'A hit power-up was already played on this roll.' : null); label = 'Play (d6 counts as 6)'; break;
    case 'onHit': w = w || (!me || !A || A.d6 == null || !A.hit ? 'Play after one of your attacks hits.' : A.played.includes(CARD[id].name) ? 'Already played on this hit.' : null); label = 'Play on this hit'; break;
    case 'onCrit': w = w || (!me || !A || A.d6 == null || !A.crit ? 'Play when you score a Critical hit.' : A.played.includes(CARD[id].name) ? 'Already played.' : null); label = 'Play on this Critical'; break;
    case 'manual': label = 'Play (apply by hand)'; break;
    default: return [{ label: 'Play', disabled: true, why: 'The site asks you when this can be played (initiative, or when an enemy attacks you).', fn: () => {} }];
  }
  if (!w) w = reqCheck(h, id, A || (fx.when === 'beforeRoll' && me ? newAttack(h) : null));
  return [{ label, disabled: !!w, why: w || '', fn: () => { pushUndo(`play ${CARD[id].name}`); if (fx.when === 'beforeRoll' && !G.atk) G.atk = newAttack(h); return playCard(h, id); } }];
}
async function playCard(h, id) {
  const c = CARD[id], fx = FX[id] || {};
  h.hand.splice(h.hand.indexOf(id), 1); h.discard.push(id); h.playsUsed++;
  log(`${h.name} plays ${c.name}.`, 'play');
  const A = G.atk; const x = { h, A, t: A ? byId(A.target) : null, card: c };
  if (fx.when === 'onHit' || fx.when === 'onCrit') {
    A.played.push(c.name); A.locked = true;
    for (const op of fx.do || []) { if (['hitDmg', 'chooseOne', 'attackMode'].includes(op[0])) await KW.run(E, x, op); else A.onHitOps.push([c, op]); }
    evalAttack();
  } else if (fx.do) {
    for (const op of fx.do) {
      if (op[0] === 'attackMode' && fx.attackCard === 'warrior' && !C.attackPowerups.warriorReplace) await KW.run(E, x, ['attackMode', { ...op[1], add: true }]);
      else await KW.run(E, x, op);
    }
  } else log(`Apply by hand: ${c.text}`, 'muted');
  if (fx.when === 'turn' && G.atk && G.atk.d6 == null) G.atk = null; // re-aim with the new attack options
  renderTable();
}
async function useActivation(h, id) {
  const a = FX[id].activate; markUsed(h, id + ':act', a.per);
  if (a.usesAction) { useOneAction(h); h.castThisTurn = true; G.atk = null; }
  log(`${h.name} uses ${CARD[id].name}.`, 'play');
  for (const op of a.do) await KW.run(E, { h, A: G.atk, card: CARD[id] }, op);
  renderTable();
}
function activations(h, phase) {
  return h.cards.equipment.concat(h.cards.abilities).filter(id => FX[id]?.activate?.phase === phase && !(h.dashed && current() === h && dashBlocksCard(id)) && !usedOnce(h, id + ':act', FX[id].activate.per)
    && !(FX[id].activate.usesAction && !h.attacks.some(t => t.kind === 'normal'))
    && !(FX[id].activate.do.some(o => o[0] === 'attackMode') && !h.attacks.some(t => t.kind === 'normal')));
}
// =====================================================================
// SPELLS (v1.5, rulebook §13): face up / face down, one cast per turn as your action (OPEN), Smites / Strikes on hits
// =====================================================================
function flipDown(h, id) { h.spellDown.add(id); if (isOnce(id)) h.spellSpent.add(id); }
function flipAllUp(h) { const n = [...h.spellDown].filter(id => !h.spellSpent.has(id)).length; h.spellDown = new Set(h.spellSpent); log(`${h.name}: all spells face up${n ? ` (${n} flipped)` : ''}.`, 'play'); }
async function flipOneUp(h) {
  const down = h.spells.filter(id => h.spellDown.has(id)); if (!down.length) return;
  const id = down.length === 1 ? down[0] : await ask('Renewed Faith', 'Flip which spell face up?', down.map(id => ({ label: esc(CARD[id].name), value: id, cls: 'primary' })));
  h.spellDown.delete(id); h.spellSpent.delete(id); log(`${h.name} flips ${CARD[id].name} face up.`, 'play');
}
function markEnemy(h, t) {
  G.monsters.forEach(m => { m.fx = m.fx.filter(f => f.rangerMark !== h.id); });
  h.markId = t.id; addFx(t, { rangerMark: h.id }, 'fight', h, `Marked (${h.name})`); log(`${t.name} is ${h.name}'s Marked enemy.`, 'play');
}
async function pickAlly(h, range, title) {
  const list = range === 0 ? [h] : helpHeroes().filter(u => u === h || dist(u, h) <= (range === 'adj' ? 1 : range));
  if (list.length <= 1) return list[0];
  if (AI_ACTOR) return mostHurt(list) || h;
  return byId(await ask(esc(title || 'Choose a hero'), '', list.map(u => ({ label: `${esc(u.name)} (${u.life}/${u.maxLife})`, value: u.id, cls: 'primary' }))));
}
function hexesWithin(center, r) { const out = []; for (let rr = 0; rr <= GMAX.r; rr++) for (let c = 0; c <= GMAX.c; c++) if (inMap(c, rr) && hexDist(center, { c, r: rr }) <= r) out.push({ c, r: rr }); return out; }
function addTerrain(h, center, type, radius, until, wall) {
  let cells = hexesWithin(center, radius);
  if (wall) { const row = []; for (let dc = -2; dc <= 2; dc++) { const p = { c: center.c + dc, r: center.r }; if (inMap(p.c, p.r)) row.push(p); } cells = row.slice(0, wall); }
  cells.forEach(p => G.terrain.set(hk(p), { type, owner: h.id, until }));
  log(`${cells.length} space${cells.length > 1 ? 's' : ''} become ${type === 'fog' ? 'Fog' : type === 'thorns' ? 'Thorns' : 'Overgrowth'}${until === 'fight' ? ' for the rest of the fight' : ' until the start of ' + h.name + "'s next turn"}.`, 'play');
}
async function placeSnare(h, n) {
  const foes = liveMonsters().filter(m => dist(m, h) <= n + 1);
  const t = foes.length ? (await E.pickUnit(`${h.name}: place the Snare next to which enemy?`, foes) || foes[0]) : liveMonsters().sort((a, b) => dist(a, h) - dist(b, h))[0];
  if (!t) return;
  const spot = hexesWithin(h, n).filter(p => !occupied(p.c, p.r) && hexDist(p, h) >= 1).sort((a, b) => hexDist(a, t) - hexDist(b, t) || hexDist(a, h) - hexDist(b, h))[0];
  if (!spot) { log('No empty space for the Snare.', 'muted'); return; }
  G.snares[h.id] = spot; log(`${h.name} places a Snare ${hexDist(spot, h)} space${hexDist(spot, h) === 1 ? '' : 's'} away (${hexDist(spot, t)} from ${t.name}).`, 'play');
}
// ---- v1.9 actions per turn (CONFIG.turnActions): W = weapon attack, S = any action spell, S1-S3 = exact spell level ----
const ACT_ON = () => !!C.turnActions?.enabled;
function actCombos(h) { const T = C.turnActions[h.type] || C.turnActions.Fighter; return T[Math.min(3, Math.max(1, h.level || 1))] || [['W']]; }
function actFits(used, combo) {
  const left = [...combo];
  for (const u of [...used].sort((a, b) => (b.length - a.length))) {   // exact spell levels first
    let i = u === 'W' ? left.indexOf('W') : u.startsWith('S') ? left.indexOf(u) : -1;
    if (i < 0 && u.startsWith('S')) i = left.indexOf('S');
    if (i < 0) return null; left.splice(i, 1);
  }
  return left;
}
const actLeft = (h, extra = []) => actCombos(h).map(c => actFits([...(h.acts || []), ...extra], c)).filter(Boolean);
const wLeft = (h, extra = []) => Math.max(0, ...actLeft(h, extra).map(l => l.filter(x => x === 'W').length));
const spellSlotOK = (h, lvl) => actLeft(h, ['S' + (lvl || 1)]).length > 0;
const spellLevelOf = id => Math.max(1, CARD[id]?.level || 1);
function actText(h) {
  const L = actLeft(h); if (!L.length || L.every(l => !l.length)) return 'nothing (your actions are used)';
  const nm = x => x === 'W' ? 'a weapon attack' : x === 'S' ? 'a spell' : `a Level ${x.slice(1)} spell`;
  return [...new Set(L.filter(l => l.length).map(l => l.map(nm).join(' + ')))].join(', or ');
}
// keep the hero's 'normal' attack tokens equal to the weapon attacks it may still make this turn
function syncNormals(h) {
  if (!ACT_ON() || h.dashed || h.side !== 'pc' || h.comp) return;
  const want = wLeft(h), cur = h.attacks.filter(t => t.kind === 'normal');
  if (cur.length > want) { const drop = new Set(cur.slice(want).map(t => t.uid)); h.attacks = h.attacks.filter(t => !drop.has(t.uid)); if (G.atk && drop.has(G.atk.tok?.uid) && G.atk.d6 == null) G.atk = null; }
  else for (let i = cur.length; i < want; i++) h.attacks.push({ uid: uid(), kind: 'normal', label: 'Normal attack' });
}
function useOneAction(h) {   // a power-up / item that "uses your action" (or replaces your attack) takes one weapon-attack slot
  if (!ACT_ON()) { h.attacks = h.attacks.filter(t => t.kind !== 'normal'); h.castThisTurn = true; return; }
  const i = h.attacks.findIndex(t => t.kind === 'normal'); if (i < 0) return;
  h.attacks.splice(i, 1); (h.acts = h.acts || []).push('W'); syncNormals(h);
}
// what stops a cast right now (null = castable)
function canCast(h, id) {
  const sp = FX[id]?.spell; if (!sp) return 'Not a spell.';
  if (['reaction', 'smite', 'strike'].includes(sp.kind)) return sp.kind === 'reaction' ? 'Reaction: the site offers it when its trigger happens.' : `${sp.kind === 'smite' ? 'Smite' : 'Strike'}: offered right after your ${sp.kind === 'smite' ? 'melee' : 'weapon'} attack hits.`;
  if (G.phase !== 'battle' || G.over || current() !== h) return 'Cast on your own turn.';
  if (h.dashed) return DASHED;
  if (G.atk && G.atk.d6 != null) return 'Finish the current attack first.';
  if (h.spellSpent.has(id)) return 'Once per fight: already cast.';
  if (h.spellDown.has(id)) return 'Face down: it flips up at the start of your next turn.';
  if (h.fx.some(f => f.bear)) return 'You are a Bear: no spells.';
  if (ACT_ON()) { if (!spellSlotOK(h, spellLevelOf(id)) && !(h.extraCasts > 0)) return `Not with this turn's actions (Level ${h.level} ${h.type}). You can still make: ${actText(h)}.`; }
  else { const hasAction = h.attacks.some(t => t.kind === 'normal') && !(C.spells.oneSpellPerTurn && h.castThisTurn);
    if (C.spells.castIsYourAction && !hasAction && !(h.extraCasts > 0)) return h.castThisTurn ? 'One spell per turn (Mana Potion / Mana Surge give one more).' : 'Your action is used (casting replaces your attack — OPEN).'; }
  const R = r => spellRng(h, r);
  const foes = r => liveMonsters().filter(m => !enforce() || dist(m, h) <= R(r));
  if (sp.kind === 'attack') { if (sp.weaponAttack && !heroRangedWeapon(h)) return 'Needs a ranged weapon.'; if (sp.melee ? !liveMonsters().some(m => adjacent(m, h)) : !foes(sp.range).length) return sp.melee ? 'No adjacent enemy.' : `No enemy within Range ${R(sp.range)}.`; }
  if (sp.kind === 'check') { const t = sp.targets || 'one'; if ((t === 'adjacent' && !liveMonsters().some(m => adjacent(m, h))) || (t === 'within' && !liveMonsters().some(m => dist(m, h) <= sp.within)) || ((t === 'one' || t === 'area') && !foes(sp.range).length)) return 'No enemy in range.'; }
  if ((sp.kind === 'enemy' || sp.kind === 'mark' || sp.kind === 'terrain') && !foes(sp.range).length) return `No enemy within Range ${R(sp.range)}.`;
  if (sp.kind === 'shape' && h.fx.some(f => f.bear)) return 'Already a Bear.';
  return null;
}
function spendCast(h, opts, id) {
  if (opts.scroll) return;
  if (h.freeCasts > 0) { h.freeCasts--; h.extraCasts = Math.max(0, h.extraCasts - 1); return; }
  if (ACT_ON()) { const L = spellLevelOf(id);
    if (spellSlotOK(h, L)) { (h.acts = h.acts || []).push('S' + L); h.castThisTurn = true; syncNormals(h); }
    else h.extraCasts = Math.max(0, h.extraCasts - 1);
    return; }
  const hasAction = h.attacks.some(t => t.kind === 'normal') && !(C.spells.oneSpellPerTurn && h.castThisTurn);
  if (hasAction) { h.attacks = h.attacks.filter(t => t.kind !== 'normal'); h.castThisTurn = true; }
  else h.extraCasts = Math.max(0, h.extraCasts - 1);
}
async function castSpell(h, id, opts = {}) {
  const sp = FX[id]?.spell, c = CARD[id];
  if (!opts.scroll) { const why = canCast(h, id); if (why) { toast(why); return false; } }
  G.atk = null;
  // v1.9 area spells (rulebook §16, provisional): place the area first; cancelling costs nothing
  let area = null;
  if (isAreaSave(id)) { area = await chooseArea(h, id); if (!area) { renderTable(); return false; } }
  spendCast(h, opts, id); if (!opts.scroll) flipDown(h, id);
  h.casts = (h.casts || 0) + 1;
  log(`${h.name} casts ${c.name}${opts.scroll ? ' (from a scroll)' : ''}${isOnce(id) ? ' (once per fight)' : ''}.`, 'play');
  const x = { h, card: c };
  const R = r => spellRng(h, r);
  const inR = r => liveMonsters().filter(m => !enforce() || dist(m, h) <= R(r));
  const pick = async (list, title) => E.pickUnit(`${c.name}: ${title}`, list);
  const empower = () => { if (h.empower) { h.empower = false; log('Empower: one more target.', 'play'); return 1; } return 0; };
  if (area) await resolveAreaSave(h, id, area);
  else if (sp.kind === 'manual') log(`${c.name} is a text-only card (v0.3): apply its text by hand.`, 'sys');
  else if (sp.kind === 'attack') {
    const mode = { label: c.name, card: c.id, spell: !sp.weaponAttack, kind: sp.melee ? 'melee' : 'ranged', range: sp.range, atk: sp.atk, dmg: sp.dmg, onHit: sp.onHit, after: sp.after, school: c.school, add: true, multi: sp.weaponAttack };
    let fixed = null;
    if (sp.area) { const ctr = await pick(inR(sp.range), 'centre on which enemy?'); if (ctr) fixed = liveMonsters().filter(m => hexDist(m, ctr) <= sp.area); }
    else if (sp.line) { const dir = await pick(inR(sp.range), 'aim the line at which enemy?'); if (dir) { const line = hexLine(h, dir, sp.line); fixed = liveMonsters().filter(m => line.some(p => p.c === m.c && p.r === m.r)); } }
    if (fixed) { const g = uid(); G.groups[g] = []; fixed.forEach(m => h.attacks.unshift({ uid: uid(), kind: 'special', label: `${c.name} → ${m.name}`, mode, group: g, fixed: m.id })); log(`${c.name}: ${fixed.length} roll${fixed.length === 1 ? '' : 's'} (${fixed.map(m => m.name).join(', ')}).`, 'play'); }
    else { const n = (sp.count || 1) + empower(); KW.OPS.attackMode(E, x, { ...mode, count: n, distinct: n > 1 || sp.distinct }); }
  } else if (sp.kind === 'check') {
    const t = sp.targets || 'one'; let list = [];
    if (t === 'adjacent') list = liveMonsters().filter(m => adjacent(m, h));
    else if (t === 'within') list = liveMonsters().filter(m => dist(m, h) <= sp.within);
    else if (t === 'area') { const ctr = await pick(inR(sp.range), 'centre on which enemy?'); list = ctr ? liveMonsters().filter(m => hexDist(m, ctr) <= 1) : []; }
    else { const n = 1 + empower(); list = n > 1 ? await E.pickUnits(`${c.name}: choose up to ${n} enemies`, inR(sp.range), n) : [await pick(inR(sp.range), 'target which enemy?')].filter(Boolean); }
    for (const tg of list) {
      const d = roll(6), bonus = modSum(h, 'spellCheck') + (h.checkBonus || 0), need = C.spells.spellCheckBase + (tg.stats.res || 0), tot = d + h.stats.skill + bonus;
      const ok = tot >= need;
      log(`${c.name} Spell Check vs ${tg.name}: d6 ${d} + Skill ${h.stats.skill}${bonus ? ' + ' + bonus : ''} = ${tot} vs ${need} (3 + Resilience ${tg.stats.res || 0}) → ${ok ? 'SUCCESS' : 'FAIL'}.`, ok ? 'hit' : 'miss');
      if (ok) for (const op of sp.success) await KW.run(E, { ...x, t: tg }, op);
    }
    h.checkBonus = 0;
    for (const op of sp.after || []) await KW.run(E, x, op);
  } else if (sp.kind === 'enemy') {
    const n = 1 + empower(); const list = n > 1 ? await E.pickUnits(`${c.name}: choose up to ${n} enemies`, inR(sp.range), n) : [await pick(inR(sp.range), 'target which enemy?')].filter(Boolean);
    for (const t of list) for (const op of sp.do) await KW.run(E, { ...x, t }, op);
  } else if (sp.kind === 'ally') {
    const t = await pickAlly(h, sp.range === 'adj' ? 'adj' : sp.range === 0 ? 0 : R(sp.range), c.name);
    if (t) { const f0 = t.fx.length; for (const op of sp.do) await KW.run(E, { ...x, t }, op); if (t.fx.length > f0) log(`${t.name} gains ${c.name}.`, 'play'); }
  } else if (sp.kind === 'allWithin') {
    const ts = helpHeroes().filter(u => dist(u, h) <= R(sp.range)), f0 = ts.map(u => u.fx.length);
    for (const t of ts) for (const op of sp.do) await KW.run(E, { ...x, t }, op);
    const got = ts.filter((u, i) => u.fx.length > f0[i]); if (got.length) log(`${c.name} on ${got.map(u => u.name).join(', ')}.`, 'play');
  } else if (sp.kind === 'terrain') {
    const ctr = await pick(inR(sp.range), sp.wall ? 'place the wall next to which enemy?' : 'centre on which enemy?');
    if (ctr) { const big = h.bigArea && !sp.wall ? 1 : 0; if (big) { h.bigArea = false; log('Rapid Growth: 5x5 area.', 'play'); } addTerrain(h, ctr, sp.terrain, (sp.radius || 0) + big, sp.until, sp.wall); }
  } else if (sp.kind === 'snare') await placeSnare(h, sp.range);
  else if (sp.kind === 'mark') { const t = await pick(inR(sp.range), 'mark which enemy?'); if (t) markEnemy(h, t); }
  else if (sp.kind === 'shape') { addFx(h, { tough: 2, bear: true }, 'fight', h, 'Bear form'); log(`${h.name} becomes a Bear: +2 Toughness, Touch Attack +1 Damage, no spells.`, 'play'); }
  // Archdruid: once per round, after you cast a spell, you or a hero within 3 heals 1
  if (hasMod(h, 'archdruid') && !h.usedRound.has('archdruid')) { const t = mostHurt(helpHeroes().filter(u => dist(u, h) <= 3 && u.life < u.maxLife)); if (t) { h.usedRound.add('archdruid'); healBy(h, t, 1, `Archdruid (${h.name}'s Druid ability, after casting a spell)`); } }
  if (checkEnd()) return true;
  renderTable(); return true;
}
// ---- v1.9 AREA SPELLS (rulebook §16, provisional; CONFIG.areaSpells) ----
// Each creature in the area rolls 1d6 + Resilience vs DC 3 + caster Skill: meet or beat = half Damage (rounded down, may be 0), fail = full Damage + effect.
const isAreaSave = id => !!(C.areaSpells?.enabled && (C.areaSpells.cards || []).includes(id) && FX[id]?.spell && spellLevelOf(id) >= (C.areaSpells.minSpellLevel || 2));
function areaShape(h, id) {
  const sp = FX[id].spell, eo = !!sp.enemiesOnly;
  // v1.10.2 chain (Chain Lightning II): a first enemy in range, then up to `jumps` more enemies, each within `within` of the one before
  if (sp.chain) return { kind: 'chain', jumps: sp.chain.jumps, within: sp.chain.within, range: capRange(spellRng(h, sp.range || RG().default)), enemiesOnly: true };
  if (sp.line) return { kind: 'line', len: sp.line, range: sp.line, enemiesOnly: eo };
  if (sp.targets === 'within') return { kind: 'self', radius: sp.within, range: 0, enemiesOnly: eo };
  return { kind: 'burst', radius: sp.area || 1, range: capRange(spellRng(h, sp.range || RG().default)), enemiesOnly: eo };
}
// chain: the enemies that can be the next link (first link: within the spell's range of the caster)
function chainNext(h, shape, ids) {
  if (ids.length >= 1 + shape.jumps) return [];
  const last = ids.length ? byId(ids[ids.length - 1]) : null;
  return liveMonsters().filter(m => !ids.includes(m.id) && (last ? hexDist(m, last) <= shape.within : (!enforce() || dist(m, h) <= shape.range)));
}
function autoChain(h, shape) {
  let best = null;
  const walk = ids => {
    const nx = chainNext(h, shape, ids);
    const life = ids.reduce((a, id) => a + byId(id).life, 0);
    if (ids.length && (!best || ids.length > best.ids.length || (ids.length === best.ids.length && life < best.life))) best = { ids: [...ids], life };
    nx.forEach(m => walk([...ids, m.id]));
  };
  walk([]);
  if (!best) return null;
  const at = { ids: best.ids }, cells = areaCellsAt(h, shape, at);
  return { at, cells, score: best.ids.length, shape };
}
function areaCellsAt(h, shape, at) {
  if (shape.kind === 'self') return hexesWithin(h, shape.radius).filter(p => !(p.c === h.c && p.r === h.r));
  if (!at) return [];
  if (shape.kind === 'chain') return (at.ids || []).map(byId).filter(u => u && u.life > 0).map(u => ({ c: u.c, r: u.r }));
  if (shape.kind === 'line') return hexLine(h, at, shape.len).filter(p => inMap(p.c, p.r));
  return hexesWithin(at, shape.radius);
}
function areaCreatures(h, cells, shape) {
  const inA = u => cells.some(p => footprint(u).some(q => p.c === q.c && p.r === q.r));   // v1.11: a Giant is hit once if the area touches any of its 7 hexes
  const foes = liveMonsters().filter(inA);
  const allies = C.areaSpells.hitsAllies && !shape?.enemiesOnly ? [...liveHeroes(), ...liveComps()].filter(u => u !== h && inA(u)) : [];   // v1.10.2: Frost Nova II / Chain Lightning II hit enemies only
  return { foes, allies, all: [...foes, ...allies] };
}
function areaDmg(h, sp) {
  if (sp.weaponAttack) { const w = heroRangedWeapon(h); return (C.combat.baseDamage || 1) + (w ? (weaponOf(w).dmg || 0) : 0); }
  return sp.dmg || 0;
}
function areaCentres(h, shape) {
  if (shape.kind === 'self') return [{ c: h.c, r: h.r }];
  return hexesWithin(h, shape.range).filter(p => hexDist(p, h) >= 1);
}
function autoArea(h, id) {
  const shape = areaShape(h, id); let best = null;
  if (shape.kind === 'chain') return autoChain(h, shape);
  for (const at of areaCentres(h, shape)) {
    const cells = areaCellsAt(h, shape, at), cr = areaCreatures(h, cells, shape), score = cr.foes.length - 1.5 * cr.allies.length;
    if (cr.foes.length && score > 0 && (!best || score > best.score)) best = { at, cells, score, shape };
  }
  return best;
}
async function chooseArea(h, id) {
  const shape = areaShape(h, id);
  if (h.control === 'npc' || !humanPicks(h)) { const a = autoArea(h, id); if (!a) log(`${CARD[id].name}: no good place for the area (it would hit no enemy, or more allies than enemies).`, 'muted'); return a; }
  const busy0 = G.busy; G.busy = true;
  try {
    const at = await pickHex('area', { h: h.id, id, shape, centres: shape.kind === 'chain' ? chainNext(h, shape, []) : areaCentres(h, shape), chain: [], at: shape.kind === 'self' ? { c: h.c, r: h.r } : null });
    if (!at) { log(`${CARD[id].name}: cancelled (nothing spent).`, 'muted'); return null; }
    const cells = areaCellsAt(h, shape, at); return { at, cells, shape };
  } finally { G.busy = busy0; }
}
async function resolveAreaSave(h, id, area) {
  const c = CARD[id], sp = FX[id].spell, cr = areaCreatures(h, area.cells, area.shape), full = areaDmg(h, sp);
  const dc = (C.areaSpells.dcBase ?? 3) + (h.stats.skill || 0), fire = isFireCard(c);
  const effects = sp.success || sp.onHit || [];
  log(`${c.name}: ${area.shape?.kind === 'chain' ? `chain of ${cr.all.length} enem${cr.all.length === 1 ? 'y' : 'ies'}` : `area of ${area.cells.length} spaces${area.shape?.enemiesOnly ? ' (enemies only)' : ''}`} — ${cr.all.length ? cr.all.map(u => u.name).join(', ') : 'nobody'} inside. Each rolls 1d6 + Resilience vs DC ${dc} (3 + ${h.name}'s Skill ${h.stats.skill}); success = half Damage${full ? '' : ' (no effect)'}.`, 'play');
  G.areaSaves = G.areaSaves || [];
  for (const u of cr.all) {
    if (u.life <= 0) continue;
    const d = roll(C.areaSpells.saveDie || 6), res = u.stats.res || 0, tot = d + res, ok = tot >= dc;
    const dealt = ok ? Math.floor(full * (C.areaSpells.successFraction ?? 0.5)) : full;
    G.areaSaves.push({ spell: c.name, who: u.name, d, res, dc, ok, dmg: dealt });
    log(`${c.name} save — ${u.name}: d6 ${d} + Resilience ${res} = ${tot} vs DC ${dc} → ${ok ? `SAVED${full ? `: half Damage (${dealt})` : ': no effect'}` : `FAILED${full ? `: ${full} Damage` : ''}`}.`, ok ? 'miss' : 'hit');
    if (dealt > 0) { const got = damage(u, dealt, { byHero: true, fire, save: true, crit: false }); log(`${u.name} takes ${got} Damage (${u.life}/${u.maxLife} Life left).`, 'hit'); }
    if (!ok && u.life > 0) for (const op of effects) await KW.run(E, { h, t: u, card: c }, op);
    renderTable(); await sleep(Math.min(250, paceMs() * 0.2));
    if (checkEnd()) return;
  }
  for (const op of sp.after || []) await KW.run(E, { h, card: c }, op);   // v1.10.2: Frost Nova II "then you may move 1"
}
// straight hex line from a toward b, n spaces long
function hexLine(a, b, n) {
  const A = cube(a.c, a.r), B = cube(b.c, b.r), d = Math.max(1, hexDist(a, b)), out = [];
  for (let i = 1; i <= n; i++) { const f = i / d; let x = A[0] + (B[0] - A[0]) * f + 1e-6, y = A[1] + (B[1] - A[1]) * f + 1e-6, z = A[2] + (B[2] - A[2]) * f - 2e-6;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z); const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    out.push({ c: rx + (rz - (rz & 1)) / 2, r: rz }); }
  return out;
}
// Smite (Paladin) / Strike (Ranger) spells offered right after a hit, before Damage
// v1.11.1 fix: post-hit spells (Divine Smite, Ensnaring Strike…) are offered in the roll result itself, so they show in every layout (v1.11 hid the spell bar)
function smiteBtns(h, A) { const ids = A && A.d6 != null ? smiteOptions(h, A) : []; return ids.length ? `<div class="smiterow" id="smiteRow">${ids.map(id => `<button class="primary small" data-smite="${id}">⚡ ${esc(CARD[id].name)} on this hit</button>`).join('')}</div>` : ''; }
function smiteOptions(h, A) {
  if (!A || !A.hit || A.smites >= C.spells.smitesPerHit || A.weapon === 'wolf') return [];
  const w = A.weapon ? weaponOf(A.weapon) : null;
  return (h.spells || []).filter(id => { const sp = FX[id]?.spell; if (!sp || h.spellDown.has(id)) return false;
    if (sp.kind === 'smite') return A.kind === 'melee' && !A.spell;
    if (sp.kind === 'strike') return !!w && !A.spell && (!sp.ranged || A.kind === 'ranged');
    return false; });
}
async function castSmite(h, id) {
  const A = G.atk, sp = FX[id].spell, c = CARD[id], t = byId(A.target);
  flipDown(h, id); A.smites = (A.smites || 0) + 1; A.played.push(c.name);
  log(`${h.name} casts ${c.name} on the hit${isOnce(id) ? ' (once per fight)' : ''}.`, 'play');
  const x = { h, A, t, card: c };
  for (const op of sp.do) { if (op[0] === 'hitDmg') await KW.run(E, x, op); else A.onHitOps.push([c, op]); }
  const w = A.weapon && weaponOf(A.weapon); if (sp.kind === 'smite' && w?.smiteDmg) A.extraDmg.push([`${CARD[A.weapon].name} (Smite)`, w.smiteDmg]);
  evalAttack(); renderTable();
}
// Paladin class card: Lay on Hands (free, heal 2 you or an adjacent hero)
async function layOnHands(h) {
  if (!(h.lohLeft > 0)) return;
  const t = await pickAlly(h, 'adj', 'Lay on Hands: heal which hero?'); if (!t) return;
  h.lohLeft--; log(`${h.name} uses Lay on Hands (${h.lohLeft} left this fight).`, 'play'); healBy(h, t, 2, `Lay on Hands (${h.name})`); renderTable();
}

async function offerReaction(h, when, title, body) {
  if (h.control === 'npc' && !AI_ACTOR) return asHero(h, () => offerReaction(h, when, title, body));
  if (h.life <= 0) return null;
  const ids = h.hand.filter(id => FX[id]?.when === when);
  if (!ids.length || !canPlay(h)) return null;
  for (const id of ids) {
    const yes = await askAs(h, () => ask(title, `${cardImg(id, 'small')}<p>${body} Play <b>${esc(CARD[id].name)}</b>?</p>`, [{ label: `Play ${esc(CARD[id].name)}`, value: true, cls: 'primary' }, { label: 'No', value: false }]));
    if (yes) { h.hand.splice(h.hand.indexOf(id), 1); h.discard.push(id); h.playsUsed++; log(`${h.name} plays ${CARD[id].name}.`, 'play'); return id; }
  }
  return null;
}

// ---- v1.5 reactions when an enemy moves next to a hero (Misty Step, Zephyr Step, Blink Reflex, Repulse, Vine Snare) ----
async function monsterMoved(m, prev) {
  if (m.life <= 0) return;
  for (const h of liveHeroes().filter(x => adjacent(x, m) && hexDist(x, prev) > 1)) {
    if (m.life <= 0 || !adjacent(h, m)) break;
    await asHero(h, async () => {
      // reaction spells
      for (const id of (h.spells || []).filter(id => FX[id]?.spell?.kind === 'reaction' && FX[id].spell.on === 'adjacent' && !h.spellDown.has(id))) {
        const sp = FX[id].spell;
        if (await ask(`${esc(m.name)} moves next to ${esc(h.name)}`, `${cardImg(id, 'small')}<p>Cast <b>${esc(CARD[id].name)}</b> (reaction, ${sp.teleport ? 'Teleport' : 'move'} ${sp.move})?</p>`, [{ label: `Cast ${esc(CARD[id].name)}`, value: true, cls: 'primary' }, { label: 'No', value: false }])) {
          flipDown(h, id); log(`${h.name} casts ${CARD[id].name} (reaction).`, 'play'); await reactMove(h, sp.move, sp.teleport, CARD[id].name); return;
        }
      }
      // ability (Blink Reflex)
      const ab = cardsOf(h).find(id => FX[id]?.reactAdjacent && !usedOnce(h, id + ':ra', FX[id].reactAdjacent.per));
      if (ab && await ask(CARD[ab].name, `${esc(m.name)} moved next to ${esc(h.name)}. Move up to ${FX[ab].reactAdjacent.move} spaces now?`, [{ label: 'Move away', value: true, cls: 'primary' }, { label: 'Stay', value: false }])) {
        markUsed(h, ab + ':ra', FX[ab].reactAdjacent.per); log(`${h.name}: ${CARD[ab].name}.`, 'play'); await reactMove(h, FX[ab].reactAdjacent.move, false, CARD[ab].name); return;
      }
      // power-ups
      const pu = await offerReaction(h, 'reactAdjacent', `${esc(m.name)} moves next to ${esc(h.name)}!`, '');
      if (pu) for (const op of FX[pu].do) await KW.run(E, { h, t: m, card: CARD[pu] }, op);
    });
  }
  renderTable();
}
// reaction move (Misty Step, Zephyr Step, Blink Reflex, Sidestep...). v1.9 USER: a human player picks the space from the
// highlighted reachable hexes (drag the token or click a hex; "Pick for me" = the old automatic choice). Computer-played heroes auto-place.
function reactCells(h, n, teleport) {
  const save = { fm: h.freeMove, ml: h.moveLeft, tp: h.teleportMove };
  h.freeMove = 0; h.moveLeft = 0; h.teleportMove = !!teleport;
  const cells = cellsOf(reachable(h, n)).filter(p => p.cost > 0);
  h.freeMove = save.fm; h.moveLeft = save.ml; h.teleportMove = save.tp;
  return cells;
}
const humanPicks = h => h.control !== 'npc' && C.spells.reactionMoveAuto !== true && C.enforceMoveAndRange !== false;
function pickHex(kind, data) { return new Promise(res => { PICK[kind] = { ...data, res }; renderTable(); }); }
function endPick(kind, v) { const P = PICK[kind]; if (!P) return; PICK[kind] = null; P.res(v); }
async function reactMove(h, n, teleport, label = 'Reaction move') {
  const cells = reactCells(h, n, teleport);
  const auto = () => cells.slice().sort((a, b) => nearMon(b) - nearMon(a) || a.cost - b.cost)[0];
  if (!cells.length) { log(`${h.name} has nowhere to move.`, 'muted'); return; }
  let best;
  if (humanPicks(h)) {
    log(`${label}: ${h.name}'s player picks a space (highlighted, up to ${n}).`, 'muted');
    best = await withView(seatView(h), () => pickHex('react', { id: h.id, cells, label, n, teleport: !!teleport, auto: auto() }));
    if (!best) best = auto();
  } else best = auto();
  const d = hexDist(h, best); h.c = best.c; h.r = best.r; afterMove(h);
  log(`${h.name} ${teleport ? 'Teleports' : 'moves'} ${d} space${d > 1 ? 's' : ''} away (counts as a Disengage).`, 'play');
}

// ---- NPC cards: attacks + abilities (David's NPC deck; readings in CONFIG.npc are OPEN) ----
// =====================================================================
// v1.8 NPC ENGINE. Attack options come from David's npc_deck.xlsx v0.4 (main attack + Attack 2: type, range, modifier,
// Damage, area, uses); keyword abilities are parsed from the Ability column ("Regenerate 2 (...)", "Multiattack 2",
// "Unbreakable 3"...); NPC_FX (effects.js) adds the per-card rules text (area shape, uses, crit riders, Legendary Actions).
// Rules: rules/npc_levels_v0.1.md + rulebook §15 (Malcom), all OPEN placeholders unless the user approved them.
// =====================================================================
function parseNpcAbility(s) {
  const raw = String(s), head = raw.split(/[:(]/)[0].trim(), mm = head.match(/^(.*?)\s+(\d+)$/);
  const name = mm ? mm[1] : head, n = mm ? +mm[2] : null, base = window.NPC_ABILITIES[name];
  if (!base) return { name: raw, def: { badge: raw, auto: false, note: 'Not automated (apply by hand).' } };
  const def = JSON.parse(JSON.stringify(base));
  if (n != null) ['regenerate', 'multiattack', 'menace', 'unbreakable', 'ownPool'].forEach(k => { if (def[k] != null) def[k] = n; });
  if (n != null && !/\d\)?$/.test(def.badge)) def.badge += ' ' + n;
  if (raw !== name) def.note = `${raw}. ${def.note || ''}`;
  return { name, def };
}
function npcAttackOptions(name, nc) {
  const fx = (nc && window.NPC_FX[nc.id]) || {}, out = [];
  const fin = (o, extra) => { o = { atk: 0, dmg: C.combat.baseDamage, ...o, ...(extra || {}) };
    o.melee = !!o.melee; o.ranged = !o.melee; o.range = o.melee ? 1 : (o.range || 1);
    if (!o.melee && RG().npcs && o.area !== 'burst' && o.area !== 'engaged') o.range = capRange(RG().default);   // v1.10 user rule: NPC ranged/spell attacks Range 5 too
    if (o.noDamage) o.dmg = 0; if (o.dmg === 0) o.noDamage = true; return o; };
  if (nc) {
    const k = nc.attackKind || 'melee';
    out.push(fin({ key: 'main', name: nc.attackName || 'Attack', kind: k, melee: k === 'melee', spell: k === 'spell', range: k === 'melee' ? 1 : nc.range, dmg: nc.attackDamage ?? C.combat.baseDamage, type: nc.attackType || '', src: 'sheet' }, fx.main));
    const a2 = nc.attack2;
    if (a2 && !a2.none && !a2.primary) {
      const o = { key: 'alt', name: a2.name, kind: a2.kind, melee: !!a2.melee, spell: !!a2.spell, range: a2.range || 3, atk: a2.atk || 0, dmg: a2.dmg ?? C.combat.baseDamage, type: a2.type || '', poison: a2.poison, push: a2.push, src: 'sheet' };
      if (a2.area && !(fx.alt && fx.alt.area)) { o.area = a2.burst ? 'burst' : a2.melee ? 'engaged' : 'targetPlus'; o.radius = a2.burst || 1; }
      out.push(fin(o, fx.alt));
    }
  } else out.push(fin({ key: 'main', name: 'Attack', kind: 'melee', melee: true }));
  if (out.length < 2 && !(nc && nc.attack2)) { const D = C.npcRangedDraft || {}, d = D[name] || D[nc?.name];
    if (d) out.push(fin({ key: 'alt', name: d.name, kind: d.kind || 'ranged', spell: d.kind === 'spell', range: d.range || 3, atk: d.atk || 0, type: d.type || '', src: 'draft (OPEN)' })); }
  return out;
}
const npcModes = m => m.atks || [];
const modeRange = mo => mo.area === 'burst' ? mo.radius : mo.melee ? 1 : mo.range;
const modeOK = (mo, d) => mo.melee ? d === 1 : d <= modeRange(mo);
function modeReady(m, mo) {
  const u = mo.uses; if (!u) return true;
  if (u.perFight) return (m.usesLeft?.[mo.key] ?? u.perFight) > 0;
  if (u.recharge) return !m.recharging?.[mo.key];
  return true;
}
const modeUseText = (m, mo) => !mo.uses ? '' : mo.uses.perFight ? `${m.usesLeft?.[mo.key] ?? mo.uses.perFight}/${mo.uses.perFight} left` : m.recharging?.[mo.key] ? `recharging (${mo.uses.recharge.join('-')})` : 'ready';
function spendMode(m, mo) {
  const u = mo.uses; if (!u) return;
  m.usesLeft = m.usesLeft || {}; m.recharging = m.recharging || {};
  if (u.perFight) { m.usesLeft[mo.key] = (m.usesLeft[mo.key] ?? u.perFight) - 1; log(`${m.name}: ${mo.name} ${m.usesLeft[mo.key]} of ${u.perFight} left this fight.`, 'muted'); }
  if (u.recharge) { m.recharging[mo.key] = true; log(`${m.name}'s ${mo.name} is used — it recharges on a d6 of ${u.recharge.join('-')} at the start of its turn.`, 'muted'); }
}
// heroes an area option hits (one roll per hero). Down heroes are skipped (CONFIG.npc.areaHitsDown, OPEN).
function areaTargets(m, mo, h) {
  const pool = legalMonsterTargets(m).filter(x => C.npc.areaHitsDown || x.life > 0);
  if (mo.area === 'burst') return pool.filter(x => dist(m, x) <= mo.radius);
  if (mo.area === 'engaged') return pool.filter(x => adjacent(m, x));
  if (!h || !pool.includes(h)) return [];
  if (mo.area === 'targetPlus') return [h, ...pool.filter(x => x !== h && dist(x, h) <= mo.radius)];
  if (mo.area === 'chain') return [h, ...pool.filter(x => x !== h && dist(x, h) <= mo.radius).sort((a, b) => a.life - b.life).slice(0, mo.extra || 1)];
  return [h];
}
// Auto DM option choice: an area option that hits 2+ heroes (3+ when it deals no Damage), Brew Flask on an unpoisoned hero
// at range, then melee if adjacent, then the ranged option with the most Damage.
function npcModeFor(m, h, key) {
  const ms = npcModes(m); if (key) return ms.find(x => x.key === key) || ms[0];
  if (!h) return null;
  const d = dist(m, h), ok = ms.filter(x => modeReady(m, x) && modeOK(x, d));
  if (h.life > 0) {
    const area = ok.filter(x => x.area && areaTargets(m, x, h).length >= (x.noDamage ? 3 : 2)).sort((a, b) => areaTargets(m, b, h).length - areaTargets(m, a, h).length)[0];
    if (area) return area;
    const flask = ok.find(x => x.noDamage && x.poison && !x.area && !(h.poison > 0) && d > 1);
    if (flask) return flask;
  }
  const plain = ok.filter(x => !x.noDamage && (!x.area || areaTargets(m, x, h).includes(h)));
  return plain.find(x => x.melee && !x.area) || plain.filter(x => !x.melee).sort((a, b) => b.dmg - a.dmg)[0] || plain[0] || null;
}
const npcMaxRange = m => Math.max(1, ...npcModes(m).filter(x => modeReady(m, x)).map(modeRange));
const npcAnyRanged = m => npcModes(m).some(x => !x.melee && modeReady(m, x));
const npcRanged = m => m.atkKind !== 'melee';
function npcAbil(m, key) { for (const a of Object.values(m.abil || {})) if (a[key] != null) return a[key]; return null; }
function npcHas(m, key) { return npcAbil(m, key) != null; }
function npcTurnStart(u) {
  u.moved = false; u.blinking = false; u.dashed = false; u.attacked = false; u.attacksMade = 0;
  u.attacksLeft = npcAbil(u, 'multiattack') || 1;
  for (const mo of npcModes(u)) if (mo.uses?.recharge && u.recharging?.[mo.key]) {
    const d = roll(6);
    if (mo.uses.recharge.includes(d)) { u.recharging[mo.key] = false; log(`${u.name}'s ${mo.name} recharges (d6 ${d}).`, 'play'); }
    else log(`${u.name}'s ${mo.name} does not recharge (d6 ${d}, needs ${mo.uses.recharge.join('-')}).`, 'muted');
  }
  const rg = npcAbil(u, 'regenerate'); // after poison (CONFIG.npc.regenerateAfterPoison, OPEN); never revives
  if (rg && u.life >= 1 && u.life < u.maxLife) {
    if (u.regenStopAt === u.turnCount) log(`${u.name} can't Regenerate this turn (it took a Critical or Fire hit since its last turn).`, 'play');
    else gainLife(u, rg, `Regenerate ${rg} (${u.name}'s card ability, start of its turn)`);
  }
  const own = npcAbil(u, 'ownPool'); if (own) { u.laLeft = own; u.laTick = null; }
  if (u.la && !own && G.laRound !== G.round) { G.laRound = G.round; G.laPool = laPoolSize(); G.laDamaging = 0; log(`Legendary pool refreshed: ${G.laPool} (start of ${u.name}'s turn, the first Legendary NPC this round).`, 'muted'); }
}
// Menace N (L3 boss): at the start of its turn every standing hero within 1 takes N Damage (no roll)
function npcMenace(u) {
  const n = npcAbil(u, 'menace'); if (!n || u.life <= 0) return;
  const ts = liveHeroes().filter(x => adjacent(x, u)); if (!ts.length) return;
  log(`Menace ${n} (${u.name}): every hero within 1 takes ${n} Damage (not an attack, no roll).`, 'play');
  ts.forEach(x => dmgNoRoll(x, n, 'Menace'));
}
function canBlink(m) {
  const b = npcAbil(m, 'blink'); if (!b || m.life <= 0) return false;
  if (b.per === 'fight' && m.usedFight.has('blink')) return false;
  if (m.moved || m.attacked || m.attacksMade) return false;   // "at the start of its turn"
  return !C.npc.blinkOnlyIfEngaged || engaged(m);
}
function blinkHexes(m, n0) {
  const n = n0 || npcAbil(m, 'blink')?.teleport || 3, out = [];
  for (let r = 1; r <= GMAX.r; r++) for (let c = 0; c <= GMAX.c; c++) { const d = hexDist(m, { c, r }); if (d >= 1 && d <= n && inMap(c, r) && !occupied(c, r, m)) out.push({ c, r }); }
  return out;
}
function blinkTo(m, to) {
  const n = npcAbil(m, 'blink')?.teleport || 3;
  if (hexDist(m, to) > n) return `Blink: Teleport up to ${n} spaces.`;
  if (occupied(to.c, to.r, m) || !inMap(to.c, to.r)) return 'Blink: pick an empty space.';
  const d = hexDist(m, to);
  m.c = to.c; m.r = to.r; m.blinking = false; m.usedFight.add('blink');
  log(`${m.name} Blinks: Teleports ${d} space${d === 1 ? '' : 's'} (Teleport ${n}, once per fight; counts as a Disengage).`, 'play');
  if (!C.npc.blinkKeepsTurn) m.moveLeft = 0;
  return null;
}
// why m can't attack h right now (null = legal)
function monsterCanAttack(m, h) {
  if (!h) return 'No target.';
  if (h.dead) return 'Dead.';
  if (h.life <= 0 && !isDownHero(h)) return 'Down.';
  if (isHidden(h)) return 'Hidden';
  const d = dist(m, h);
  if (!enforce()) return null;
  if (npcModes(m).some(x => modeReady(m, x) && modeOK(x, d))) return null;
  const mr = npcMaxRange(m); return mr > 1 ? `${d} sp — out of Range ${mr}` : `${d} sp — not adjacent`;
}
function legalMonsterTargets(m) {
  return [...liveHeroes(), ...G.heroes.filter(isDownHero), ...(C.spells.companionsTargetable ? liveComps() : [])].filter(h => !isHidden(h));
}
// ---- Legendary Actions (Malcom, npc_levels §2 / rulebook §15, OPEN) ----
const laPoolSize = () => G.heroes.length >= C.legendary.bigPartyMin ? C.legendary.bigParty : C.legendary.smallParty;
function laMode(la) { return { key: 'la', name: la.name, melee: !!la.melee, ranged: !la.melee, spell: !!la.spell, range: la.melee ? 1 : RG().npcs ? capRange(RG().default) : (la.range || 1), atk: 0, dmg: la.dmg ?? 1, push: la.push, legendary: true }; }
// can m use its Legendary Action now, and how (Auto DM picks the first legal use)
function laPlan(m) {
  const la = m.la; if (!la || m.life <= 0) return null;
  const standing = legalMonsterTargets(m).filter(x => x.life > 0);
  if (la.kind === 'attack') { const mo = laMode(la), ts = standing.filter(x => modeOK(mo, dist(m, x)));
    return ts.length ? { targets: ts.sort((a, b) => (npcHas(m, 'predator') ? effTough(a) - effTough(b) : 0) || a.life - b.life) } : null; }
  if (la.kind === 'pushEngaged' || la.kind === 'brimstone') { const ts = liveHeroes().filter(x => adjacent(x, m)); return ts.length ? { targets: ts } : null; }
  if (la.kind === 'teleport' && !la.engage) { if (!engaged(m)) return null; const h = pickTarget(m) || standing[0]; const spot = h && rangedSpot(m, h, blinkHexes(m, la.n).map(p => ({ ...p, cost: 0 })), m.range);
    return spot && Math.min(...liveHeroes().map(x => hexDist(spot, x))) > 1 ? { spot } : null; }
  if (la.kind === 'teleport' && la.engage) { if (engaged(m)) return null;
    const cells = blinkHexes(m, la.n); const ts = standing.filter(x => !x.comp).sort((a, b) => (npcHas(m, 'predator') ? effTough(a) - effTough(b) : 0) || a.life - b.life);
    for (const h of ts) { const spot = cells.find(p => hexDist(p, h) === 1); if (spot) return { spot, h }; } return null; }
  if (la.kind === 'move') { if (engaged(m)) return null; const reach = reachable(m, la.n), cells = cellsOf(reach).filter(p => p.cost > 0);
    const ts = standing.sort((a, b) => (npcHas(m, 'predator') ? effTough(a) - effTough(b) : 0) || a.life - b.life);
    for (const h of ts) { const spot = cells.filter(p => hexDist(p, h) === 1).sort((a, b) => a.cost - b.cost)[0]; if (spot) return { spot, h, reach }; } return null; }
  if (la.kind === 'orders') {
    for (const a of liveMonsters().filter(x => x !== m && dist(x, m) <= (la.range || 4) && !engaged(x) && effSpeed(x) > 0)) {
      const reach = reachable(a, effSpeed(a)), cells = cellsOf(reach).filter(p => p.cost > 0);
      const spot = cells.filter(p => liveHeroes().some(h => hexDist(p, h) === 1)).sort((x, y) => x.cost - y.cost)[0];
      if (spot) return { ally: a, spot, reach };
    }
    return null;
  }
  return null;
}
function laAvailable(m) {
  if (!m.la || m.life <= 0 || G.over) return false;
  if (npcAbil(m, 'ownPool')) return (m.laLeft ?? npcAbil(m, 'ownPool')) > 0 && m.laTick !== G.tick;
  if (!(G.laPool > 0)) return false;
  return !(m.la.damaging && (G.laDamaging || 0) >= C.legendary.maxDamagingPerRound);
}
// v1.10 FULL DM CONTROL: the human DM picks the Legendary Action target, and places Teleports / Swoops / Orders on highlighted hexes
async function laHumanChoice(m, plan, own, hero) {
  const la = m.la, opts = la.kind === 'attack' ? plan.targets.map(x => ({ label: `${esc(la.name)} → ${esc(x.name)}`, value: x.id, cls: 'primary' })) : [{ label: `Use ${esc(la.name)}`, value: 'use', cls: 'primary' }];
  const v = await ask(`⚡ Legendary Action: ${esc(m.name)}`, `${m.card && CARD[m.card] ? cardImg(m.card, 'small') : ''}<p>End of ${esc(hero.name)}'s turn. <b>${esc(la.name)}</b>: ${esc(la.text)}.</p>
    <p class="muted small">${own ? `Own pool (Legendary ${npcAbil(m, 'ownPool')}): ${m.laLeft ?? npcAbil(m, 'ownPool')} left this round.` : `Shared pool: ${G.laPool} of ${laPoolSize()} left (refreshes at the first Legendary NPC's turn); max ${C.legendary.maxDamagingPerRound} damaging per round.`} ${la.kind === 'teleport' || la.kind === 'move' || la.kind === 'orders' ? 'You place the move on the map next (highlighted hexes; "Pick for me" = the automatic choice).' : ''}</p>`,
    [...opts, { label: 'Skip', value: 'skip' }], 'la-modal');
  if (v === 'skip' || v == null) { log(`${m.name} doesn't use a Legendary Action (Human DM skipped).`, 'muted'); return null; }
  if (la.kind === 'attack') return { t: byId(v) };
  const nextTo = p => liveHeroes().filter(x => hexDist(p, x) === 1).sort((a, b) => a.life - b.life)[0] || null;
  if (la.kind === 'teleport') {
    const cells = blinkHexes(m, la.n).filter(p => la.engage ? liveHeroes().some(x => hexDist(p, x) === 1) : Math.min(...liveHeroes().map(x => hexDist(p, x))) > 1).map(p => ({ ...p, cost: hexDist(m, p) }));
    if (!cells.length) return { plan: {} };
    const spot = await pickHex('react', { id: m.id, cells, label: `${la.name} (Legendary Action)`, n: la.n, teleport: true, auto: plan.spot }) || plan.spot;
    return { plan: { spot, h: la.engage ? nextTo(spot) : null } };
  }
  if (la.kind === 'move') {
    const reach = reachable(m, la.n), cells = cellsOf(reach).filter(p => p.cost > 0);
    const spot = await pickHex('react', { id: m.id, cells, label: `${la.name} (Legendary Action)`, n: la.n, teleport: false, auto: plan.spot }) || plan.spot;
    return { plan: { spot: cells.find(p => p.c === spot.c && p.r === spot.r) || plan.spot, reach, h: nextTo(spot) } };
  }
  if (la.kind === 'orders') {
    const allies = liveMonsters().filter(x => x !== m && dist(x, m) <= (la.range || 4) && !engaged(x) && effSpeed(x) > 0);
    const aid = allies.length > 1 ? await ask(`⚡ ${esc(la.name)}: which NPC moves?`, `<p>Pick one NPC within ${la.range || 4} of ${esc(m.name)}.</p>`, allies.map(x => ({ label: esc(x.name), value: x.id, cls: x === plan.ally ? 'primary' : '' }))) : allies[0]?.id;
    const a = byId(aid) || plan.ally, reach = reachable(a, effSpeed(a)), cells = cellsOf(reach).filter(p => p.cost > 0);
    const spot = await pickHex('react', { id: a.id, cells, label: `${la.name}: move ${a.name}`, n: effSpeed(a), teleport: false, auto: a === plan.ally ? plan.spot : cells[0] }) || cells[0];
    return { plan: { ally: a, reach, spot: cells.find(p => p.c === spot.c && p.r === spot.r) || spot } };
  }
  return {};
}
async function doLegendary(m, plan, t) {
  const la = m.la, own = !!npcAbil(m, 'ownPool');
  if (own) { m.laLeft = (m.laLeft ?? npcAbil(m, 'ownPool')) - 1; m.laTick = G.tick; }
  else { G.laPool--; if (la.damaging) G.laDamaging = (G.laDamaging || 0) + 1; }
  (G.laUsed = G.laUsed || []).push({ round: G.round, who: m.name, name: la.name, mode: G.dmMode });
  log(`⚡ Legendary Action — ${m.name}: ${la.name} (${la.text}). ${own ? `Own pool: ${m.laLeft} left` : `Pool: ${G.laPool} left`}.`, 'play');
  m.flashLA = Date.now(); narrate('legendary', { a: m, w: la.name });
  if (la.kind === 'attack') { const tg = t || plan.targets[0]; HOLD.n++; await resolveNpcAttack(m, tg, laMode(la), { legendary: true }); releaseHold(); }
  else if (la.kind === 'pushEngaged') plan.targets.forEach(x => pushUnit(m, x, la.push || 1, 1));
  else if (la.kind === 'brimstone') plan.targets.forEach(x => dmgNoRoll(x, la.dmg || 1, 'Brimstone'));
  else if (la.kind === 'teleport') { const d = hexDist(m, plan.spot); m.c = plan.spot.c; m.r = plan.spot.r; log(`${m.name} Teleports ${d} space${d === 1 ? '' : 's'}${plan.h ? ` next to ${plan.h.name}` : ' away from melee'}${G.dmMode === 'human' ? ' (placed by the DM)' : ' (placed automatically, OPEN)'}.`, 'play'); }
  else if (la.kind === 'move') { const prev = { c: m.c, r: m.r }; walkNpc(m, pathTo(plan.reach, m, plan.spot)); log(`${m.name} Swoops ${plan.spot.cost} space${plan.spot.cost === 1 ? '' : 's'}${plan.h ? ` next to ${plan.h.name}` : ''}.`, 'play'); await monsterMoved(m, prev); }
  else if (la.kind === 'orders') { const a = plan.ally, prev = { c: a.c, r: a.r }; walkNpc(a, pathTo(plan.reach, a, plan.spot)); log(`Orders: ${a.name} moves ${plan.spot.cost} space${plan.spot.cost === 1 ? '' : 's'} (no attack).`, 'play'); await monsterMoved(a, prev); }
  renderTable();
}
// the Legendary window: at the end of each hero's turn, at most one shared-pool Legendary Action and one own-pool one
async function legendaryWindow(hero) {
  const users = liveMonsters().filter(m => m.la); if (!users.length) return;
  let shared = false;
  for (const m of users) {
    if (G.over || m.life <= 0) continue;
    const own = !!npcAbil(m, 'ownPool'); if (!own && shared) continue;
    if (!laAvailable(m)) continue;
    const plan = laPlan(m); if (!plan) continue;
    let t = null;
    if (G.dmMode === 'human') { const r = await askAs('dm', () => withView({ kind: 'dm' }, () => laHumanChoice(m, plan, own, hero))); if (!r) continue; t = r.t; Object.assign(plan, r.plan || {}); }
    await doLegendary(m, plan, t);
    if (!own) shared = true;
    if (checkEnd()) return;
  }
}
// ---- Fog Cloud (Swamp Witch, once per fight) ----
const fogCloudReady = m => !!npcAbil(m, 'fogCloud') && !m.usedFight.has('fogCloud') && m.life > 0;
function useFogCloud(m) {
  const f = npcAbil(m, 'fogCloud'); m.usedFight.add('fogCloud');
  addTerrain(m, m, 'fog', f.radius || 1, 'ownerNextTurn');
  log(`${m.name} casts Fog Cloud (once per fight): Fog in its space and every space within ${f.radius || 1} until its next turn (ranged attacks into or out of Fog get -2).`, 'play');
}
const fogWanted = m => fogCloudReady(m) && liveHeroes().some(x => { const r = heroReach(x); return r.ranged && r.n >= 3 && dist(x, m) <= r.n + effSpeed(x); });
// ---- Bloodied (Elder Treant) ----
function checkBloodied(t) {
  const b = npcAbil(t, 'bloodied'); if (!b || t.bloodiedDone || t.life <= 0 || t.life > Math.floor(t.maxLife / 2)) return;
  t.bloodiedDone = true; t.usesLeft = {}; t.recharging = {};
  log(`${t.name} is Bloodied (${t.life}/${t.maxLife}): its once-per-fight and recharge options are ready again.`, 'play');
  const call = b.call; if (!call) return;
  const T = MON[call.kind]; if (!T) return;
  const have = G.monsters.filter(x => x.kind === call.kind).length, n = Math.min(call.n, Math.max(0, (T.qty || 4) - have));
  if (n <= 0) { log(`Bloodied: no ${monLabel(T)} left in the box (QTY ${T.qty}).`, 'muted'); return; }
  const spots = hexesWithin(t, 2).filter(p => !occupied(p.c, p.r) && hexDist(p, t) >= 1).sort((a, b) => hexDist(a, t) - hexDist(b, t));
  let at = G.order.indexOf(t.id); const made = [];
  for (let i = 0; i < n && spots.length; i++) {
    const u = makeMonster(T, G.monsters.length, have + i + 1); const p = spots.shift();
    u.c = p.c; u.r = p.r; u.ep = 0; u.called = true; u.initRoll = t.initRoll; u.initDie = t.initDie;
    G.monsters.push(u); G.order.splice(++at, 0, u.id); made.push(u.name);
  }
  log(`Bloodied: ${t.name} Calls ${made.join(' and ')} (within 2, acting right after it; no EP, count against QTY).`, 'play');
}
// reaction power-ups any hero may play for a hero within the card's range (Ironbark, Sacred Shield, Regrowth, Intercept, Counter-Shot)
async function offerAllyReaction(target, when, title, body, extra = {}) {
  for (const x of liveHeroes()) {
    const ids = x.hand.filter(id => FX[id]?.when === when && dist(x, target) <= (FX[id].range ?? 0) && !(extra.notSelf && x === target) && !reqCheck(x, id));
    if (!ids.length || !canPlay(x)) continue;
    const id = await asHero(x, async () => {
      for (const id of ids) {
        const yes = await ask(title, `${cardImg(id, 'small')}<p>${body} ${esc(x.name)}: play <b>${esc(CARD[id].name)}</b>${x !== target ? ` for ${esc(target.name)}` : ''}?</p>`, [{ label: `Play ${esc(CARD[id].name)}`, value: true, cls: 'primary' }, { label: 'No', value: false }]);
        if (yes) { x.hand.splice(x.hand.indexOf(id), 1); x.discard.push(id); x.playsUsed++; log(`${x.name} plays ${CARD[id].name}.`, 'play'); return id; }
      }
      return null;
    });
    if (id) return { x, id };
  }
  return null;
}
// a hero's quick ranged shot outside its own turn (Counter-Shot)
async function counterShot(h, m) {
  if (!m || m.life <= 0) return;
  const w = heroRangedWeapon(h); if (!w) return;
  const A = { tok: { mode: {} }, weapon: w, kind: 'ranged', mods: {}, played: [], extraDmg: [], target: m.id };
  const atk = attackParts(h, A).reduce((s, p) => s + p[1], 0), d = roll(6), t = effTough(m), ok = d + atk >= t;
  log(`${h.name} Counter-Shot at ${m.name}: d6 ${d} + ${atk} = ${d + atk} vs ${t} → ${ok ? 'HIT' : 'MISS'}.`, ok ? 'hit' : 'miss');
  if (ok) dmgNoRoll(m, C.combat.baseDamage + (weaponOf(w).dmg || 0), 'Counter-Shot');
}
// v1.10 USER RULE (CONFIG.npcScaling): Level 1 NPCs get a flat +1 to attack rolls when the party level is 2 or 3
const partyLevelG = () => Math.max(1, ...(G?.heroes || []).map(h => h.level || 1));
function npcScaleAtk(m) {
  const S = C.npcScaling; if (!S || !m || m.side === 'pc') return 0;
  return (m.level || 1) === S.npcLevel && S.partyLevels.includes(partyLevelG()) ? S.atkBonus : 0;
}
// one NPC attack roll against one target (area options call this once per hero; Legendary attacks too)
async function resolveNpcAttack(m, h, mode, opt = {}) {
  const ranged = !mode.melee, melee = !!mode.melee;
  const R = { hit: false, cancel: false, survive: false, reduce: 0 };
  // a Down hero: the attack roll is made as usual; a hit counts as 1 of the 3 hits that kill (no Damage, no reactions)
  if (isDownHero(h)) {
    const d = roll(C.combat.die), parts = [['Attack', m.stats.atk]]; if (npcScaleAtk(m)) parts.push([C.npcScaling.label, npcScaleAtk(m)]); if (fxSum(m, 'atk')) parts.push(['effects', fxSum(m, 'atk')]); if (mode.atk) parts.push([mode.name, mode.atk]);
    const tot = d + parts.reduce((a, p) => a + p[1], 0), tough = effTough(h), hit = tot >= tough;
    log(`${m.name} attacks ${h.name} (Down) with ${mode.name}: d6 ${d} ${parts.map(p => `${p[1] < 0 ? '−' : '+'} ${Math.abs(p[1])}${p[0] !== 'Attack' ? ` (${p[0]})` : ''}`).join(' ')} = ${tot} vs Toughness ${tough} → ${hit ? 'HIT' : 'MISS'}.`, hit ? 'hit' : 'miss');
    renderTable(); const travel = animateAttack(m, h, mode.spell ? 'spell' : ranged ? 'ranged' : 'melee'); { const b0 = G.busy; G.busy = true; await sleep(Math.min(travel, animMs() * 1.6)); G.busy = b0; }
    if (hit) downHit(h, m); else missPuff(h);
    renderTable(); return { hit, crit: false };
  }
  // reaction: "when an enemy chooses you as the target, before it rolls" (Smoke Bomb)
  const sb = await offerReaction(h, 'reactTargeted', `${esc(m.name)} targets ${esc(h.name)}!`, 'Before it rolls:');
  if (sb) { for (const op of FX[sb].do) await KW.run(E, { h, R, card: CARD[sb] }, op); if (R.cancel) { log(`${m.name}'s attack is cancelled.`, 'play'); renderTable(); return { hit: false }; } }
  // ally reactions before the roll: Intercept (Paladin), Counter-Shot (Ranger)
  if (!h.comp) {
    const ar = await offerAllyReaction(h, 'reactAllyTargeted', `${esc(m.name)} attacks ${esc(h.name)}!`, 'Before it rolls:', { notSelf: true });
    if (ar) for (const op of FX[ar.id].do) await KW.run(E, { h: ar.x, m, R, card: CARD[ar.id] }, op);
    if (m.life <= 0) { log(`${m.name} is down before it can attack.`, 'play'); renderTable(); return { hit: false }; }
    if (R.intercept) { const p = R.intercept, spot = neighbors(h.c, h.r).filter(q => !occupied(q.c, q.r, p)).sort((a, b) => hexDist(a, m) - hexDist(b, m))[0];
      if (spot) { p.c = spot.c; p.r = spot.r; } log(`${p.name} Intercepts: moves next to ${h.name} and becomes the target.`, 'play'); h = p;
      if (enforce() && !mode.area && !modeOK(mode, dist(m, h))) { log(`${m.name} can no longer reach ${h.name}.`, 'muted'); renderTable(); return { hit: false }; } }
  }
  const d = roll(C.combat.die); let tough = effTough(h); const life0 = h.life; HOLD.n++;
  if (ranged && G.heroes.some(p => p.life > 0 && hasFlag(p, 'auraRanged') && dist(p, h) <= 2)) tough += 1; // Aura of Protection
  const parts = [['Attack', m.stats.atk]];
  if (npcScaleAtk(m)) parts.push([C.npcScaling.label, npcScaleAtk(m)]);
  if (fxSum(m, 'atk')) parts.push(['effects', fxSum(m, 'atk')]);
  const ch = m.fx.find(f => f.challengedBy); if (ch && ch.challengedBy !== h.id) parts.push(['Challenged', C.spells.challengedAtkPenalty]);
  if (fxSum(h, 'atkVsMe')) parts.push([h.fx.filter(f => f.atkVsMe).map(f => f.label).join(', '), fxSum(h, 'atkVsMe')]);
  if (melee && modSum(h, 'meleeAtkVsMe')) parts.push(['Dodge / shield', modSum(h, 'meleeAtkVsMe')]);
  if (mode.atk) parts.push([mode.name, mode.atk]);
  if (npcAbil(m, 'packHunter') && liveMonsters().some(o => o !== m && adjacent(o, h))) parts.push(['Pack Hunter', npcAbil(m, 'packHunter')]);
  if (ranged && !mode.area && engaged(m)) parts.push(['Close Quarters', mode.spell ? C.npc.spellCloseQuarters : (C.npc.rangedCloseQuarters ?? -1)]);
  if (ranged && !engaged(h) && modSum(h, 'rangedAtkVsMeIfNotEngaged')) parts.push(["Ranger's Cloak", modSum(h, 'rangedAtkVsMeIfNotEngaged')]);
  if (ranged && modSum(h, 'rangedAtkVsMe')) parts.push(['Cloak / ring', modSum(h, 'rangedAtkVsMe')]);
  if (ranged && (terrainAt(m)?.type === 'fog' || terrainAt(h)?.type === 'fog')) parts.push(['Fog', -2]);
  const ot = terrainAt(m); if (ot && (ot.type === 'overgrowth' || ot.type === 'thorns') && hasMod(byId(ot.owner) || {}, 'overgrowthAtk')) parts.push(['Overgrowth Mastery', -1]);
  const tot = () => d + parts.reduce((a, p) => a + p[1], 0);
  if (!opt.area) m.fx = m.fx.filter(f => f.until !== 'nextAttack');
  R.hit = tot() >= tough;
  const crit = R.hit && d >= C.npc.critOn;
  const how = opt.legendary ? `(Legendary: ${mode.name}${ranged ? `, ${dist(m, h)} sp` : ''})` : mode.area ? `(${mode.name}, area, ${dist(m, h)} sp)` : null;
  log(`${m.name} ${how ? 'attacks' : mode.spell ? 'casts ' + mode.name + ' at' : 'attacks'} ${h.name}${how ? ' ' + how : mode.spell ? ` (${dist(m, h)} sp)` : ranged ? ` (${mode.name}, ranged, ${dist(m, h)} sp)` : ` (${mode.name})`}: d6 ${d} ${parts.map(p => `${p[1] < 0 ? '−' : '+'} ${Math.abs(p[1])}${p[0] !== 'Attack' ? ` (${p[0]})` : ''}`).join(' ')} = ${tot()} vs Toughness ${tough} → ${crit ? 'CRITICAL HIT' : R.hit ? 'HIT' : 'MISS'}.`, R.hit ? 'hit' : 'miss');
  renderTable(); const travel = animateAttack(m, h, mode.spell ? 'spell' : ranged ? 'ranged' : 'melee'); { const b0 = G.busy; G.busy = true; await sleep(Math.min(travel, animMs() * 1.6)); G.busy = b0; }
  // Shield (Wizard reaction spell): +2 Toughness against this attack
  if (R.hit && !h.comp) for (const id of h.spells.filter(id => FX[id]?.spell?.kind === 'reaction' && FX[id].spell.on === 'hit' && !h.spellDown.has(id))) {
    if (await asHero(h, () => ask(`${esc(h.name)} is hit!`, `${cardImg(id, 'small')}<p>Cast <b>${esc(CARD[id].name)}</b> (+${FX[id].spell.tough} Toughness against this attack)?</p>`, [{ label: `Cast ${esc(CARD[id].name)}`, value: true, cls: 'primary' }, { label: 'No', value: false }]))) {
      flipDown(h, id); tough += FX[id].spell.tough; R.hit = tot() >= tough;
      log(`${h.name} casts ${CARD[id].name}: Toughness ${tough} → ${R.hit ? 'still a HIT' : 'the attack MISSES'}.`, 'play'); break; }
  }
  if (R.hit) { const ev = await offerReaction(h, 'reactHit', `${esc(h.name)} is hit!`, 'The attack hits.');
    if (ev) { const x = { h, R, card: CARD[ev] }; R.hit = true; let cancelled = false; for (const op of FX[ev].do) { if (op[0] === 'cancelHit') cancelled = true; else await KW.run(E, x, op); } if (cancelled) { R.hit = false; log(`${CARD[ev].name}: the attack misses instead.`, 'play'); } } }
  if (R.hit) { const ar = await offerAllyReaction(h, 'reactAllyHit', `${esc(h.name)} is hit!`, 'The attack hits.');
    if (ar) { const x = { h: ar.x, t: h, R, card: CARD[ar.id] }; for (const op of FX[ar.id].do) { if (op[0] === 'cancelHit') { R.hit = false; log(`${CARD[ar.id].name}: that hit deals no Damage.`, 'play'); } else await KW.run(E, x, op); } } }
  if (R.hit && !mode.noDamage) {
    const blocker = [h, ...liveHeroes().filter(x => x !== h && adjacent(x, h))].find(x => cardsOf(x).some(id => FX[id]?.shield === 'kite') && !x.blockUsed);
    if (blocker) {
      blocker.blockUsed = true; const need = hasFlag(blocker, 'shieldExpert') ? 4 : 5, b = roll(6);
      if (b >= need) { log(`${blocker.name} Blocks with the Kite Shield (d6 ${b} ≥ ${need}) — no Damage.`, 'play'); R.hit = false; }
      else log(`${blocker.name} tries to Block (d6 ${b}, needs ${need}+) — fails.`, 'muted');
    }
  }
  if (R.hit) {
    let dmg = mode.noDamage ? 0 : (mode.dmg ?? C.combat.baseDamage);
    const cd = crit ? npcAbil(m, 'crit') : null;
    if (dmg > 0) {
      if (crit && C.combat.critBonusDamage) { dmg += C.combat.critBonusDamage; log(`Critical hit: +${C.combat.critBonusDamage} Damage (user rule).`, 'play'); }
      if (cd?.dmg && C.npc.brutalStacksWithCrit !== false) { dmg += cd.dmg; log(`Brutal: Critical hit, +${cd.dmg} Damage (stacks with the Critical +1 — OPEN).`, 'play'); }
      if (npcAbil(m, 'cheapShot') && !G.acted.has(h.id) && current() !== h && !h.comp) { dmg += npcAbil(m, 'cheapShot'); log(`Cheap Shot: ${h.name} is Off Guard (hasn't acted this round, OPEN) — +${npcAbil(m, 'cheapShot')} Damage.`, 'play'); }
    }
    const minD = C.minHitDamage ?? 1;   // v1.9 USER RULE: a hit always deals at least 1 Damage
    if (dmg > minD && hasFlag(h, 'plate') && !h.plateUsed) { h.plateUsed = true; dmg = Math.max(minD, dmg - 1); log(`${h.name}'s Plate Armor reduces the Damage by 1 (to ${dmg}; a hit always deals at least ${minD}).`, 'muted'); }
    if (melee && !h.comp) { const sd = await offerReaction(h, 'reactMeleeHitMe', `${esc(m.name)}'s melee attack hits ${esc(h.name)}.`, ''); if (sd) for (const op of FX[sd].do) await KW.run(E, { h, R, card: CARD[sd] }, op); }
    if (R.reduce && dmg > minD) { const d0 = dmg; dmg = Math.max(minD, dmg - R.reduce); log(`Damage reduced by ${d0 - dmg} (a hit always deals at least ${minD}).`, 'play'); }
    else if (R.reduce && dmg > 0) log(`The reduction does nothing: a hit always deals at least ${minD} Damage (user rule).`, 'muted');
    if (dmg > 0 && h.life - dmg <= 0 && !h.comp) {
      let saved = await offerReaction(h, 'reactDrop', `${esc(h.name)} would drop to 0 Life!`, '');
      if (!saved) { const ar = await offerAllyReaction(h, 'reactAllyDrop', `${esc(h.name)} would drop to 0 Life!`, '', { notSelf: true }); if (ar) saved = ar.id; }
      if (saved) { h.life = Math.min(h.life, 1); if (h.life < 1) gainLife(h, 1, CARD[saved].name); dmg = 0; unhide(h, 'took a hit'); log(`${h.name} stays at 1 Life (${CARD[saved].name}).`, 'play'); }
      else { const wt = liveHeroes().find(x => cardsOf(x).some(id => FX[id]?.worldTree) && dist(x, h) <= 3 && !x.usedFight.has('worldTree'));
        if (wt) { wt.usedFight.add('worldTree'); h.life = 1; if (G.lifeSeen) G.lifeSeen[h.id] = Math.max(G.lifeSeen[h.id] ?? 1, 1); dmg = 0; log(`World Tree Seed (${wt.name}): ${h.name} stays at 1 Life and heals 1.`, 'play'); gainLife(h, 1, `World Tree Seed (${wt.name})`); } }
    }
    if (dmg > 0) { const dealt = damage(h, dmg, { crit, src: m }); m.hurtTick = G.tick; log(`${h.name} takes ${dealt} Damage (${h.life}/${h.maxLife} Life left).`, 'hit');
      // Healing Word (Druid reaction spell): a hero within 3 heals 1 afterwards
      if (h.life > 0 && !h.comp) for (const x of liveHeroes()) { const id = (x.spells || []).find(id => FX[id]?.spell?.on === 'allyDamaged' && !x.spellDown.has(id) && dist(x, h) <= FX[id].spell.range);
        if (id && await asHero(x, () => ask('Healing Word?', `${esc(h.name)} took Damage. ${esc(x.name)}: cast <b>${esc(CARD[id].name)}</b> (heal ${FX[id].spell.heal})?`, [{ label: `Cast ${esc(CARD[id].name)}`, value: true, cls: 'primary' }, { label: 'No', value: false }]))) { flipDown(x, id); log(`${x.name} casts ${CARD[id].name} (reaction).`, 'play'); healBy(x, h, FX[id].spell.heal, `${CARD[id].name} (${x.name})`); break; } }
      if (mode.drain && m.life > 0) gainLife(m, mode.drain, `Drain (${m.name}'s ${mode.name} hit)`);
    }
    if (h.life > 0) {
      const pz = npcAbil(m, 'hit')?.atkDebuff;   // v1.7 Pounce (David v0.1.3, OPEN): a hit gives the target -1 Attack until the end of its next turn (no stacking)
      if (pz && !opt.legendary) { h.fx = h.fx.filter(f => !f.pounce); addFx(h, { atk: pz, pounce: true }, 'bearerEndNextTurn', m, `Pounced ${pz} Attack`); log(`Pounce: ${h.name} gets ${pz} Attack until the end of ${h.name}'s next turn (${m.name}).`, 'play'); narrate('cond', { t: h, cond: 'pounced', by: m }); }
      if (cd?.poison && mode.key === 'main') { log('Dirty Blade: Critical hit.', 'play'); poison(h, cd.poison); }
      if (crit && mode.critPoison) { log(`${mode.name}: Critical hit — Poisoned ${mode.critPoison}.`, 'play'); poison(h, mode.critPoison); }
      if (crit && cd?.weaken) weaken(h, m, `Takedown (${m.name})`);
      if (mode.poison) poison(h, mode.poison);
      if (mode.push) pushUnit(m, h, mode.push, 1);
    }
  } else if (h.life > 0 && !h.comp) {
    await asHero(h, () => fireTriggers(h, 'enemyMissedMe', { t: m }));
    const ex = await offerReaction(h, 'reactMissed', `${esc(m.name)} missed ${esc(h.name)}.`, '');
    if (ex) for (const op of FX[ex].do) await KW.run(E, { h, card: CARD[ex] }, op);
    if (melee && has(h, 'WAR-EQP-06') && adjacent(m, h) && (h.riposteUsed || 0) < (hasFlag(h, 'shieldExpert') ? 2 : 1)) {
      if (await asHero(h, () => ask('Riposte?', `${esc(m.name)} missed ${esc(h.name)}. Make a Basic Attack back (Buckler)?`, [{ label: 'Riposte', value: true, cls: 'primary' }, { label: 'No', value: false }]))) {
        h.riposteUsed = (h.riposteUsed || 0) + 1;
        const bw = cardsOf(h).filter(id => FX[id]?.weapon?.kind === 'melee').sort((a, b) => (FX[b].weapon.atk || 0) - (FX[a].weapon.atk || 0))[0] || '';   // v1.9: the weapon's Attack counts
        const A = { tok: { mode: { kind: 'melee' } }, weapon: bw, kind: 'melee', mods: {}, played: [] };
        const atk = attackParts(h, A).reduce((s, p) => s + p[1], 0), r = roll(6), mt = effTough(m), ok = r + atk >= mt, rc = ok && r >= C.npc.critOn;
        log(`${h.name} ripostes ${m.name}: d6 ${r} + ${atk} = ${r + atk} vs ${mt} → ${rc ? 'CRITICAL HIT' : ok ? 'HIT' : 'MISS'}.`, ok ? 'hit' : 'miss');
        if (ok) { const n = C.combat.baseDamage + (rc ? C.combat.critBonusDamage || 0 : 0), dealt = damage(m, n, { crit: rc, byHero: true }); log(`${m.name} takes ${dealt} Damage (${m.life}/${m.maxLife}).`, 'hit'); }
      }
    }
  }
  // after a melee attack against you resolves (Tumble)
  if (melee && !h.comp && h.life > 0) { const tb = await offerReaction(h, 'reactMeleeResolved', `${esc(m.name)}'s attack on ${esc(h.name)} resolved.`, '');
    if (tb) for (const op of FX[tb].do) await KW.run(E, { h, card: CARD[tb] }, op); }
  if (h.control === 'npc' && h.freeMove > 0 && h.life > 0 && !h.comp) { aiStepAway(h); h.freeMove = 0; }
  if (!R.hit) missPuff(h);
  narrate('attack', { a: m, t: h, hit: R.hit, dmg: Math.max(0, life0 - h.life), crit, w: mode.name, ranged });
  releaseHold();
  renderTable();
  return { hit: R.hit, crit };
}
// one NPC attack action (Multiattack N gives N of these per turn). key = 'main' / 'alt' / a mode object; no key = Auto DM choice.
async function monsterAttack(m, h, key) {
  const mode = key && typeof key === 'object' ? key : (npcModeFor(m, h, key) || npcModes(m)[0]);
  if (!m.attacked && !(m.attacksLeft > 0)) m.attacksLeft = 1;
  m.attacksLeft = Math.max(0, m.attacksLeft - 1); m.attacked = m.attacksLeft <= 0; m.attacksMade = (m.attacksMade || 0) + 1;
  if (m.stunned) { m.stunned = false; m.attacksLeft = 0; m.attacked = true; log(`${m.name} can't attack this turn (stunned).`, 'muted'); renderTable(); return; }
  m.lastMode = mode.key;
  if (mode.area) {
    const ts = areaTargets(m, mode, h);
    if (!ts.length) { log(`${m.name}'s ${mode.name} has no hero in its area.`, 'muted'); renderTable(); return; }
    spendMode(m, mode);
    log(`${m.name} uses ${mode.name} (${mode.area === 'burst' ? `every hero within ${mode.radius}` : mode.area === 'engaged' ? 'every hero Engaged with it' : mode.area === 'chain' ? `${ts[0].name} + ${mode.extra || 1} hero within ${mode.radius} of it` : `${ts[0].name} + every hero within ${mode.radius} of it`}): ${ts.map(x => x.name).join(', ')} — one roll per hero.`, 'play');
    m.fx = m.fx.filter(f => f.until !== 'nextAttack');
    for (const t of ts) { if (m.life <= 0 || G.over) break; await resolveNpcAttack(m, t, mode, { area: true }); }
    renderTable(); return;
  }
  if (isHidden(h)) { log(`${h.name} is Hidden — ${m.name} can't target them.`, 'muted'); return; }
  spendMode(m, mode);
  await resolveNpcAttack(m, h, mode);
}

// ---- NPC heroes: the computer plays a hero's turn (simple, OPEN — CONFIG.heroAI) ----
const cellsOf = reach => [...reach].map(([k, cost]) => { const [c, r] = k.split(',').map(Number); return { c, r, cost }; });
const nearMon = p => Math.min(99, ...liveMonsters().map(m => hexDist(p, m)));
function heroRangedWeapon(h) { return weaponsOf(h).find(id => weaponOf(id).kind === 'ranged' && usableW(h, id)); }
function heroReach(h) { // range the hero plans its move around
  if (h.type === 'Caster') { const n = Math.max(0, ...(h.spells || []).map(id => spellRangeOf(h, id) || 0)); if (n >= 2) return { ranged: true, n }; }   // v1.13: spells, not cantrips
  const rw = heroRangedWeapon(h);
  if (rw) return { ranged: true, n: weaponOf(rw).range + modSum(h, 'rangedRange') };
  return { ranged: false, n: Math.max(1, ...weaponsOf(h).filter(id => weaponOf(id).kind === 'melee' && usableW(h, id)).map(id => weaponOf(id).reach || 1)) };
}
// pick a target and a hex: melee heroes close in; ranged heroes stay in range but not Engaged (no Close Quarters)
function heroAIMove(h) {
  const R = heroReach(h), cells = cellsOf(reachable(h, moveBudget(h)));
  const foes = liveMonsters(); if (!foes.length) return null;
  const score = t => (t.life <= 1 ? -3 : 0) - (offGuard(t, h) ? 1 : 0) - (h.quarry === t.id ? 1 : 0) + t.life * 0.5;
  const canHit = (p, t) => hexDist(p, t) <= R.n;
  const reachable_ = foes.filter(t => cells.some(p => canHit(p, t)));
  const T = (reachable_.length ? reachable_ : foes).sort((a, b) => score(a) - score(b) || dist(h, a) - dist(h, b))[0];
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const key = p => { const inR = canHit(p, T), nm = nearMon(p);
    if (R.ranged) return [inR ? (nm > 1 ? 0 : 1) : 2, inR ? p.cost : hexDist(p, T), -nm];
    return [inR ? 0 : 1, inR ? p.cost : hexDist(p, T), -nm]; };
  let best = null; for (const p of cells) if (!best || lex(key(p), key(best)) < 0) best = p;
  return { T, to: best };
}
function heroTurnCardOK(h, id) {
  if (h.dashed && dashBlocksCard(id)) return false;
  const fx = FX[id] || {}; if (fx.when !== 'turn' || !fx.do) return false;
  const opt = playOptions(h, id)[0]; if (!opt || opt.disabled) return false;
  const ops = fx.do.map(o => o[0]);
  const hurt = h.maxLife - h.life;
  if (ops.includes('heal')) return hurt >= Math.min(2, h.maxLife - 1);
  if (ops.includes('rally')) return helpHeroes().some(x => x !== h && adjacent(x, h) && x.life < x.maxLife);
  if (ops.includes('hidden') && !ops.includes('freeMove')) return !engaged(h) && !liveMonsters().some(m => !targetCheck(h, newAttackFor(h), m));
  if (fx.do.some(o => o[0] === 'self' && o[1]?.taunt)) return engaged(h) && h.life >= 3;
  if (fx.do.some(o => o[0] === 'self' && o[1]?.speed && !ops.includes('attackMode'))) return false; // used only when needed (see autoHeroTurn)
  if (ops.includes('attackMode') || ops.includes('extraAttack')) { const A = newAttackFor(h); return !!A && liveMonsters().some(m => !targetCheck(h, A, m)); }
  return true;
}
const newAttackFor = h => h.attacks.length ? newAttack(h) : null;
// NPC hero spell choice (simple, OPEN): heal a hurt hero, else the strongest attack spell with a target, else a useful buff/control
function aiPickSpell(h) {
  let bestM = -1;
  let best = null; const per = h.type === 'Caster' ? 2 : 3.5; // must beat the weapon attacks the cast gives up
  for (const id of h.spells) {
    if (canCast(h, id)) continue;
    const lose = ACT_ON() ? Math.max(0, wLeft(h) - wLeft(h, ['S' + spellLevelOf(id)])) : 1, bs0 = Math.max(0.5, per * lose);
    const sp = FX[id].spell, ops = JSON.stringify(sp); let sc = 0;
    const R = r => spellRng(h, r);
    const healN = (ops.match(/"healT",(\d)/) || [])[1];
    if (healN) { const pool = sp.kind === 'allWithin' ? helpHeroes().filter(u => dist(u, h) <= R(sp.range)) : helpHeroes().filter(u => u === h || dist(u, h) <= (sp.range === 'adj' ? 1 : sp.range === 0 ? 0 : R(sp.range)));
      const miss = pool.reduce((a, u) => a + Math.min(+healN, u.maxLife - u.life), 0), worst = Math.max(0, ...pool.map(u => u.maxLife - u.life));
      sc = worst >= 2 || pool.some(u => u.life === 1) ? 3 + miss : 0; }
    else if (sp.kind === 'attack') { const n = sp.area || sp.line ? Math.max(1, ...liveMonsters().filter(m => dist(m, h) <= R(sp.range)).map(c => liveMonsters().filter(m => hexDist(m, c) <= (sp.area || 1)).length)) : (sp.count || 1);
      sc = (sp.dmg || 1) * 1.6 * n + (sp.atk || 0) * 0.5 + (sp.onHit ? 0.6 : 0) + 1; }
    else if (sp.kind === 'check') { const n = sp.targets === 'adjacent' ? liveMonsters().filter(m => adjacent(m, h)).length : sp.targets === 'within' ? liveMonsters().filter(m => dist(m, h) <= sp.within).length : 1;
      sc = /pinTarget/.test(ops) && !/dmgT|stunFull|poisonTarget|pushT|pullT|challenge|heal|markT|hideT/.test(ops) ? 0 : /dmgT/.test(ops) ? 1.5 + n : /stunFull|poisonTarget|weakenT/.test(ops) ? 1 + n : /pushT/.test(ops) ? (engaged(h) ? 2.6 : 0) : /challenge/.test(ops) ? 1.5 : 1.2; }
    else if (sp.kind === 'enemy') sc = 2.5;
    else if (sp.kind === 'mark') sc = h.markId && byId(h.markId)?.life > 0 ? 0 : (liveMonsters().some(m => !targetCheck(h, newAttackFor(h) || { tok: {}, mods: {}, kind: 'melee' }, m)) ? 1 : 3.8);
    else if (sp.kind === 'ally' && /fxOnce/.test(ops)) sc = h.fx.some(f => f.label === 'Mage Armor') ? 0 : 2.1;
    else if (sp.kind === 'allWithin' && /Bless/.test(ops)) sc = 1 + liveHeroes().filter(u => dist(u, h) <= R(sp.range)).length;
    else if (sp.kind === 'ally') sc = engaged(h) ? 2.2 : 1;
    else if (sp.kind === 'shape') sc = engaged(h) ? 3 : 0;
    else if (sp.kind === 'terrain') sc = 1.8;
    else if (sp.kind === 'snare') sc = 1.5;
    if (isAreaSave(id)) { const a = autoArea(h, id); sc = a ? 1 + a.score * 1.6 * Math.max(1, areaDmg(h, FX[id].spell) || 1) : 0; }
    if (isOnce(id)) sc -= 0.3;
    if (sc > bs0 && (!best || sc - bs0 > bestM)) { bestM = sc - bs0; best = id; }
  }
  return best;
}
// companions: the Wolf closes on the hero's target, the Hawk perches next to it
function aiCompanions(h) {
  for (const c of liveComps().filter(c => c.ownerId === h.id && c.moveLeft > 0)) {
    const foe = liveMonsters().sort((a, b) => dist(h, a) - dist(h, b))[0]; if (!foe) return;
    const cells = cellsOf(reachable(c, c.moveLeft)); if (!cells.length) continue;
    const best = cells.sort((a, b) => (hexDist(a, foe) === 1 ? 0 : 1) - (hexDist(b, foe) === 1 ? 0 : 1) || hexDist(a, foe) - hexDist(b, foe) || a.cost - b.cost)[0];
    if (best.cost > 0) { tryMove(c, best); }
  }
}
async function autoHeroTurn(h) {
  G.aiTurn = h.id; renderTable();
  // a stale AI turn (battle over, rematch started, or the turn moved on) stops at the next pause
  const g0 = G, STOP = {};
  const pause = async () => { await beat(1, heroPaceMs()); if (G !== g0 || !G || G.over || current() !== h) throw STOP; };
  await asHero(h, async () => {
    await pause();
    // 0) free heals: Lay on Hands, potions / poultices when hurt
    if (h.style === 'Paladin' && h.lohLeft > 0) { const t = mostHurt([h, ...helpHeroes().filter(u => adjacent(u, h))]); if (t && t.maxLife - t.life >= 2) await layOnHands(h); }
    for (const id of activations(h, 'turn')) { const a = FX[id].activate; if (a.usesAction || a.do.some(o => o[0] === 'attackMode')) continue;
      if (a.do.some(o => /heal/i.test(o[0]) || (o[0] === 'pickAlly')) && h.maxLife - h.life >= 2) await useActivation(h, id); }
    let plan = heroAIMove(h);
    if (plan && !liveMonsters().some(m => cellsOf(reachable(h, moveBudget(h))).some(p => hexDist(p, m) <= heroReach(h).n)))
      for (const id of [...h.hand]) { const fx = FX[id]; if (fx?.when === 'turn' && fx.do?.some(o => o[0] === 'self' && o[1]?.speed) && !playOptions(h, id)[0]?.disabled && !(fx.do || []).some(o => o[0] === 'attackMode')) { await playCard(h, id); break; } }
    // 1b) Dash (USER-APPROVED): nothing reachable to attack and no useful spell -> double move toward the enemy
    if (!dashBlock(h) && !liveMonsters().some(m => cellsOf(reachable(h, moveBudget(h))).some(p => hexDist(p, m) <= heroReach(h).n)) && !(h.spells.length && aiPickSpell(h))) doDash(h);
    // 2) move (and companions)
    plan = heroAIMove(h);
    if (plan?.to && plan.to.cost > 0) { const e = tryMove(h, plan.to); if (!e) { renderTable(); await pause(); } }
    aiCompanions(h);
    // 2b) spells: casting is the action (OPEN); extra casts from Mana Potion / Mana Surge
    for (let g = 0; g < 3 && h.spells.length && !G.over; g++) { const sid = aiPickSpell(h); if (!sid) break; const before = h.attacks.length; const ok = await castSpell(h, sid); await pause(); if (!ok) break;
      if (!ACT_ON()) { if (!(h.extraCasts > 0) && h.attacks.length <= before) break; if (h.attacks.some(t => t.mode?.spell)) break; } }
    if (G.over) return;
    // 3) power-ups for this turn (buffs, attack cards) while plays remain
    for (let g = 0; g < 4 && canPlay(h); g++) { const id = h.hand.find(x => heroTurnCardOK(h, x)); if (!id) break; await playCard(h, id); await pause(); if (G.over) return; }
    // 4) attacks: every attack token, best legal target
    for (let g = 0; g < 8 && h.attacks.length && !G.over; g++) {
      G.atk = newAttack(h); const A = G.atk;
      const legal = liveMonsters().filter(m => !targetCheck(h, A, m));
      if (!legal.length) { G.atk = null; break; }
      A.target = legal.sort((a, b) => (a.life <= 1 ? -1 : 0) - (b.life <= 1 ? -1 : 0) || a.life - b.life || (offGuard(b, h) ? 1 : 0) - (offGuard(a, h) ? 1 : 0) || dist(h, a) - dist(h, b))[0].id;
      for (const id of [...h.hand]) if (FX[id]?.when === 'beforeRoll' && canPlay(h) && !playOptions(h, id)[0]?.disabled) await playCard(h, id);
      rollHeroAttack(); if (A.d6 == null) { G.atk = null; break; } await pause();
      if (!A.hit) {
        const act = activations(h, 'afterRoll')[0]; if (act && !A.locked) { await useActivation(h, act); evalAttack(); }
        if (!A.hit) for (const id of [...h.hand]) if (FX[id]?.when === 'afterRoll' && canPlay(h) && !playOptions(h, id)[0]?.disabled) { await playCard(h, id); evalAttack(); break; }
      }
      if (A.hit) { const sm = smiteOptions(h, A).sort((a, b) => (isOnce(a) ? 1 : 0) - (isOnce(b) ? 1 : 0))[0]; if (sm && byId(A.target).life > A.dmg - (isOnce(sm) ? 2 : 0)) await castSmite(h, sm); }
      if (A.hit) for (const id of [...h.hand]) if ((FX[id]?.when === 'onHit' || (FX[id]?.when === 'onCrit' && A.crit)) && canPlay(h) && !playOptions(h, id)[0]?.disabled) { await playCard(h, id); break; }
      await finishAttack(A.hit); if (G.over) return; await pause();
      if (moveBudget(h) > 0 && h.attacks.length && !liveMonsters().some(m => !targetCheck(h, newAttack(h), m))) { const p2 = heroAIMove(h); if (p2?.to?.cost > 0) tryMove(h, p2.to); }
    }
    // 5) after attacking: e.g. Vanish (Hidden + free move); then step out of melee if ranged
    for (let g = 0; g < 2 && canPlay(h); g++) { const id = h.hand.find(x => FX[x]?.when === 'turn' && (FX[x].req || []).includes('attackedThisTurn') && !playOptions(h, x)[0]?.disabled); if (!id) break; await playCard(h, id); }
    if ((h.freeMove > 0 || moveBudget(h) > 0) && heroReach(h).ranged && engaged(h)) aiStepAway(h);
    else if (h.freeMove > 0) aiStepAway(h);
  }).catch(e => { if (e !== STOP) throw e; });
  if (G !== g0) return;
  G.aiTurn = null; G.atk = null;
  if (!G || G.over) { renderTable(); return; }
  renderTable(); await beat(0.5, heroPaceMs());
  if (current() === h && h.control === 'npc') await endTurn();
}
// move to the reachable hex farthest from monsters (used for free moves and ranged heroes)
function aiStepAway(h) {
  const cells = cellsOf(reachable(h, moveBudget(h))); if (!cells.length) return;
  const best = cells.sort((a, b) => nearMon(b) - nearMon(a) || a.cost - b.cost)[0];
  if (best.cost > 0 && nearMon(best) > nearMon(h)) tryMove(h, best);
}

// ---- Auto DM ----
// Targeting (Malcom placeholder, OPEN): nearest hero it can reach this turn; ties lowest Life, then lowest Toughness, then random.
// Taunt / Challenge still win; Predator = lowest Toughness it can reach. Down heroes only when no standing hero is reachable (OPEN).
function canReachToAttack(m, h, reach) {
  const ms = npcModes(m).filter(x => modeReady(m, x) && !(x.noDamage && !x.poison));
  for (const k of reach.keys()) { const [c, r] = k.split(',').map(Number); const d = Math.max(isGiant(m) ? 1 : 0, hexDist({ c, r }, h) - (isGiant(m) ? 1 : 0)); if (ms.some(x => modeOK(x, d))) return true; }
  return false;
}
function pickTarget(m) {
  const all = legalMonsterTargets(m), standing = all.filter(h => h.life > 0);
  const taunters = standing.filter(h => h.fx.some(f => f.taunt) && dist(m, h) <= 3);
  const ch = m.fx.find(f => f.challengedBy), chal = ch && standing.find(h => h.id === ch.challengedBy);
  let list = chal ? [chal] : taunters.length ? taunters : standing;
  const reach = reachable(m, moveBudget(m));
  const can = list.filter(h => canReachToAttack(m, h, reach));
  if (can.length) list = can;
  else { const dn = all.filter(h => isDownHero(h) && canReachToAttack(m, h, reach));
    if (dn.length && C.dying.autoDmTargetsDown === 'lastResort' && !standing.some(h => canReachToAttack(m, h, reach))) list = dn; }
  if (!list.length) list = all;
  const pred = npcHas(m, 'predator');
  return list.map(h => ({ h, k: Math.random() })).sort((a, b) => (pred ? effTough(a.h) - effTough(b.h) || a.h.life - b.h.life : 0) || dist(m, a.h) - dist(m, b.h) || a.h.life - b.h.life || effTough(a.h) - effTough(b.h) || a.k - b.k)[0]?.h;
}
// the best target it can attack right now (standing heroes first)
function attackableNow(m, prefer) {
  const ok = legalMonsterTargets(m).filter(x => !monsterCanAttack(m, x) && npcModeFor(m, x));
  const st = ok.filter(x => x.life > 0), pool = st.length ? st : ok;
  if (prefer && pool.includes(prefer)) return prefer;
  const pred = npcHas(m, 'predator');
  return pool.sort((a, b) => (pred ? effTough(a) - effTough(b) : 0) || a.life - b.life)[0] || null;
}
// best end hex for a ranged NPC: in Range of h, not adjacent to any hero (no Close Quarters), as far from the heroes as possible
function rangedSpot(m, h, cells, range) {
  const heroes = liveHeroes(), rg = range || m.range;
  const score = ({ c, r, cost }) => { const p = { c, r }, dT = hexDist(p, h), near = Math.min(...heroes.map(x => hexDist(p, x)));
    const inR = dT <= rg, safe = near > 1;
    return [inR && safe ? 0 : inR ? 1 : 2, inR ? -near : dT, safe ? 0 : 1, cost]; };
  const lex = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  let best = null, bs = null;
  for (const x of cells) { const sc = score(x); if (!bs || lex(sc, bs) < 0) { best = x; bs = sc; } }
  return best;
}
// Tactic (npc deck "Tactic" column, Malcom npc_levels §4, OPEN):
//  Charger: moves to melee its target if it can reach it this turn, else moves toward it and uses a ranged option if in range.
//  Skirmisher: ends in the best spot in Range of its ranged option, not adjacent to a hero; it can't step away from an adjacent
//  hero two turns in a row (then it stays and fights). With no ranged option ready it acts as a Charger.
function tacticPlan(m, h) {
  const ready = npcModes(m).filter(x => modeReady(m, x));
  const rangedOpt = ready.filter(x => !x.melee && !x.noDamage && !x.area).sort((a, b) => modeRange(b) - modeRange(a))[0];
  const meleeOpt = ready.find(x => x.melee && !x.area);
  if (/skirm/i.test(m.tactic || '') && rangedOpt) {
    if (engaged(m) && C.npc.skirmisherNoStepTwice && m.steppedAway === m.turnCount - 1) return { move: false, why: "stays: a Skirmisher can't step away two turns in a row" };
    const near = Math.min(99, ...liveHeroes().map(x => dist(m, x)));
    if (dist(m, h) <= modeRange(rangedOpt) && near > 1) return { move: false };
    return { move: true, ranged: true, range: modeRange(rangedOpt) };
  }
  if (meleeOpt) return adjacent(m, h) ? { move: false } : { move: true };
  if (!rangedOpt) return { move: !ready.some(x => modeOK(x, dist(m, h))) };
  return { move: !(dist(m, h) <= modeRange(rangedOpt) && !engaged(m)), ranged: true, range: modeRange(rangedOpt) };
}
function autoMove(m, h, plan = {}) {
  const reach = reachable(m, moveBudget(m)); let best = null;
  if (plan.ranged) best = rangedSpot(m, h, cellsOf(reach), plan.range);
  else for (const [k, cost] of reach) {
    const [c, r] = k.split(',').map(Number); const d = Math.max(isGiant(m) ? 1 : 0, hexDist({ c, r }, h) - (isGiant(m) ? 1 : 0));
    if (!best || d < best.d || (d === best.d && cost < best.cost)) best = { c, r, d, cost };
  }
  if (best && best.cost > 0) { m.moveLeft -= best.cost; m.moved = true; walkNpc(m, pathTo(reach, m, best)); return best.cost; }
  return 0;
}
// USER RULE (2026-10-18): NPC Dash. No hero in range of any of its attacks from anywhere it can reach -> it moves up to 2 x Speed, no attack.
function npcDash(m, why) {
  const mult = C.npc.dash?.multiplier || 2, sp = effSpeed(m);
  m.dashed = true; m.attacksLeft = 0; m.attacked = true;
  m.moveLeft = (m.moveLeft || 0) + sp * (mult - 1);
  log(`${m.name} Dashes (${mult} × Speed ${sp} = ${sp * mult} spaces this turn)${why ? ': ' + why : ''} — no attack this turn.`, 'play');
}
async function autoMonsterTurn(m) {
  const g0 = G;
  G.busy = true; renderTable();
  await beat();
  if (G !== g0 || G.over) return;   // stale: a rematch started or the fight ended
  // Blink (Mage): escape melee at the start of its turn
  if (canBlink(m)) {
    const h0 = pickTarget(m) || liveHeroes()[0];
    const spot = h0 && rangedSpot(m, h0, blinkHexes(m).map(p => ({ ...p, cost: 0 })));
    if (spot && Math.min(...liveHeroes().map(x => hexDist(spot, x))) > 1) { blinkTo(m, spot); renderTable(); await beat(); }
  }
  let h = pickTarget(m);
  if (!h) log(`${m.name} has no target — every hero is Hidden (it makes no attack — OPEN).`, 'muted');
  else {
    const reach0 = reachable(m, moveBudget(m));
    const anyReach = legalMonsterTargets(m).some(x => canReachToAttack(m, x, reach0));
    const prev = { c: m.c, r: m.r };
    if (!anyReach && C.npc.dash?.enabled && effSpeed(m) > 0 && !m.stunned) {
      npcDash(m, 'no hero is in range of any of its attacks');
      const mv = autoMove(m, h); await playWalk(m);
      if (mv > 0 && m.life > 0) await monsterMoved(m, prev);
      if (m.life <= 0) { if (checkEnd()) return; }
      if (mv > 0) { log(`${m.name} moves ${mv} space${mv === 1 ? '' : 's'} toward ${h.name}.`, 'muted'); renderTable(); await beat(); }
    } else {
      const plan = tacticPlan(m, h), eng0 = engaged(m);
      if (plan.why) log(`${m.name} ${plan.why}.`, 'muted');
      if (plan.move) {
        const mv = autoMove(m, h, plan); await playWalk(m);
        if (mv > 0 && m.life > 0) await monsterMoved(m, prev);
        if (m.life <= 0) { if (checkEnd()) return; }
        if (mv > 0) { if (eng0 && !engaged(m)) m.steppedAway = m.turnCount;
          log(`${m.name} moves ${mv} space${mv === 1 ? '' : 's'}${plan.ranged ? ` (${m.tactic || 'keeps distance'}: keeps ${Math.min(...liveHeroes().map(x => dist(m, x)))} sp from the nearest hero)` : ` toward ${h.name}`}.`, 'muted'); renderTable(); await beat(); }
        else if (effSpeed(m) === 0) log(`${m.name} can't move (Speed 0).`, 'muted');
      }
      for (let i = 0; i < 6 && m.life > 0 && !G.over && !m.attacked; i++) {
        const tgt = attackableNow(m, h);
        if (!tgt) { if (i === 0) log(`${m.name} can't reach anyone this turn.`, 'muted'); break; }
        await monsterAttack(m, tgt);
        if (checkEnd()) return;
        if (G !== g0) return;
      }
    }
    if (m.life > 0 && fogWanted(m)) useFogCloud(m);
  }
  await beat(0.5);
  if (G !== g0) return;
  G.busy = false;
  if (!G || G.over) { renderTable(); return; }
  if (current() === m && G.dmMode === 'auto') await endTurn();
}

// =====================================================================
// TABLE RENDERING
// =====================================================================
// =====================================================================
// v1.6 UNDO: a full-state snapshot before every user action (Ctrl+Z / Cmd+Z or the Undo button).
// Dice rolls are undone too (the snapshot is from before the roll). Never goes past the start of the battle.
// Undoing after Auto DM / NPC-hero turns rewinds to the last thing a person did.
// =====================================================================
const UNDO = { stack: [] };
const UI = { open: new Set(), dmTarget: null };   // hero panels the user expanded, the DM's chosen target (not part of the game state)
// =====================================================================
// v1.10 POINT OF VIEW. The screen is drawn for ONE viewer: the DM, or one hero. This is local to the device (never in G or the
// undo stack), so it carries over to per-device play (PLAN_multiplayer.md): each device will simply have a fixed viewer, and the
// same viewer() / VISIBLE rules decide what that device shows.
//   Hot-seat: "Follow the turn" (default) shows the hero whose turn it is; a Human-DM NPC turn shows the DM view; Auto DM and
//   computer-run hero turns keep the last hero's view. A manual selector pins the DM or any hero.
// USER DECISION (2026-10-21), hero view: VISIBLE = monster Life numbers, other heroes' Life; HIDDEN = monster stat cards and
// abilities, the DM's Legendary Action options, other heroes' cards and hands. CONFIG.view lists the same.
// =====================================================================
const VIEW = { pin: null, temp: null, last: null };
const viewMode = () => ((SET().view || window.__TEST_VIEW || C.view?.default || 'follow') === 'dm' ? 'dm' : 'follow');   // __TEST_VIEW: the older e2e checks run in the DM view
function viewer() {
  if (!G) return { kind: 'dm' };
  if (VIEW.temp) return VIEW.temp;
  const heroV = id => { const h = byId(id); return h && h.side === 'pc' && !h.comp ? { kind: 'hero', id } : null; };
  if (VIEW.pin) return VIEW.pin === 'dm' ? { kind: 'dm' } : (heroV(VIEW.pin) || { kind: 'dm' });
  if (viewMode() === 'dm' || G.phase !== 'battle') return { kind: 'dm' };
  const cu = current();
  if (cu && cu.side === 'pc' && cu.control !== 'npc') { VIEW.last = cu.id; return { kind: 'hero', id: cu.id }; }
  if (cu && cu.side === 'npc' && G.dmMode === 'human' && !G.over) return { kind: 'dm' };
  return (VIEW.last && heroV(VIEW.last)) || { kind: 'dm' };
}
const heroViewOf = () => { const v = viewer(); return v.kind === 'hero' ? byId(v.id) : null; };
// the viewer's own characters (bold in the initiative tracker): DM = every NPC; hero = the heroes that player runs (same player, not computer-run)
function isMine(v, u) {
  if (!u) return false;
  if (v.kind === 'dm') return u.side === 'npc';
  const me = byId(v.id), o = u.comp ? compOwner(u) : u;
  return !!(me && o && o.side === 'pc' && (o.id === me.id || (o.owner && o.owner === me.owner && o.control !== 'npc')));
}
function setView(v) { if (v === 'follow') { VIEW.pin = null; SET().view = 'follow'; save(); } else if (v === 'dm-follow') { VIEW.pin = null; SET().view = 'dm'; save(); } else VIEW.pin = v; renderTable(); }
function trackerHtml(v) {
  if (!G.order.length) return '<div class="order tracker muted" id="initTracker">Initiative not rolled yet</div>';
  return `<div class="order tracker" id="initTracker" title="Initiative tracker (turn order). Blue = whose turn it is; bold = your characters">${G.order.map((id, i) => { const u = byId(id); if (!u) return '';
    const now = i === G.turn && G.phase === 'battle' && !G.over, mine = isMine(v, u);
    return `<span data-unit="${u.id}" class="${now ? 'now' : ''} ${mine ? 'mine' : ''} ${u.side} ${u.life <= 0 ? 'down' : ''} ${u.dead ? 'dead' : ''}" title="${esc(u.name)} · Initiative ${u.initRoll ?? '?'}${u.dead ? ' · dead' : isDownHero(u) ? ' · ' + downBadge(u) : ''}${u.control === 'npc' ? ' · NPC hero' : ''}${now ? ' · acting now' : ''}">${esc(u.name)}</span>`; }).join('')}</div>`;
}
function viewSelHtml(v) {
  const pinned = VIEW.pin, mode = viewMode();
  const sel = pinned ? pinned : mode === 'dm' ? 'dm-follow' : 'follow';
  return `<label class="viewsel small" title="Point of view: whose screen this is. Follow the turn = the hero whose turn it is (hot-seat); the DM view shows everything.">👁 <select id="viewSel">
    <option value="follow" ${sel === 'follow' ? 'selected' : ''}>Follow the turn${sel === 'follow' ? ` (${esc(v.kind === 'dm' ? 'DM' : byId(v.id)?.name || '')})` : ''}</option>
    <option value="dm-follow" ${sel === 'dm-follow' ? 'selected' : ''}>DM view (always)</option>
    ${G.heroes.map(h => `<option value="${h.id}" ${sel === h.id ? 'selected' : ''}>Hero: ${esc(h.name)}</option>`).join('')}</select></label>`;
}
// public badges for the hero view: conditions anyone at the table can see; no abilities, attack options or Legendary Actions
function publicBadges(u, viewerHero) {
  const b = [];
  if (u.life <= 0) b.push('<span class="st dead">Down</span>');
  if (isHidden(u)) b.push('<span class="st hidden">Hidden</span>');
  if (u.poison > 0) b.push(`<span class="st poison">Poisoned ${u.poison}</span>`);
  if (u.fx.some(f => f.speedZero)) b.push('<span class="st pin">Speed 0</span>');
  if (u.stunned) b.push('<span class="st stun">Stunned</span>');
  if (G.phase === 'battle' && offGuard(u, viewerHero)) b.push('<span class="st og">Off Guard</span>');
  if (G.heroes.some(h => h.quarry === u.id)) b.push('<span class="st mark">Quarry</span>');
  if (u.fx.some(f => f.markedBy)) b.push('<span class="st mark">Marked</span>');
  if (engaged(u) && G.phase === 'battle') b.push('<span class="st eng">Engaged</span>');
  if (u.bloodiedDone) b.push('<span class="st downb">Bloodied</span>');
  return b.join('');
}
function enemyList(hv) {
  return `<div class="enemies parchment" id="enemyList"><div class="lbl">Enemies <span class="muted small">(what your hero can see)</span></div>${G.monsters.filter(m => !m.dead).map(m => `<div class="enemy ${m.life <= 0 ? 'down' : ''} ${current() === m ? 'active' : ''}" data-unit="${m.id}">
    <span class="mtag" style="--tc:${m.color || '#8b1d1d'}">${esc(m.tag)}</span><b>${esc(m.name)}</b> <span class="elife" title="Life">❤ ${m.life}/${m.maxLife}</span> <span class="muted small">🛡 ${effTough(m)} · L${m.level || 1}</span>${lifeBar(m)}
    <div class="badges">${publicBadges(m, hv)}</div></div>`).join('')}</div>`;
}
function publicDock(hv) {
  const u = current(); if (!u) return '';
  const who = u.side === 'npc' ? `🐉 ${esc(u.name)} (the DM's turn${G.dmMode === 'auto' ? ', Auto DM' : ''})` : u.control === 'npc' ? `🤖 ${esc(u.name)} (computer-run hero)` : `🎮 ${esc(u.name)}'s turn (${esc(u.owner || '')})`;
  return `<div class="dock-msg"><h3>${who}</h3><p class="muted">You are looking at the table as <b>${esc(hv.name)}</b>. ${u.side === 'pc' && u.control !== 'npc' ? `Switch the 👁 view to ${esc(u.name)} (or "Follow the turn") to play that turn.` : u.side === 'npc' && G.dmMode === 'human' ? 'The DM plays this turn from the DM view (👁 at the top).' : 'Wait for it to finish.'}</p></div>`;
}
// ---- v1.10 card overlay: one category of cards, big, with arrow keys / ‹ › / thumbnails / Esc ----
function openGallery(title, items, start = 0) {   // items: [{img, name, sub, html, actions:[{label, fn, disabled, why}]}]
  if (!items.length) { toast('Nothing here.'); return null; }
  document.querySelector('.gallery')?.closest('.modal-back')?.remove();
  const n = items.length; let i = Math.max(0, Math.min(n - 1, start));
  const m = modal(`<div class="gal-head"><h3>${esc(title)}</h3><span class="muted small" id="galPos"></span><span class="muted small">← → or ‹ › to browse · Esc to close</span><button data-close id="galClose">✕ Close</button></div>
    <div class="gal-main"><button class="gal-nav" id="galPrev" title="Previous (←)">‹</button><div class="gal-stage" id="galStage"></div><button class="gal-nav" id="galNext" title="Next (→)">›</button></div>
    <div class="gal-thumbs" id="galThumbs">${items.map((it, k) => `<button class="gal-th ${it.dim ? 'dim' : ''} ty-${it.ty || 'other'}" data-gi="${k}" title="${esc(it.name)}">${it.img ? `<img src="${it.thumb || it.img}" alt="">` : ''}<span>${esc(it.name)}</span></button>`).join('')}</div>`, 'gallery');
  const stage = $('#galStage', m);
  const show = k => { i = (k + n) % n; const it = items[i];
    stage.classList.toggle('dim', !!it.dim); stage.dataset.ty = it.ty || '';
    stage.innerHTML = `${it.img ? `<img class="gal-card ${it.dim ? 'dim' : ''}" src="${it.img}" alt="${esc(it.name)}">` : ''}<div class="gal-info">${it.timing ? `<span class="putime pt-${it.timing}" title="Power-up timing (from its text)">⏱ ${PUT_LBL[it.timing]}</span>` : ''}<h2>${esc(it.name)}</h2>${it.sub ? `<div class="muted">${esc(it.sub)}</div>` : ''}${it.dim ? '<div class="gal-dimnote small">Greyed: can\'t be activated right now</div>' : ''}${it.text ? `<p class="gal-text">${esc(it.text)}</p>` : ''}${it.html || ''}
      ${(it.actions || []).map((a, j) => `<button class="primary" data-ga="${j}" ${a.disabled ? 'disabled' : ''}>${esc(a.label)}</button>${a.disabled && a.why ? `<div class="muted small">${esc(a.why)}</div>` : ''}`).join('')}</div>`;
    $$('[data-ga]', stage).forEach(b => b.onclick = async () => { const a = it.actions[+b.dataset.ga]; close(); await a.fn(); if (G) renderTable(); });
    $$('.gal-th', m).forEach((t, k) => t.classList.toggle('on', k === i)); $(`.gal-th[data-gi="${i}"]`, m)?.scrollIntoView({ inline: 'center', block: 'nearest' });
    $('#galPos', m).textContent = `${i + 1} / ${n}`; m.dataset.index = i; };
  const close = () => { m.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (!document.body.contains(m)) return document.removeEventListener('keydown', key);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); show(i + 1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Home') show(0); else if (e.key === 'End') show(n - 1); else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  $('#galPrev', m).onclick = () => show(i - 1); $('#galNext', m).onclick = () => show(i + 1);
  $$('.gal-th', m).forEach(t => t.onclick = () => show(+t.dataset.gi));
  $('#galClose', m).onclick = close; m.onclick = e => { if (e.target === m) close(); };
  show(i); return m;
}
const CATS = { equip: 'Equipment', abil: 'Abilities', spells: 'Spells', hand: 'Power-ups in hand', deck: 'Power-up draw deck', discard: 'Discard pile' };
function heroCatIds(h, cat) {
  if (cat === 'equip') return [h.classCard, ...h.cards.equipment].filter(id => CARD[id]);
  if (cat === 'abil') return h.cards.abilities; if (cat === 'spells') return h.spells; if (cat === 'hand') return h.hand;
  if (cat === 'deck') return [...h.deck].sort((a, b) => CARD[a].name.localeCompare(CARD[b].name));   // order stays secret
  if (cat === 'discard') return [...h.discard].reverse();
  return [];
}
function openHeroCategory(hid, cat, startId) {
  const h = byId(hid); if (!h || !CATS[cat]) return;
  const hv = heroViewOf(); if (hv && hv.id !== h.id) { toast(`Hidden: ${h.name}'s cards are private in your hero view.`); return; }
  const canAct = current() === h && h.control !== 'npc' && G.phase === 'battle' && !G.over;
  const ids = heroCatIds(h, cat), ACT = activeCards(h);
  const items = ids.map(id => { const c = CARD[id], it = { id, img: c.imgFull || c.img, thumb: c.img, name: c.name, sub: `${c.type || ''}${c.level ? ' · L' + c.level : ''}`, text: c.text };
    if (cat === 'equip' && h.thrown[id] && !usableW(h, id)) it.sub += ' · thrown (pick it up first)';
    if (cat === 'spells') { it.sub += h.spellSpent.has(id) ? ' · cast (once per fight)' : h.spellDown.has(id) ? ' · face down' : ' · face up';
      const sp = FX[id]?.spell; if (canAct && !['reaction', 'smite', 'strike'].includes(sp?.kind)) { const why = canCast(h, id); it.actions = [{ label: 'Cast', disabled: !!why, why, fn: () => { pushUndo(`cast ${c.name}`); return castSpell(h, id); } }]; } }
    if (cat === 'hand') { const os = playOptions(h, id); if (os.length) it.actions = os.map(o => ({ label: o.label, disabled: o.disabled, why: o.why, fn: () => o.fn() })); }
    // v1.11: cards that can't be activated now are greyed; Abilities (and Equipment) with a turn activation can be used from here; weapons/spells can be selected for Attack
    it.dim = (cat === 'spells' || cat === 'hand') && !ACT.has(id);   // v1.11.1: Equipment & Abilities never grey
    it.ty = tyOf(id); if (c.type === 'Power-up') { it.timing = puTiming(id); it.sub += ` · ${PUT_LBL[it.timing]}`; }
    if (canAct && cat === 'spells' && ['smite', 'strike'].includes(FX[id]?.spell?.kind) && G.atk && G.atk.d6 != null && smiteOptions(h, G.atk).includes(id))
      it.actions = [{ label: `⚡ Cast ${c.name} on this hit`, fn: () => { pushUndo(`cast ${c.name}`); return castSmite(h, id); } }];
    if (canAct && (cat === 'abil' || cat === 'equip') && FX[id]?.activate && activations(h, 'turn').includes(id)) (it.actions = it.actions || []).push({ label: FX[id].activate.label, fn: () => { pushUndo(`use ${c.name}`); return useActivation(h, id); } });
    if (canAct && !AUTOARM() && ((cat === 'equip' && (FX[id]?.weapon || (id === h.classCard && !noBasic(h)))) || (cat === 'spells' && selectableSpell(h, id))) && ACT.has(id))
      (it.actions = it.actions || []).unshift({ label: '☝ Select for Attack', fn: () => { UI.sel[h.id] = { kind: cat === 'spells' ? 'spell' : 'weapon', id: id === h.classCard ? 'basic' : id }; syncSel(h); } });
    return it; });
  const title = `${h.name} — ${CATS[cat]} (${ids.length})${cat === 'deck' ? ' · shown A–Z, the draw order stays hidden' : ''}`;
  return openGallery(title, items, Math.max(0, ids.indexOf(startId)));
}
function npcStatHtml(m) {
  const md = npcModes(m), ab = Object.entries(m.abil || {});
  return `<div class="npcstat"><div class="chips"><span>❤ ${m.life}/${m.maxLife}</span><span>🏃 ${effSpeed(m)}</span><span>🛡 ${effTough(m)}</span><span>⚔ ${m.stats.atk}</span>${npcScaleAtk(m) ? `<span class="scaled" title="Level 1 NPC vs a Level ${partyLevelG()} party (user rule)">+${npcScaleAtk(m)} scaled</span>` : ''}<span>✦ ${m.stats.res}</span><span>★ ${m.stats.skill}</span></div>
    <div class="muted small">L${m.level || 1} · ${m.ep} EP · Tactic ${esc(m.tactic || 'Charger')}${m.role ? ' · ' + esc(m.role) : ''}${m.initRoll != null ? ' · Init ' + m.initRoll : ''}</div>
    <h4>Attacks</h4><ul>${md.map(mo => `<li><b>${esc(mo.name)}</b> — ${mo.melee ? 'melee (adjacent)' : `Range ${modeRange(mo)}`}${mo.area ? `, area (${esc(mo.area)} ${mo.radius || ''})` : ''}; ${mo.noDamage ? 'no Damage' : mo.dmg + ' Damage'}${mo.atk ? `, ${mo.atk > 0 ? '+' : ''}${mo.atk} Attack` : ''}${mo.poison ? `, Poisoned ${mo.poison}` : ''}${mo.push ? `, Push ${mo.push}` : ''}${mo.uses ? ' · ' + esc(modeUseText(m, mo)) : ''}</li>`).join('')}</ul>
    ${ab.length ? `<h4>Abilities</h4><ul>${ab.map(([k, a]) => `<li><b>${esc(a.badge || k)}</b>${a.note ? ' — ' + esc(a.note) : ''}</li>`).join('')}</ul>` : ''}
    ${m.la ? `<h4>⚡ Legendary Action</h4><p><b>${esc(m.la.name)}</b>: ${esc(m.la.text)}${m.la.damaging ? ' (damaging)' : ''}</p>` : ''}</div>`;
}
function openNpcCategory(startId) {
  if (heroViewOf()) { toast('Hidden: NPC stat blocks are the DM\'s information.'); return; }
  const ms = G.monsters.filter(m => !m.dead);
  const items = ms.map(m => ({ id: m.id, img: m.card && CARD[m.card] ? (CARD[m.card].imgFull || CARD[m.card].img) : '', thumb: m.card && CARD[m.card] ? CARD[m.card].img : '', name: m.name, sub: `${m.kindLabel || m.kind}${m.life <= 0 ? ' · down' : ''}`, html: npcStatHtml(m) }));
  return openGallery(`NPC stat blocks & abilities (${ms.length})`, items, Math.max(0, ms.findIndex(m => m.id === startId)));
}

function userTurn() { const u = current(); return !!u && G.phase === 'battle' && !G.over && (u.side === 'pc' ? u.control !== 'npc' : G.dmMode === 'human'); }
function pushUndo(label, force) {
  if (!G || G.phase !== 'battle' || G.over || G.busy || G.aiTurn) return false;
  if (!force && !userTurn()) return false;
  let snap; try { snap = structuredClone(G); } catch (e) { console.warn('undo snapshot failed', e); return false; }
  UNDO.stack.push({ snap, label }); if (UNDO.stack.length > (C.undoLimit || 150)) UNDO.stack.shift();
  return true;
}
function undoBlock() {
  if (!G || G.phase !== 'battle') return 'Nothing to undo.';
  if (!UNDO.stack.length) return 'Nothing to undo (it never goes back past the start of the battle).';
  if (G.busy || G.aiTurn) return 'Wait until the computer finishes acting.';
  if (document.querySelector('.modal-back')) return 'Close the open window first.';
  return null;
}
function doUndo() {
  const why = undoBlock(); if (why) { toast(why); return false; }
  const { snap, label } = UNDO.stack.pop();
  G = snap; G.busy = false; G.aiTurn = null; syncLife();
  window.NARR?.stop(); HOLD.n = 0; HOLD.downs.length = 0; Object.keys(HURT).forEach(k => delete HURT[k]); document.getElementById('fxLayer')?.replaceChildren();
  if (G.atk && !Object.getOwnPropertyDescriptor(G.atk, 'spell')) { const A = G.atk; Object.defineProperty(A, 'spell', { get: () => isSpellA(A), enumerable: false }); }
  log(`↶ Undo: ${label}.`, 'sys');
  renderTable();
  // safety net: if the restored turn belongs to the computer, let it act
  const u = current();
  if (u && G.phase === 'battle' && !G.over) { if (u.side === 'pc' && u.control === 'npc') autoHeroTurn(u); else if (u.side === 'npc' && G.dmMode === 'auto') autoMonsterTurn(u); }
  return true;
}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
  if (!G || G.phase !== 'battle' || !document.body.classList.contains('table')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
  e.preventDefault(); doUndo();
});
// v1.6 card browser: the active hero's power-ups and spells as a scrollable strip of larger cards.
// Click a card for a full-size close-up; Play / Cast work right here.
function cardBrowserItems(h) {
  const items = h.hand.map(id => { const o = playOptions(h, id)[0] || { label: 'Play', disabled: true, why: 'Not now.' };
    return { id, kind: 'Power-up', label: o.label, ok: !o.disabled, why: o.why, run: () => o.fn() }; });
  h.spells.forEach(id => { const why = canCast(h, id), sp = FX[id]?.spell;
    items.push({ id, kind: `Spell${h.spellDown.has(id) ? ' · face down' : ''}${isOnce(id) ? ' · once per fight' : ''}`, label: ['reaction', 'smite', 'strike'].includes(sp?.kind) ? 'Automatic' : 'Cast', ok: !why, why: why || '',
      run: () => { pushUndo(`cast ${CARD[id].name}`); return castSpell(h, id); } }); });
  return items;
}
function openCardBrowser(h, start = 0) {
  if (!h || h.side !== 'pc') return;
  const items = cardBrowserItems(h); if (!items.length) { toast('No cards to browse.'); return; }
  const m = modal(`<div class="cb-head"><h3>${esc(h.name)}'s cards <span class="muted small">${h.hand.length} power-up${h.hand.length === 1 ? '' : 's'} in hand · ${h.spells.length} spell${h.spells.length === 1 ? '' : 's'} · plays ${h.playsUsed}/${h.picks.play}</span></h3><button data-close>✕ Close</button></div>
    <div class="cb-wrap"><button class="cb-nav" id="cbPrev" title="Previous">‹</button><div class="cb-strip" id="cbStrip">
    ${items.map((it, i) => `<div class="cb-item ${it.ok ? 'playable' : ''}" data-cbi="${i}">
      <img src="${CARD[it.id].imgFull || CARD[it.id].img}" data-cbzoom="${i}" alt="${esc(CARD[it.id].name)}" title="Click for a full-size close-up">
      <div class="cb-name"><b>${esc(CARD[it.id].name)}</b><div class="muted small">${esc(it.kind)}</div></div>
      <button class="primary" data-cbplay="${i}" ${it.ok ? '' : 'disabled'}>${esc(it.label)}</button>${it.ok ? '' : `<div class="muted small cb-why">${esc(it.why)}</div>`}
    </div>`).join('')}</div><button class="cb-nav" id="cbNext" title="Next">›</button></div>
    <div class="muted small cb-foot">Scroll sideways (or use ‹ ›, arrow keys). Click a card for a full-size close-up. Gold-edged cards can be played now.</div>`, 'card-browser');
  const strip = $('#cbStrip', m), close = () => { m.remove(); document.removeEventListener('keydown', key); };
  const step = d => { const w = strip.querySelector('.cb-item')?.offsetWidth || 380; strip.scrollBy({ left: d * (w + 14), behavior: 'smooth' }); };
  const key = e => { if (!document.body.contains(m)) return document.removeEventListener('keydown', key); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'Escape' && !document.querySelector('.zoom-modal')) close(); };
  document.addEventListener('keydown', key);
  $('#cbPrev', m).onclick = () => step(-1); $('#cbNext', m).onclick = () => step(1);
  $('[data-close]', m).onclick = close; m.onclick = e => { if (e.target === m) close(); };
  $$('[data-cbplay]', m).forEach(b => b.onclick = async () => { const it = items[+b.dataset.cbplay]; close(); await it.run(); renderTable(); });
  $$('[data-cbzoom]', m).forEach(img => img.onclick = () => { const it = items[+img.dataset.cbzoom];
    zoomCard(it.id, it.label === 'Automatic' ? [] : [{ label: it.label, disabled: !it.ok, why: it.why, fn: async () => { close(); await it.run(); renderTable(); } }], true); });
  if (start) strip.querySelector(`[data-cbi="${start}"]`)?.scrollIntoView({ inline: 'center' });
  return m;
}
function toast(msg) { document.querySelectorAll('.toast').forEach(o => o.remove()); const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function statChips(u) {
  return `<div class="chips"><span title="Life">❤ ${u.life}/${u.maxLife}</span><span title="Speed">🏃 ${effSpeed(u)}</span><span title="Toughness">🛡 ${effTough(u)}</span>${u.side === 'pc' && !u.comp ? (() => { const sm = atkSummary(u.stats.atk, cardsOf(u), u.type); const best = sm.sort((a, b) => b.v - a.v)[0]; return `<span title="Attack — ${esc(sm.map(x => `${x.k} +${x.v} (${x.parts.map(p => `${p[0]} ${p[1] >= 0 ? '+' : ''}${p[1]}`).join(', ')})`).join('; '))}" class="atkchip" data-atk="${best ? best.v : u.stats.atk}">⚔ ${best ? `${best.k[0]}+${best.v}` : u.stats.atk}</span>`; })() : `<span title="Attack">⚔ ${u.stats.atk}</span>${npcScaleAtk(u) ? `<span class="scaled" title="Level 1 NPC vs a Level ${partyLevelG()} party: +${npcScaleAtk(u)} to attack rolls (user rule, CONFIG.npcScaling)">+${npcScaleAtk(u)} scaled</span>` : ''}`}<span title="Resilience">✦ ${u.stats.res}</span><span title="Skill">★ ${u.stats.skill}</span></div>`;
}
const lifeBar = u => { const p = 100 * u.life / u.maxLife; return `<div class="bar"><i style="width:${p}%;background:${p > 50 ? '#5d7b3a' : p > 25 ? '#c49a2c' : '#9b2222'}"></i></div>`; };
const lifeBtns = u => `<span class="lifeadj"><button data-life="${u.id}" data-d="-1" title="Remove 1 Life (manual)">−</button><button data-life="${u.id}" data-d="1" title="Add 1 Life (manual)">+</button></span>`;
function statusBadges(u, viewer) {
  const b = [];
  if (u.dead) return '<span class="st dead">☠ Dead</span>';
  if (isDownHero(u)) b.push(`<span class="st downb" title="Any heal brings them back up. ${C.dying.hitsToDie} enemy hits or ${C.dying.roundsToHeal} rounds without a heal kill them.">${downBadge(u)}</span>`);
  if (u.side === 'npc') b.push(`<span class="st lvl" title="NPC Level">L${u.level || 1}</span><span class="st tac" title="Tactic (Auto DM): ${/skirm/i.test(u.tactic) ? 'keeps at range, not adjacent' : 'charges into melee'}">${esc(u.tactic || 'Charger')}</span>${u.role && !/^L\d$/.test(u.role) ? `<span class="st role" title="Role">${esc(u.role.replace(/\s*\(.*\)$/, ''))}</span>` : ''}`);
  if (isHidden(u)) b.push('<span class="st hidden">Hidden</span>');
  if (u.poison > 0) b.push(`<span class="st poison">Poisoned ${u.poison}</span>`);
  if (u.fx.some(f => f.speedZero)) b.push(`<span class="st pin">${u.fx.some(f => f.held) ? 'Held: Speed 0' : 'Speed 0'}</span>`);
  if (u.stunned) b.push('<span class="st stun">Stunned</span>');
  if (u.side === 'npc' && G.phase === 'battle' && offGuard(u, viewer)) b.push('<span class="st og">Off Guard</span>');
  if (u.side === 'npc' && G.heroes.some(h => h.quarry === u.id)) b.push('<span class="st mark">Quarry</span>');
  if (u.fx.some(f => f.markedBy)) b.push('<span class="st mark">Marked</span>');
  if (u.side === 'pc' && engaged(u) && G.phase === 'battle') b.push('<span class="st eng">Engaged</span>');
  if (u.side === 'npc') {
    if (npcRanged(u)) b.push(`<span class="st spell" title="${esc(u.atkName)}: Spell Attack, Range ${u.range}, ${npcModes(u)[0].dmg} Damage">Spell R${u.range}</span>`);
    npcModes(u).filter(x => x.key !== 'main').forEach(x => b.push(`<span class="st ${x.spell ? 'spell' : 'ranged'} ${modeReady(u, x) ? '' : 'used'}" title="Second attack: ${esc(x.name)}${x.type ? ' — ' + esc(x.type) : ''}${x.melee ? ', melee' : `, Range ${x.range}`}${x.atk ? `, ${x.atk} Attack` : ''}, ${x.noDamage ? 'no Damage' : x.dmg + ' Damage'}${x.poison ? `, Poisoned ${x.poison}` : ''}${x.push ? `, Push ${x.push}` : ''}${x.area ? ', area' : ''}${x.uses ? ' · ' + modeUseText(u, x) : ''}. Source: ${esc(x.src || 'sheet')}">${x.melee ? '✋' : x.spell ? '🔥' : '🏹'} ${esc(x.name)}${x.melee ? '' : ' R' + modeRange(x)}${x.uses ? ` (${modeUseText(u, x)})` : ''}</span>`));
    if (u.la) b.push(`<span class="st la" title="Legendary Action: ${esc(u.la.text)}${u.la.damaging ? ' (damaging)' : ''}">⚡ ${esc(u.la.name)}${npcAbil(u, 'ownPool') ? ` ${u.laLeft ?? npcAbil(u, 'ownPool')}/${npcAbil(u, 'ownPool')}` : ''}</span>`);
    if (u.dashed) b.push('<span class="st eng">Dashed</span>');
    Object.entries(u.abil || {}).forEach(([k, a]) => { if (a.blink && u.usedFight.has('blink')) return b.push('<span class="st used" title="Blink used (once per fight)">Blink used</span>');
      if (a.unbreakable && u.ubUsed) return b.push(`<span class="st ab" title="${esc(a.note || '')}">Unbreakable ${a.unbreakable - u.ubUsed}/${a.unbreakable}</span>`);
      if ((a.fogCloud && u.usedFight.has('fogCloud')) || (a.unyielding && u.usedFight.has('unyielding'))) return b.push(`<span class="st used">${esc(a.badge)} used</span>`);
      b.push(`<span class="st ab ${a.regenerate ? 'regen' : ''} ${a.auto === 'partial' ? 'partial' : ''}" title="${esc(a.note || '')}">${esc(a.badge || k)}</span>`); });
    if (engaged(u) && G.phase === 'battle') b.push('<span class="st eng">Engaged</span>');
  }
  return b.join('');
}
const fxList = u => { const l = u.fx.filter(f => !f.hidden && !f.markedBy); return l.length ? `<div class="fx">${l.map(f => `<span>${esc(f.label)}${f.atk ? ` ${f.atk > 0 ? '+' : ''}${f.atk} Atk` : ''}${f.tough ? ` ${f.tough > 0 ? '+' : ''}${f.tough} Tough` : ''}${f.dmg ? ` +${f.dmg} Dmg` : ''}${f.speed ? ` +${f.speed} Spd` : ''}${f.speedZero ? ' Speed 0' : ''}${f.offGuard ? ' Off Guard' : ''}${f.targetsOffGuard ? ' targets Off Guard' : ''}${f.taunt ? ' Taunt' : ''}</span>`).join('')}</div>` : ''; };

function heroPanel(h, extra = '') {
  const cur = current() === h, open = cur || UI.open.has(h.id) || extra.includes('solo');
  return `<div class="hero-panel parchment ${extra} ${cur ? 'active' : ''} ${open ? 'expanded' : 'collapsed'} ${h.life <= 0 ? 'down' : ''} ${h.dead ? 'dead' : isDownHero(h) ? 'dying' : ''}" data-unit="${h.id}">
    <div class="hp-head" title="${cur ? 'Active hero' : open ? 'Click to collapse' : 'Click to expand'}">${cardImg(h.classCard, 'cls')}<div class="hp-title"><span class="chev">${open ? '▾' : '▸'}</span><b>${esc(h.name)}</b> <button class="small ctlbtn ${h.control === 'npc' ? 'npc' : ''}" data-hctl="${h.id}" title="Who plays this hero: you or the computer">${h.control === 'npc' ? '🤖 NPC' : '🎮 Me'}</button><div class="muted small">L${h.level} ${esc(h.style)} · ${esc(h.owner)}${h.initRoll != null ? ` · Init ${h.initRoll}` : ''} · <span class="lifetxt">❤ ${h.life}/${h.maxLife}</span></div>${lifeBar(h)}</div>${lifeBtns(h)}</div>
    <div class="badges hp-status">${statusBadges(h)}</div>
    <div class="hp-body">
    ${statChips(h)}${fxList(h)}
    <div class="hp-row" data-cat="equip" data-h="${h.id}" title="Click to see all Equipment cards large"><span class="lbl">Equip</span>${h.cards.equipment.map(id => cardImg(id, 'tiny' + (h.thrown[id] && !usableW(h, id) ? ' thrown' : ''))).join('')}</div>
    <div class="hp-row" data-cat="abil" data-h="${h.id}" title="Click to see all Ability cards large"><span class="lbl">Abil.</span>${h.cards.abilities.map(id => cardImg(id, 'tiny')).join('')}</div>
    ${h.spells.length ? `<div class="hp-row spellrow" data-cat="spells" data-h="${h.id}" title="Click to see all Spell cards large"><span class="lbl">Spells</span>${h.spells.map(id => `<span class="spellwrap ${h.spellDown.has(id) ? 'down' : ''}" title="${h.spellSpent.has(id) ? 'Cast (once per fight)' : h.spellDown.has(id) ? 'Face down — flips up at the start of your next turn' : 'Face up'}">${cardImg(id, 'tiny spell')}</span>`).join('')}</div>` : ''}
    ${h.lohLeft != null && h.style === 'Paladin' ? `<div class="muted small">🙏 Lay on Hands: ${h.lohLeft} left</div>` : ''}${h.markId && byId(h.markId)?.life > 0 ? `<div class="muted small">🎯 Marked: ${esc(byId(h.markId).name)}</div>` : ''}
    <div class="hp-row deckrow"><span class="pile" data-cat="deck" data-h="${h.id}" title="Power-up draw deck (click: see the cards, order hidden)">Deck ${h.deck.length}</span><span class="pile" data-cat="discard" data-h="${h.id}" title="Discard (click to see)">Discard ${h.discard.length}</span>
      <span class="hand-mini" data-cat="hand" data-h="${h.id}" title="Click to see your power-ups large">Hand ${h.hand.length}/${h.picks.slots}: ${h.hand.map(id => `<img class="cardimg tiny" src="${CARD[id].img}" data-hand="${h.id}|${id}" title="${esc(CARD[id].name)}">`).join('')}</span></div>
    ${h.freeMove > 0 && current() !== h ? `<div class="note small">May move ${h.freeMove} space${h.freeMove > 1 ? 's' : ''} now — drag the token.</div>` : ''}
  </div></div>`;
}
function monsterRow(m, mode = '') {
  const cur = current() === m, human = G.dmMode === 'human' && cur && G.phase === 'battle' && !G.over && mode !== 'noact';
  const viewer = current()?.side === 'pc' ? current() : null;
  let act = '';
  if (human) {
    const tg = [...liveHeroes(), ...G.heroes.filter(isDownHero)].map(h => ({ h, why: monsterCanAttack(m, h) }));
    const legal = tg.filter(x => !x.why);
    const md = npcModes(m), left = m.attacked ? 0 : (m.attacksLeft > 0 ? m.attacksLeft : 1);
    const okM = mo => !modeReady(m, mo) ? false : !enforce() ? true : mo.area === 'burst' || mo.area === 'engaged' ? areaTargets(m, mo).length > 0 : legal.some(x => modeOK(mo, dist(m, x.h)));
    const chosen = UI.dmTarget && UI.dmTarget.m === m.id && legal.some(x => x.h.id === UI.dmTarget.h) ? UI.dmTarget.h : null;   // v1.10: the DM's pick (dropdown or click a hero token) sticks
    const pre = chosen || (legal.find(x => x.h.life > 0 && modeOK(md[0], dist(m, x.h))) || legal.find(x => x.h.life > 0 && md.some(mo => modeOK(mo, dist(m, x.h)))) || legal[0])?.h.id;
    const cq = npcAnyRanged(m) && engaged(m) ? ` <span class="warn" style="display:inline">Close Quarters ${C.npc.spellCloseQuarters}</span>` : '';
    const btn = (mo, i) => { const off = left <= 0 || !okM(mo), id = i === 0 ? 'dmAttack' : i === 1 ? 'dmAttack2' : 'dmAttack' + (i + 1);
      const icon = mo.melee ? (mo.spell ? '✋' : '⚔') : mo.spell ? '🔥' : '🏹';
      const what = mo.area ? (mo.area === 'burst' ? `area: every hero within ${mo.radius}` : mo.area === 'engaged' ? 'area: every Engaged hero' : mo.area === 'chain' ? `target + ${mo.extra || 1} within ${mo.radius}` : `target + every hero within ${mo.radius}`) : '';
      const ttl = `${mo.type || (mo.melee ? 'Melee' : mo.spell ? 'Spell Attack' : 'Ranged')}${mo.melee ? ': an adjacent hero' : `, Range ${mo.range}`}; ${mo.noDamage ? 'no Damage' : mo.dmg + ' Damage'}${mo.atk ? `, ${mo.atk} Attack` : ''}${mo.poison ? `, Poisoned ${mo.poison}` : ''}${mo.push ? `, Push ${mo.push}` : ''}${mo.uses ? ' · ' + modeUseText(m, mo) : ''}${!mo.melee && !mo.area ? '; Close Quarters while Engaged' : ''}${left > 0 && off ? (modeReady(m, mo) ? ' (no hero in reach)' : ' (not ready)') : ''}`;
      return `<button id="${id}" data-dmatk="${mo.key}" class="primary" ${off ? 'disabled' : ''} title="${esc(ttl)}">${icon} ${esc(mo.name)}${mo.melee ? ' (melee)' : ` (Range ${mo.range})`}${what ? ` <small>${esc(what)}</small>` : ''}${mo.uses ? ` <small>${esc(modeUseText(m, mo))}</small>` : ''}</button>`; };
    act = `<div class="dm-act">${m.blinking ? `<div class="note">Blink: drag ${esc(m.tag)} to an empty space within ${npcAbil(m, 'blink').teleport} (purple hexes).</div><button id="dmBlinkCancel">Cancel Blink</button>`
      : canBlink(m) ? `<button id="dmBlink" class="primary" title="${esc(window.NPC_ABILITIES.Blink.note)}">✨ Blink (Teleport ${npcAbil(m, 'blink').teleport})</button>` : ''}
      ${legal.length || md.some(mo => mo.area === 'burst' && okM(mo)) ? `<select id="dmTarget" data-pre="${chosen ? '' : pre || ''}" title="Target (or click a hero token on the map)">${tg.map(x => `<option value="${x.h.id}" ${x.why ? 'disabled' : ''}${x.h.id === pre ? ' selected' : ''}>${esc(x.h.name)}${isDownHero(x.h) ? ' [Down]' : ''} (${x.why || dist(m, x.h) + ' sp' + (npcRanged(m) ? '' : dist(m, x.h) === 1 ? ', adjacent' : '')})</option>`).join('')}</select>
      ${md.map(btn).join('')}${cq}` : `<span class="muted small">${tg.length && tg.every(x => x.why === 'Hidden') ? 'Every hero is Hidden: no attack (OPEN).' : npcAnyRanged(m) ? `No hero within Range ${npcMaxRange(m)} — move first, or Dash.` : 'No hero adjacent — move first, or Dash.'}</span>`}
      ${npcAbil(m, 'multiattack') ? `<span class="muted small" id="dmLeft">Multiattack: ${left} of ${npcAbil(m, 'multiattack')} attacks left</span>` : ''}
      <button id="dmDash" ${m.dashed || m.attacksMade || effSpeed(m) === 0 ? 'disabled' : ''} title="Dash: move up to ${C.npc.dash.multiplier} × Speed (${effSpeed(m) * C.npc.dash.multiplier}) this turn instead of attacking (user rule)">🏃 Dash</button>
      ${fogCloudReady(m) ? `<button id="dmFog" title="${esc(window.NPC_ABILITIES['Fog Cloud'].note)}">🌫 Fog Cloud</button>` : ''}
      <button id="dmEnd">End turn</button>
      <div class="muted small">Drag ${esc(m.tag)}: ${moveBudget(m)} space${moveBudget(m) === 1 ? '' : 's'} left (green hexes)${npcHas(m, 'flies') ? ', Flies over creatures' : ''}. ${npcRanged(m) ? `${esc(m.atkName)}: Range ${m.range} (red hexes).` : m.alt ? `Melee = adjacent; ${esc(m.alt.name)}: ${m.alt.melee ? 'adjacent' : 'Range ' + modeRange(m.alt)} (red hexes).` : 'Melee = adjacent.'}${m.la ? ` Legendary Action ${esc(m.la.name)}: offered at the end of each hero's turn.` : ''}</div></div>`;
  }
  if (mode === 'pop') return act || '<p class="muted">Nothing to do right now.</p>';
  return `<div class="mon ${cur ? 'active' : ''} ${m.life <= 0 ? 'down' : ''}" data-unit="${m.id}">
    ${m.card && CARD[m.card] ? `<img class="cardimg npcthumb" src="${CARD[m.card].img}" data-ncat="${m.id}" title="${esc(CARD[m.card].name)}: click for all NPC stat blocks, large">` : ''}
    <div class="mon-head"><span class="mtag" style="--tc:${m.color || '#8b1d1d'}">${esc(m.tag)}</span><b title="${esc(m.kindLabel || '')}">${esc(m.name)}</b><span class="muted small">${m.ep} EP${m.initRoll != null ? ' · Init ' + m.initRoll : ''}</span>${lifeBtns(m)}</div>
    ${lifeBar(m)}${statChips(m)}<div class="badges" data-ncat="${m.id}" title="Click for the full stat block and abilities">${statusBadges(m, viewer)}</div>${fxList(m)}${act}
  </div>`;
}
function actionDock() {
  const u = current();
  if (G.over) return `<div class="dock-msg"><h2>${G.over === 'win' ? '🏆 Victory!' : '💀 Defeat'}</h2><p>Battle ended in round ${G.round}.</p>
    <button id="rematch" class="primary">${G.enc?.custom ? 'Rematch (same encounter)' : 'Rematch (new monsters)'}</button> <button id="toDmSetup">DM setup</button> <button id="toLobby">Back to the waiting room</button></div>`;
  if (G.phase === 'setup') return `<div class="dock-msg"><h3>Set up the battle</h3><p>Drag hero and monster tokens where you want them (they snap to the hexes). Anyone can move any token now.</p>
    <p class="muted small">${G.enc?.custom ? `DM's encounter: ${G.enc.ep}/${G.enc.budget} EP${G.enc.ep > G.enc.budget ? ' <span class="warn" style="display:inline">(over budget, harder fight)</span>' : ''}.` : `Random encounter: ${G.enc.ep}/${G.enc.budget} EP.`}</p>
    <button id="startBattle" class="primary big">⚔ Start Battle (roll initiative)</button> <button id="toDmSetup">← DM setup</button></div>`;
  if (!u) return '';
  if (u.side === 'npc') return `<div class="dock-msg"><h3>${esc(u.name)}'s turn</h3><p>${G.dmMode === 'auto' ? 'Auto DM is moving and attacking…' : 'Human DM: click a green hex (or drag the token) to move the NPC; click a hero token to pick its target; then use the DM area on the right to attack, Dash, Blink and End turn. Undo works for every step.'}</p></div>`;
  const h = u;
  if (h.control === 'npc') return `<div class="dock-msg"><h3>🤖 ${esc(h.name)} (NPC hero) is taking its turn…</h3><p class="muted">The computer moves, plays power-ups and attacks for this hero. Switch it to 🎮 in its panel to take over from its next turn.</p></div>`;
  if (!G.atk && h.attacks.length) G.atk = newAttack(h);
  const A = G.atk; const t = A && byId(A.target);
  let atkHtml = '';
  if (!A) atkHtml = h.dashed ? `<p class="dashnote">🏃‍♂️ <b>Dashing:</b> you gave up your attack to move up to ${C.dash.multiplier} × Speed. No attack, spell or attack power-up this turn; other power-ups are fine. Drag your token, then end your turn.</p>`
    : `<p class="muted">${h.attackedThisTurn ? 'No attacks left this turn.' : 'No attack available.'} Move or play power-ups, then end your turn.</p>`;
  else if (A.d6 == null && !isArmed(h, A)) atkHtml = `<p class="selhint" id="selHint">⚔ Select a weapon (Equipment) or a Spell in your tray, then press <b>Attack</b>.${UI.sel[h.id] ? ` Selected: <b>${esc(selName(UI.sel[h.id]))}</b>.` : ''}</p>`;
  else if (A.d6 == null) {
    A.kind = attackKind(A.tok, A.weapon); pickBestTarget(h, A);
    const parts = attackParts(h, A); const tt = A.target && byId(A.target);
    const why = tt ? targetCheck(h, A, tt) : 'No target.';
    atkHtml = `<div class="atk-tag">${esc(A.tok.label)}${A.tok.kind === 'special' ? ` <span class="muted small">(${h.attacks.filter(x => x.group === A.tok.group).length} left)</span>` : ''}${ACT_ON() && h.level > 1 ? ` <span class="atkleft" id="atkLeft" title="Actions this turn (Level ${h.level} ${h.type})">· this turn you can still make: ${esc(actText(h))}</span>` : ''} · ${A.kind} · range ${attackRange(h, A)}</div>
      <div class="aim"><div><label>Target</label><select id="atkTarget">${liveMonsters().map(mm => { const w = targetCheck(h, A, mm); return `<option value="${mm.id}" ${mm.id === A.target ? 'selected' : ''} ${w && enforce() ? 'disabled' : ''}>${esc(mm.name)} — Tough ${effTough(mm)}, ${dist(h, mm)} sp${offGuard(mm, h) ? ', Off Guard' : ''}${w ? ' ✗' : ''}</option>`; }).join('')}</select></div>
      <div><label>Weapon</label><select id="atkWeapon">${weaponChoices(h, A.tok).map(o => `<option value="${o.v}" ${o.v === A.weapon ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
      <button id="rollAtk" class="primary big" ${why && enforce() ? 'disabled' : ''}>🎲 Roll 1d6 + ${parts.reduce((s, p) => s + p[1], 0)}</button></div>
      <div class="muted small">${parts.map(p => `${esc(p[0])} ${p[1] >= 0 ? '+' : ''}${p[1]}`).join(' · ')} — need ${tt ? effTough(tt) : '?'}+${tt ? `; Critical on ${critMin(h, A, tt)}+` : ''}.${isHidden(h) ? ' <b>You are Hidden.</b>' : ''}
      ${why ? `<span class="warn">⚠ ${esc(why)}${enforce() ? ' Move closer (green hexes) or pick another target.' : ' (Free move is on: rules not enforced.)'}</span>` : ''}</div>`;
  } else {
    atkHtml = `<div class="result ${A.hit ? 'hit' : 'miss'}"><span class="die">${A.face}</span>${A.critical ? '<small>(as 6)</small>' : ''} + ${A.atkTotal} = <b>${A.face + A.atkTotal}</b> vs Toughness ${A.tough} → <b>${A.hit ? (A.crit ? 'CRITICAL HIT' : 'HIT') : 'MISS'}</b>${A.deadeye ? ' <span class="badge">Deadeye</span>' : ''}${A.offGuard ? ' <span class="st og">Off Guard</span>' : ''}${A.hiddenAtRoll ? ' <span class="st hidden">from Hidden</span>' : ''}</div>
      ${A.hit ? `<div class="dmg">Damage: ${A.dmgParts.map(p => `${esc(p[0])} ${p[1]}`).join(' + ')}${A.adjust ? ` ${A.adjust > 0 ? '+' : '−'} ${Math.abs(A.adjust)} (manual)` : ''} = <b>${A.dmg}</b>
        <span class="lifeadj"><button id="dmgMinus" title="Manual damage adjust">−</button><button id="dmgPlus" title="Manual damage adjust">+</button></span>${A.onHitOps.length ? ` <span class="badge">${esc([...new Set(A.onHitOps.map(o => o[0].name))].join(', '))}</span>` : ''}</div>
        <button id="applyDmg" class="primary big">Apply ${A.dmg} Damage to ${esc(t.name)}</button>` : `<button id="missOk" class="big">OK (miss)</button>`}
      ${smiteBtns(h, A)}${activations(h, 'afterRoll').filter(() => !A.locked).map(id => `<button data-act="${id}">${esc(FX[id].activate.label)}</button>`).join('')}
      <div class="muted small">You can still play a power-up that triggers now (cards with a gold edge).</div>`;
  }
  let acts = activations(h, 'turn').map(id => `<button data-act="${id}" ${A && A.d6 != null ? 'disabled' : ''}>${esc(FX[id].activate.label)} (${esc(CARD[id].name)})</button>`).join('');
  if (h.style === 'Paladin' && h.lohLeft > 0) acts += `<button id="loh" ${(A && A.d6 != null) ? 'disabled' : ''} title="Free: you or an adjacent hero heals 2">🙏 Lay on Hands (${h.lohLeft})</button>`;
  if (h.fx.some(f => f.bear)) acts += '<button id="endBear" title="Free: end Bear form">End Bear form</button>';
  const smites = A && A.d6 != null ? smiteOptions(h, A) : [];
  const spellBar = h.spells.length && (AUTOARM() || !CMD.on) ? `<div class="spellbar"><span class="lbl">✨ Spells${h.extraCasts ? ` (+${h.extraCasts} extra cast)` : ''}:</span>${h.spells.map(id => { const why = canCast(h, id); const sp = FX[id]?.spell;
      const passive = ['reaction', 'smite', 'strike'].includes(sp?.kind);
      return `<button class="small spellbtn ${h.spellDown.has(id) ? 'down' : ''} ${passive ? 'passive' : ''}" data-cast="${id}" ${why ? 'disabled' : ''} title="${esc(CARD[id].text)}${why ? ' — ' + esc(why) : ''}">${h.spellDown.has(id) ? '⤓ ' : ''}${esc(CARD[id].name)}</button>`; }).join('')}
</div>` : '';
  const mvWhy = moveBlockReason(h);
  const moveInfo = `<div class="moveinfo ${mvWhy ? 'blocked' : ''}" id="moveInfo">${mvWhy ? `🚫 <b>Can't move:</b> ${esc(mvWhy)}` : `🏃 <b>Move:</b> ${moveBudget(h)} space${moveBudget(h) === 1 ? '' : 's'} left — drag your token (green hexes).`}</div>`;
  const dWhy = dashBlock(h);
  const dashBtn = C.dash?.enabled && !h.dashed ? `<button id="dash" ${dWhy ? `disabled title="${esc(dWhy)}"` : `title="Give up your attack this turn to move up to ${C.dash.multiplier} × Speed (${effSpeed(h) * C.dash.multiplier}). After a Dash: no attack, spell or attack power-up."`}>🏃‍♂️ Double move (Dash)</button>` : '';
  return `<div class="dock-hero">
    <div class="dock-left"><h3>${esc(h.name)}'s turn <span class="muted small">(${esc(h.owner)}) · Move ${moveBudget(h)} left · Attacks ${h.attacks.length} · Plays ${h.playsUsed}/${h.picks.play}${liveComps().filter(c => c.ownerId === h.id).map(c => ` · ${c.icon} ${c.moveLeft} move`).join('')}</span></h3>
      <div class="btnrow toprow">${moveInfo}${CMD.on ? '' : dashBtn}${acts}${CMD.on ? '' : `<button id="endTurn" ${A && A.d6 != null ? 'disabled title="Finish the current attack first"' : ''}>End turn ➜</button>`}</div>
      ${dashBtn && dWhy && !h.attackedThisTurn && !h.castThisTurn ? `<div class="muted small" id="dashWhy">Dash unavailable: ${esc(dWhy)}</div>` : ''}${atkHtml}${spellBar}</div>
    ${CMD.on ? '' : `<div class="dock-hand"><div class="lbl">Power-up hand (${h.hand.length}/${h.picks.slots}) · Deck ${h.deck.length} · Discard ${h.discard.length} <button id="browseCards" class="small" ${h.hand.length + h.spells.length ? '' : 'disabled'} title="Scroll through your power-ups and spells as larger cards; click one for a full-size close-up">🔍 Browse cards</button></div>
      <div class="hand">${h.hand.map(id => `<img class="cardimg hand-card ${playOptions(h, id).some(o => !o.disabled) ? 'playable' : ''}" src="${CARD[id].img}" data-hand="${h.id}|${id}" data-card="${id}" title="${esc(CARD[id].name)}: ${esc(CARD[id].text)}">`).join('') || '<span class="muted">No power-ups in hand.</span>'}</div></div>`}
  </div>`;
}
// =====================================================================
// v1.11 GAME SCREEN: map top-left, Game Log + Initiative on the right, a card tray at the bottom
// =====================================================================
const LEGACYUI = () => { try { return ['1', '2'].includes(localStorage.getItem('adventuresInc.legacyPool')); } catch (_) { return false; } };   // test-only: '2' = the v1.11.1 step creator on the v0.3 pools, '1' = also the pre-v0.3 Style decks
const LEGACYPOOL = () => { try { return localStorage.getItem('adventuresInc.legacyPool') === '1'; } catch (_) { return false; } };   // test-only (older regression tests): creator picks from the pre-v0.3 Style decks
const AUTOARM = () => { try { return localStorage.getItem('adventuresInc.autoArm') === '1'; } catch (_) { return false; } };   // test-only: skip "select a card, then Attack"
const CMD = { on: false };
UI.sel = {}; UI.armed = {}; UI.dmPop = null; UI.fullLog = false;
const turnKey = () => `${G.round}:${G.turn}`;
const layOf = h => h.type === 'Caster' ? 'caster' : h.type === 'Hybrid' ? 'hybrid' : 'fighter';
const selName = s => s.id === 'basic' ? 'Basic Attack' : CARD[s.id]?.name || s.id;
function isArmed(h, A) { return AUTOARM() || !CMD.on || UI.armed[h.id] === turnKey() || (A && A.tok && (A.tok.kind === 'special' || A.tok.kind === 'extra')) || h.control === 'npc'; }
const ownTurn = h => !!h && current() === h && h.control !== 'npc' && G.phase === 'battle' && !G.over;
const selectableSpell = (h, id) => !['reaction', 'smite', 'strike'].includes(FX[id]?.spell?.kind);
function attackState(h) {
  const s = UI.sel[h.id], label = s ? (s.kind === 'spell' ? `✨ Cast ${CARD[s.id].name}` : `⚔ Attack · ${selName(s)}`) : '⚔ Attack';
  if (!ownTurn(h)) return { off: true, label, why: 'Not your turn.' };
  if (G.atk && G.atk.d6 != null) return { off: true, label, why: 'Finish the current attack first.' };
  if (!s) return { off: true, label, why: 'Select a weapon (Equipment) or a Spell in your tray first.' };
  if (s.kind === 'spell') { const why = canCast(h, s.id); return { off: !!why, label, why }; }
  if (h.dashed) return { off: true, label, why: 'Dashing: no attack this turn.' };
  if (!h.attacks.length) return { off: true, label, why: 'No attacks left this turn.' };
  if (UI.armed[h.id] === turnKey()) return { off: true, label, why: 'Attack ready: pick the target and roll (turn panel on the right).' };
  return { off: false, label };
}
async function pressAttack(h) {
  const st = attackState(h), s = UI.sel[h.id]; if (st.off || !s) { if (st.why) toast(st.why); return; }
  if (s.kind === 'spell') { pushUndo(`cast ${CARD[s.id].name}`); delete UI.sel[h.id]; await castSpell(h, s.id); if (G) { UI.armed[h.id] = turnKey(); renderTable(); } return; }
  pushUndo(`attack with ${selName(s)}`);
  if (!G.atk) G.atk = newAttack(h); const A = G.atk;
  if (A) { const opts = weaponChoices(h, A.tok).filter(o => !o.disabled);
    const want = s.id === 'basic' ? opts.find(o => o.v === '') : opts.find(o => o.v === s.id || String(o.v).split('|')[0] === s.id);
    if (want) { A.weapon = want.v; A.kind = attackKind(A.tok, A.weapon); } else if (s.id !== 'basic') toast(`${selName(s)} can't be used for this attack; using ${opts[0]?.label || 'the default'}.`); }
  UI.armed[h.id] = turnKey(); renderTable();
}
// v1.13 (notes 2, 6, 7): the selected weapon or spell drives the range highlight. Selecting a weapon card also switches the
// pending attack to that weapon (and the Weapon dropdown follows); selecting a spell shows that spell's range.
function syncSel(h) {
  const s = UI.sel[h.id], A = G.atk;
  if (!s || s.kind !== 'weapon' || !A || A.d6 != null || current() !== h) return;
  const opts = weaponChoices(h, A.tok).filter(o => !o.disabled);
  const want = s.id === 'basic' ? opts.find(o => o.v === '') : opts.find(o => o.v === s.id || String(o.v).split('|')[0] === s.id);
  if (want) { A.weapon = want.v; A.kind = attackKind(A.tok, A.weapon); A.target = null; }
}
function spellRangeOf(h, id) {   // hexes a spell reaches (0 = self / no map range); null = it rides on a weapon attack
  const sp = FX[id]?.spell; if (!sp) return null;
  if (sp.melee) return 1;
  if (sp.range != null) return sp.range ? capRange(spellRng(h, sp.range)) : 0;
  const m = /Range (\d+)/.exec(CARD[id]?.text || '');   // hand-resolved spells: the Range printed on the card
  return m ? capRange(spellRng(h, +m[1])) : null;
}
function highlightRange(u) {
  const s = UI.sel[u.id];
  if (s && s.kind === 'spell') { const r = spellRangeOf(u, s.id); if (r != null) return { n: r, spell: true }; }
  return G.atk ? { n: attackRange(u, G.atk), spell: false } : null;
}
// v1.11.1 (note 5): cards in a group always overlap slightly like the mockup (replaces "spread when few"); bigger groups overlap more
function fanStyle(n) { const ov = n <= 1 ? '0px' : `calc(var(--cw) * -${n <= 4 ? 0.55 : n <= 6 ? 0.64 : n <= 8 ? 0.72 : 0.78})`; return `--n:${n};--ov:${ov}`; }
function trayCard(id, cls = '', attrs = '') { const c = CARD[id]; return c ? `<img class="cardimg fcard ty-${tyOf(id)} ${cls}" src="${c.img}" alt="${esc(c.name)}" title="${esc(c.name)}: ${esc(c.text || '')}" ${attrs}>` : ''; }
// which of a hero's cards can be activated right now (popup greys the rest; a pile with none is greyed in the tray)
// v1.11.1 (note 6): Equipment & Abilities are never greyed (callers only grey Spells and Power-ups). Reaction power-ups stay solid while you
// still have a play left (the site offers them when their trigger happens). Spells show usable on your turn unless spent / face down / blocked;
// Smites & Strikes count as usable (they play after a hit).
function spellReady(h, id) {
  const sp = FX[id]?.spell; if (!sp || h.spellSpent.has(id) || h.spellDown.has(id)) return false;
  if (sp.kind === 'reaction') return true;
  if (!ownTurn(h) || h.dashed || h.fx.some(f => f.bear)) return false;
  if (sp.kind === 'smite' || sp.kind === 'strike') { const A = G.atk; return A && A.d6 != null ? smiteOptions(h, A).includes(id) : h.attacks.length > 0; }
  return !canCast(h, id);
}
function activeCards(h) {
  const own = ownTurn(h), out = new Set();
  if (G.phase === 'battle' && !G.over && canPlay(h)) h.hand.forEach(id => { if (isReactPU(id)) out.add(id); });
  h.spells.forEach(id => { if (spellReady(h, id)) out.add(id); });
  if (!own) return out;
  const acts = activations(h, 'turn'); acts.forEach(id => out.add(id));
  if (h.attacks.length && !h.dashed && !(G.atk && G.atk.d6 != null)) { weaponsOf(h).filter(id => usableW(h, id)).forEach(id => out.add(id)); out.add(h.classCard); }
  h.hand.forEach(id => { if (playOptions(h, id).some(o => !o.disabled)) out.add(id); });
  return out;
}
function cmdPanel(h, over) {
  const st = attackState(h), own = ownTurn(h), A = G.atk, dWhy = dashBlock(h);
  const ch = store.characters.find(c => c.id === h.charId);
  return `<div class="cmd parchment ${over ? 'cmd-over' : ''}" id="cmdPanel" data-h="${h.id}">
    <input id="heroName" class="hname" maxlength="50" value="${esc(h.name)}" title="Your character's name (click to edit, up to 50 characters)">
    <button id="notesBtn" class="small notesbtn" title="Open your notes">📝 Notes${ch?.notes ? ' •' : ''}</button>
    <div class="cmd-btns"><button id="attackBtn" class="primary ${st.off ? '' : 'ready'}" ${st.off ? 'disabled' : ''} title="${esc(st.why || 'Roll with the selected card')}">${esc(st.label)}</button>
    ${C.dash?.enabled && !h.dashed ? `<button id="dash" ${!own || dWhy ? `disabled title="${esc(dWhy || 'Not your turn.')}"` : `title="Give up your attack this turn to move up to ${C.dash.multiplier} × Speed (${effSpeed(h) * C.dash.multiplier}). After a Dash: no attack, spell or attack power-up."`}>🏃‍♂️ Dash</button>` : h.dashed ? '<span class="muted small">🏃‍♂️ Dashing</span>' : ''}
    <button id="endTurn" ${!own || (A && A.d6 != null) ? `disabled title="${!own ? 'Not your turn.' : 'Finish the current attack first'}"` : ''}>End turn ➜</button></div>
    ${st.off && st.why && own ? `<div class="cmd-why small">${esc(st.why)}</div>` : ''}</div>`;
}
const tyOf = id => ({ Equipment: 'equip', Ability: 'abil', Spell: 'spell', 'Power-up': 'pu', Class: 'cls' })[CARD[id]?.type] || 'other';
function pileHtml(h, cat, label, ids, act, selOk) {
  const sel = UI.sel[h.id], grey = cat === 'spells', dim = grey && !ids.some(id => act.has(id));   // v1.11.1: only Spells (and Power-ups) grey
  return `<div class="pgroup ${dim ? 'dim' : ''}" data-tcat="${cat}" data-h="${h.id}" title="Click to see the ${esc(label)} cards large">
    <div class="plbl">${esc(label)} <span>${ids.length}</span></div>
    <div class="fan" style="${fanStyle(ids.length)}">${ids.map(id => {
      const isSel = sel && sel.id === id, can = selOk(id), down = cat === 'spells' && h.spellDown.has(id);
      return trayCard(id, `${isSel ? 'raised' : ''} ${act.has(id) ? 'act' : grey ? 'off' : ''} ${down ? 'facedown' : ''} ${can ? 'selectable' : ''}`, `data-tcard="${id}" ${can ? `data-sel="${cat === 'spells' ? 'spell' : 'weapon'}|${id}"` : ''}`); }).join('') || '<span class="muted small empty">none</span>'}</div></div>`;
}
function heroTray(h) {
  const act = activeCards(h), own = ownTurn(h), lay = layOf(h);
  const wOk = id => own && !!FX[id]?.weapon && usableW(h, id);
  const sOk = id => own && selectableSpell(h, id) && !h.spellSpent.has(id) && !h.spellDown.has(id);
  const cls = h.classCard, basicOK = !noBasic(h);   // v1.13 note 8: a Caster's Character Card has no attack
  const csel = UI.sel[h.id] && UI.sel[h.id].id === 'basic';
  const hand = h.hand.map(id => `<img class="cardimg fcard hand-card ty-pu ${act.has(id) ? 'playable act' : 'off'}" data-timing="${puTiming(id)}" src="${CARD[id].img}" data-hand="${h.id}|${id}" data-card="${id}" title="${esc(CARD[id].name)}: ${esc(CARD[id].text)}">`).join('');
  return `<div class="tray-in hero lay-${lay}" data-h="${h.id}">
    ${lay === 'fighter' ? cmdPanel(h, false) : ''}
    <div class="pgroup charcard" data-tcat="equip" data-h="${h.id}"><div class="plbl">${esc(h.style)} · L${h.level} <span>❤ ${h.life}/${h.maxLife}</span></div>
      <div class="fan">${trayCard(cls, `${csel ? 'raised' : ''} ${own && h.attacks.length && basicOK ? 'selectable' : ''}`, `data-tcard="${cls}" ${own && basicOK ? 'data-sel="weapon|basic"' : ''}`)}</div></div>
    ${pileHtml(h, 'equip', 'Equipment', h.cards.equipment, act, wOk)}
    ${pileHtml(h, 'abil', 'Abilities', h.cards.abilities, act, () => false)}
    <div class="pgroup pu ${h.hand.some(id => act.has(id)) ? '' : 'dim'}" data-tcat="hand" data-h="${h.id}"><div class="plbl">Power-ups <span>${h.hand.length}/${h.picks.slots}</span> <button id="browseCards" class="small" ${h.hand.length + h.spells.length ? '' : 'disabled'} title="Browse your power-ups and spells as large cards">🔍</button></div>
      <div class="pu-row"><div class="pdeck" data-tcat="deck" data-h="${h.id}" title="Draw deck: ${h.deck.length} cards face down (click: see them A–Z, order hidden)"><span>${h.deck.length}</span></div>
      <div class="fan" style="${fanStyle(h.hand.length)}">${hand || '<span class="muted small empty">no power-ups drawn</span>'}</div>
      <span class="pdisc small" data-tcat="discard" data-h="${h.id}" title="Discard pile">Discard ${h.discard.length}</span></div></div>
    ${h.spells.length ? pileHtml(h, 'spells', 'Spells', h.spells, act, sOk) : ''}
  </div>`;
}
function dmTray() {
  const cu = current(), human = G.dmMode === 'human';
  return `<div class="tray-in dmtray"><div class="plbl dmlbl">🐉 DM · NPCs <span>${liveMonsters().length} standing · ${human ? 'Human DM: click the glowing NPC to act' : 'Auto DM'}</span></div>
    <div class="npcfan" style="${G.monsters.filter(m => !m.dead).length <= 7 ? '--ov:8px' : fanStyle(G.monsters.filter(m => !m.dead).length - 4)}">${G.monsters.filter(m => !m.dead).map(m => `<div class="npccard ${cu === m ? 'now' : ''} ${m.life <= 0 ? 'down' : ''}" data-npc="${m.id}" title="${esc(m.name)} · ${cu === m && human ? 'click to Attack / cast / use an ability' : 'click for its stat block'}">
      ${m.card && CARD[m.card] ? `<img class="cardimg fcard" src="${CARD[m.card].img}" alt="">` : `<div class="fcard nocard">${esc(m.name)}</div>`}
      <div class="nc-cap"><span class="mbadge">${m.num ?? ''}</span>${esc(m.name)} <b>❤ ${m.life}/${m.maxLife}</b></div></div>`).join('')}</div></div>`;
}
function dmPopHtml() {
  const m = byId(UI.dmPop); if (!m || current() !== m || G.dmMode !== 'human' || G.phase !== 'battle' || G.over) { UI.dmPop = null; return ''; }
  return `<div class="dmpop parchment" id="dmPop"><div class="dmpop-head">${m.card && CARD[m.card] ? `<img class="cardimg" src="${CARD[m.card].img}" alt="">` : ''}<div><h3>${esc(m.name)}'s turn</h3><div class="muted small">❤ ${m.life}/${m.maxLife} · move ${moveBudget(m)} left — drag the token or click a green hex</div></div><button id="dmPopClose" class="small">✕</button></div>${monsterRow(m, 'pop')}</div>`;
}
// shrink the tray cards a little when everything doesn't fit across the screen (piles keep their spread rule)
function fitTray() {
  const tr = $('.table-grid.v111>.tray'); if (!tr) return; tr.style.removeProperty('--ch'); tr.style.removeProperty('--cw');
  for (let i = 0; i < 8; i++) { const over = (tr.scrollWidth + 14) / Math.max(1, tr.clientWidth); if (tr.scrollWidth <= tr.clientWidth + 1) break;
    const c = tr.querySelector('.fcard, .pdeck'); if (!c) break; const h = c.getBoundingClientRect().height, nh = Math.max(96, h / over - 3);
    if (nh >= h - 0.5) break; tr.style.setProperty('--ch', nh + 'px'); tr.style.setProperty('--cw', nh * 0.714 + 'px'); }
}
window.addEventListener('resize', () => { if (G && document.body.classList.contains('table')) fitTray(); });
function openNotes(h) {
  const ch = store.characters.find(c => c.id === h.charId);
  const m = modal(`<h3>📝 ${esc(h.name)} — notes</h3><textarea id="notesTxt" rows="12" placeholder="Anything you want to remember…">${esc(ch?.notes || h.notes || '')}</textarea><div class="btnrow"><button id="notesClose" class="primary">Save & close</button></div>`, 'notes');
  const ta = $('#notesTxt', m); ta.focus();
  const done = () => { const v = ta.value; h.notes = v; if (ch) { ch.notes = v; save(); } m.remove(); renderTable(); };
  $('#notesClose', m).onclick = done; m.onclick = e => { if (e.target === m) done(); };
}
function logHtml() {
  const L = UI.fullLog ? G.log : G.log.filter(l => l.b || l.k === 'roll' || l.cls === 'round');
  return L.slice(0, 300).map(l => UI.fullLog ? `<div class="${l.cls} ${l.k === 'roll' ? 'roll' : ''}">${esc(l.msg)}</div>`
    : l.cls === 'round' ? `<div class="round">${esc(l.msg)}</div>` : `<div class="${l.k === 'roll' ? 'roll' : 'brief ' + (l.k || '')}">${esc(l.k === 'roll' ? l.msg : briefText(l))}</div>`).join('');
}
function pickBar() {
  if (PICK.react) { const R = PICK.react, h = byId(R.id);
    return `<div class="pickbar react" id="reactBar">✨ <b>${esc(R.label)}</b>: drag ${esc(h?.name || '')} to a highlighted space (up to ${R.n}${R.teleport ? ', Teleport' : ''}) or click one. <button id="reactAuto" class="small">Pick for me</button></div>`; }
  if (PICK.area) { const A = PICK.area, h = byId(A.h), cr = A.at ? areaCreatures(h, areaCellsAt(h, A.shape, A.at), A.shape) : null;
    const how = A.shape.kind === 'self' ? `every ${A.shape.enemiesOnly ? 'enemy' : 'creature'} within ${A.shape.radius} of ${esc(h.name)}` : A.shape.kind === 'chain'
      ? `click an enemy within Range ${A.shape.range} (yellow), then up to ${A.shape.jumps} more, each within ${A.shape.within} of the last (${(A.chain || []).length}/${1 + A.shape.jumps} chosen; click a chosen enemy to undo back to it)` : A.shape.kind === 'line' ? `click a space to aim the ${A.shape.len}-space line` : `click a space within Range ${A.shape.range} (yellow) to place the area (radius ${A.shape.radius})`;
    return `<div class="pickbar area" id="areaBar">🔥 <b>${esc(CARD[A.id].name)}</b>: ${how}. ${cr ? `In the area: <b id="areaWho">${cr.all.length ? cr.all.map(u => esc(u.name) + (u.side === 'pc' ? ' (ally!)' : '')).join(', ') : 'nobody'}</b>. ` : ''}Saves: 1d6 + Resilience vs DC ${(C.areaSpells.dcBase ?? 3) + (h.stats.skill || 0)}.
      <button id="areaOk" class="small primary" ${A.at ? '' : 'disabled'}>Confirm</button>${A.shape.kind === 'self' ? '' : ' <button id="areaAuto" class="small">Place for me</button>'} <button id="areaCancel" class="small">Cancel</button></div>`; }
  return '';
}
// v1.11: maps with a finer grid than the one printed on the art draw their own grid lines (one cached path)
let FINE = { k: null, d: '' };
function fineGridPath() {
  if (GK === 1) return '';
  const key = GR.hexRadius + ':' + GMAX.c;
  if (FINE.k !== key) FINE = { k: key, d: allHexes().map(h => 'M' + hexPoly(h.c, h.r).replace(/ /g, 'L') + 'Z').join('') };
  return `<path class="finegrid" d="${FINE.d}"/>`;
}
function overlaySvg() {
  const u = current(); const polys = [fineGridPath()];
  if (G.phase === 'battle' && !G.over && u && enforce()) {
    const hvw = heroViewOf();
    const mover = u.side === 'pc' ? (hvw && hvw !== u ? null : u) : G.dmMode === 'human' && !hvw ? u : null;
    if (mover && moveBudget(mover) > 0 && !G.busy) for (const [k, cost] of reachable(mover, moveBudget(mover))) { if (!cost) continue; const [c, r] = k.split(',').map(Number); polys.push(`<polygon class="mv" points="${hexPoly(c, r)}"><title>${cost}</title></polygon>`); }
    if (u.side === 'pc' && !G.atk && u.attacks.length) G.atk = newAttack(u);
    if (u.side === 'pc' && !(G.atk && G.atk.d6 != null) && !(hvw && hvw !== u)) {
      const HR = highlightRange(u), rng = HR ? HR.n : 0; G.hlRange = HR ? { n: rng, spell: HR.spell, by: u.id } : null;
      for (let r = 0; r <= GMAX.r; r++) for (let c = 0; c <= GMAX.c; c++) { if (!inMap(c, r)) continue; const d = hexDist(u, { c, r }); if (d >= 1 && d <= rng) polys.push(`<polygon class="rg${HR.spell ? ' sp' : ''}${d === rng ? ' edge' : ''}" points="${hexPoly(c, r)}"/>`); }
    }
    if (u.side === 'npc' && G.dmMode === 'human' && !G.busy && !hvw) {
      if (u.blinking) blinkHexes(u).forEach(p => polys.push(`<polygon class="blink" points="${hexPoly(p.c, p.r)}"/>`));
      else if (npcAnyRanged(u) && !u.attacked && !u.dashed) for (let r = 0; r <= GMAX.r; r++) for (let c = 0; c <= GMAX.c; c++) { if (!inMap(c, r)) continue; const d = hexDist(u, { c, r }); if (d >= 1 && d <= npcMaxRange(u)) polys.push(`<polygon class="rg${d === npcMaxRange(u) ? ' edge' : ''}" points="${hexPoly(c, r)}"/>`); }
    }
  }
  for (const [k, t] of G.terrain || []) { const [c, r] = k.split(',').map(Number); polys.push(`<polygon class="terr ${t.type}" points="${hexPoly(c, r)}"><title>${t.type} (${esc(byId(t.owner)?.name || '')})</title></polygon>`); }
  Object.entries(G.snares || {}).forEach(([hid, p]) => polys.push(`<polygon class="snare" points="${hexPoly(p.c, p.r)}"><title>Snare (${esc(byId(hid)?.name || '')})</title></polygon>`));
  if (G.phase === 'battle' && !G.over && u && u.side === 'pc' && u.control !== 'npc' && !G.busy) liveComps().filter(c => c.ownerId === u.id && c.moveLeft > 0).forEach(c => { for (const [k, cost] of reachable(c, c.moveLeft)) { if (!cost) continue; const [cc, r] = k.split(',').map(Number); polys.push(`<polygon class="mv comp" points="${hexPoly(cc, r)}"/>`); } });
  heroesThrown().forEach(({ h, w, pos }) => polys.push(`<polygon class="thrown" points="${hexPoly(pos.c, pos.r)}"><title>${esc(CARD[w].name)} (${esc(h.name)})</title></polygon>`));
  if (PICK.react) PICK.react.cells.forEach(p => polys.push(`<polygon class="react" points="${hexPoly(p.c, p.r)}"><title>${p.cost} sp</title></polygon>`));
  if (PICK.area) { const A = PICK.area, h = byId(A.h);
    if (A.shape.kind !== 'self') (A.shape.kind === 'chain' ? chainNext(h, A.shape, A.chain || []) : A.centres).forEach(p => polys.push(`<polygon class="area-c" points="${hexPoly(p.c, p.r)}"/>`));
    if (A.at && h) areaCellsAt(h, A.shape, A.at).forEach(p => polys.push(`<polygon class="area" points="${hexPoly(p.c, p.r)}"/>`)); }
  return `<svg class="overlay" viewBox="0 0 ${GR.imgW} ${GR.imgH}" preserveAspectRatio="none">${polys.join('')}</svg>`;
}
const heroesThrown = () => G.heroes.flatMap(h => Object.keys(h.thrown).flatMap(w => thrownAt(h, w).map(pos => ({ h, w, pos }))));
function tokensHtml() {
  const W0 = HW / GR.imgW * 100, hv = heroViewOf();
  return units().filter(u => !u.dead && !(u.comp && u.life <= 0 && compOwner(u)?.dead)).map(u => { const p = hexPx(u.c, u.r);
    const W = W0 * (u.side !== 'npc' ? 1 : u.size === 'Giant' ? 2.9 : u.size === 'Large' ? 1.25 : 1), sz = u.side === 'npc' ? 'sz-' + (u.size || 'Medium').toLowerCase() : '';
    return `<div class="token ${u.side} ${sz} ${u.comp ? 'comp' : ''} ${u.life <= 0 ? 'down' : ''} ${isDownHero(u) ? 'dying' : ''} ${u.flashLA > Date.now() - 1500 ? 'la-flash' : ''} ${current() === u ? 'active' : ''} ${HURT[u.id] > Date.now() ? 'hurt' : ''} ${G.atk && G.atk.target === u.id ? 'targeted' : ''} ${isHidden(u) ? 'is-hidden' : ''} ${canDrag(u) ? 'draggable' : ''}" data-tok="${u.id}" style="left:${p.x / GR.imgW * 100}%;top:${p.y / GR.imgH * 100}%;width:${W}%${u.color ? ';--tc:' + u.color : ''}"
     title="${esc(u.name)}${u.kindLabel && !u.name.startsWith(u.kindLabel) ? ' (' + esc(u.kindLabel) + ')' : ''} ${u.life}/${u.maxLife}${u.card && CARD[u.card] && !hv ? ' — ' + esc(CARD[u.card].text) : ''}">${u.comp ? `<span class="mlabel comp">${u.icon}</span>` : u.side === 'pc' ? `<span class="portrait" style="background-image:url(img/cards/${u.classCard}.jpg)"></span>` : `${u.card ? `<span class="portrait npcp" style="background-image:url(${IMGV('img/tokens/npc/' + u.card + '.png')})"></span><span class="mbadge" title="${esc(u.name)}">${u.num ?? ''}</span>` : `<span class="mlabel">${esc(u.tag)}</span>`}${u.card && CARD[u.card] && !hv ? `<span class="tcard ${p.x > GR.imgW * 0.6 ? 'left' : ''} ${p.y > GR.imgH * 0.5 ? 'up' : ''}"><img src="${CARD[u.card].img}" alt=""></span>` : ''}`}<i class="tlife">${u.life}</i>${u.poison > 0 ? '<i class="tpois" title="Poisoned">☠</i>' : ''}${u.fx.some(f => f.speedZero) ? `<i class="tpin" title="${u.fx.some(f => f.pinned) ? 'Pinned: can\'t move' : 'Speed 0'}">⚓</i>` : ''}</div>`; }).join('');
}
function renderTable() {
  if (!G) return;
  auditLife();
  const v = viewer(), hv = v.kind === 'hero' ? byId(v.id) : null;
  document.body.className = 'table ' + (hv ? 'view-hero' : 'view-dm');
  const order = trackerHtml(v);
  // v1.11 tray owner: the hero whose view this is; in the DM view a Run-by-me hero's own turn shows that hero's tray, otherwise the DM tray
  const cu0 = G.phase === 'battle' && !G.over ? current() : null;
  const trayH = hv || (cu0 && cu0.side === 'pc' && !cu0.comp && cu0.control !== 'npc' ? cu0 : null);
  const lay = trayH ? layOf(trayH) : 'dm';
  CMD.on = !!(trayH && cu0 === trayH);
  if (UI.dmPop && (!cu0 || cu0.id !== UI.dmPop)) UI.dmPop = null;
  const dmPopOk = !hv && !!UI.dmPop;
  const cmdOver = trayH && lay !== 'fighter' ? cmdPanel(trayH, true) : '';
  const cu = G.phase === 'battle' && !G.over ? current() : null;
  const whose = !cu ? '' : cu.side === 'npc' ? `<span class="whose dm" id="whose">🐉 ${esc(cu.name)} · ${G.dmMode === 'auto' ? 'Auto DM' : 'Human DM'}</span>`
    : cu.control === 'npc' ? `<span class="whose npc" id="whose">🤖 ${esc(cu.name)} (NPC hero) is acting</span>` : `<span class="whose me" id="whose">🎮 ${esc(cu.name)}'s turn — your move</span>`;
  app.innerHTML = `<header class="topbar"><b>Adventures Inc</b><span class="round">${G.phase === 'battle' ? 'Round ' + G.round : 'Setup'}</span>${whose}${viewSelHtml(v)}<span class="tb-gap"></span>
    <button id="undo" class="small" ${!UNDO.stack.length || G.busy || G.aiTurn || G.phase !== 'battle' ? 'disabled' : ''} title="Undo the last action (Ctrl+Z / Cmd+Z). ${UNDO.stack.length ? 'Last: ' + esc(UNDO.stack[UNDO.stack.length - 1].label) : 'Nothing to undo yet'}">↶ Undo${UNDO.stack.length ? ` (${UNDO.stack.length})` : ''}</button>
    <button id="settingsBtn" class="small" title="Table settings: action speed, narrator, voice, volume">⚙ Settings</button>
    <button id="freeMove" class="small ${G.freeMove ? 'on-warn' : ''}" title="Override: drag any token anywhere and ignore range limits">${G.freeMove ? '🔓 Free move ON' : '🔒 Rules: move & range'}</button>
    <div class="toggle small" id="dmToggle"><button data-dm="auto" class="${G.dmMode === 'auto' ? 'on' : ''}">Auto DM</button><button data-dm="human" class="${G.dmMode === 'human' ? 'on' : ''}">Human DM</button></div>
    <button id="leave">Leave table</button></header>
    <div class="table-grid v111 lay-${lay} ${hv ? 'heroview' : 'herolist'}" data-view="${hv ? 'hero:' + hv.id : 'dm'}">
      <aside class="side">${pickBar()}
      <section class="log parchment"><h3>Game Log <button id="logFull" class="small" title="Show every rules line, or just the short version">${UI.fullLog ? 'Short log' : 'Full log'}</button></h3><div class="loglines">${logHtml()}</div></section>
      <div class="trk"><div class="tk-lbl">⏳ Initiative</div>${order}</div>
      <section class="dock parchment">${hv && current() && current() !== hv && G.phase === 'battle' && !G.over ? publicDock(hv) : actionDock()}</section>
      <div class="details">
      ${hv ? `<aside class="heroes solo" id="heroList"><div class="hl-head muted small">👁 Hero view: ${esc(hv.name)}</div>${heroPanel(hv, 'solo')}${enemyList(hv)}</aside>`
      : `<aside class="heroes" id="heroList"><div class="hl-head muted small">Heroes (${G.heroes.length}) · click one to expand</div>${G.heroes.map(h => heroPanel(h)).join('')}</aside>`}

      ${hv ? '' : `<aside class="dm parchment"><h3>DM area <span class="muted small">${G.dmMode === 'auto' ? 'Auto DM' : 'Human DM'}</span></h3>${G.monsters.some(m => m.la && m.life > 0) ? `<div class="la-pool small" id="laPool" title="Legendary Actions: used at the end of a hero's turn. Shared pool ${laPoolSize()} per round (1 with 1-2 heroes, 2 with 3+), max ${C.legendary.maxDamagingPerRound} damaging per round. Legendary N NPCs have their own pool.">⚡ Legendary pool: <b>${G.laPool ?? laPoolSize()}</b>/${laPoolSize()}${G.laDamaging ? ' · damaging used' : ''}</div>` : ''}<div class="mons">${G.monsters.map(m => monsterRow(m, UI.dmPop === m.id && dmPopOk ? 'noact' : '')).join('')}</div></aside>`}
      </div></aside>
      <main class="center"><div class="map ${GK > 1 ? 'fine' : ''}" id="map" data-grid="${GMAX.c}x${GMAX.r}" style="background-image:url(${G.map.img})">${overlaySvg()}${tokensHtml()}</div>${cmdOver}</main>
      <footer class="tray parchment">${trayH ? heroTray(trayH) : dmTray()}</footer>
    </div>${dmPopOk ? dmPopHtml() : ''}`;
  G.flash = null;
  wire();
  const am = $('.dm .mon.active'); if (am) am.scrollIntoView({ block: 'nearest' });
  { const sd = $('.table-grid.v111>.side'); if (sd) sd.scrollTop = 0; }
  fitTray();
  $$('.heroes .hero-panel.active').forEach(p => { if (p.offsetParent) p.scrollIntoView({ block: 'nearest' }); });
}
function wire() {
  wireZoom(app);
  { const rb = $('#reactAuto'); if (rb) rb.onclick = () => endPick('react', PICK.react?.auto);
    const ok = $('#areaOk'); if (ok) ok.onclick = () => { if (PICK.area?.at) endPick('area', PICK.area.at); };
    const cc = $('#areaCancel'); if (cc) cc.onclick = () => endPick('area', null);
    const aa = $('#areaAuto'); if (aa) aa.onclick = () => { const P = PICK.area; if (!P) return; const a = autoArea(byId(P.h), P.id); if (a) { P.at = a.at; if (a.at.ids) P.chain = [...a.at.ids]; renderTable(); } else toast(`${CARD[P.id].name}: no good place (no enemy, or more allies than enemies). Pick a space or Cancel.`); };
    const mp = $('#map');
    if (mp && !(PICK.react || PICK.area)) mp.addEventListener('click', ev => clickMove(ev, mp));   // v1.10: click a green hex to move (heroes and Human-DM NPCs)
    if (mp && (PICK.react || PICK.area)) mp.addEventListener('click', ev => {
      const m2 = $('#map') || mp, r = m2.getBoundingClientRect(); if (!r.width) return; const hx = pxToHex((ev.clientX - r.left) / r.width * GR.imgW, (ev.clientY - r.top) / r.height * GR.imgH);
      if (PICK.react) { const p = PICK.react.cells.find(x => x.c === hx.c && x.r === hx.r); if (p) endPick('react', p); else toast(`${PICK.react.label}: pick a highlighted space.`); return; }
      if (PICK.area && PICK.area.shape.kind === 'chain') { const P = PICK.area, h = byId(P.h), ch = P.chain = P.chain || [];   // v1.10.2 Chain Lightning II: click the links one by one
        const m = liveMonsters().find(u => footprint(u).some(q => q.c === hx.c && q.r === hx.r));   // v1.11: any of a Giant's 7 hexes
        if (m && ch.includes(m.id)) ch.splice(ch.indexOf(m.id));
        else if (m && chainNext(h, P.shape, ch).includes(m)) ch.push(m.id);
        else { toast(`${CARD[P.id].name}: ${ch.length >= 1 + P.shape.jumps ? 'the chain is full (Confirm, or click a chosen enemy to undo)' : ch.length ? `pick an enemy within ${P.shape.within} of ${byId(ch[ch.length - 1]).name}` : `pick an enemy within Range ${P.shape.range}`}.`); return; }
        P.at = ch.length ? { ids: [...ch] } : null; renderTable(); return; }
      if (PICK.area && PICK.area.shape.kind !== 'self') { if (PICK.area.centres.some(x => x.c === hx.c && x.r === hx.r)) { PICK.area.at = { c: hx.c, r: hx.r }; renderTable(); } else toast(`${CARD[PICK.area.id].name}: out of range.`); }
    }); }
  const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
  const U = (label, fn) => (...a) => { pushUndo(typeof label === 'function' ? label(...a) : label); return fn(...a); };   // snapshot, then act
  on('#undo', () => doUndo());
  // v1.11 tray + command panel
  on('#attackBtn', () => pressAttack(current()));
  on('#logFull', () => { UI.fullLog = !UI.fullLog; renderTable(); });
  on('#notesBtn', () => { const h = byId($('#cmdPanel')?.dataset.h); if (h) openNotes(h); });
  { const hn = $('#heroName'); if (hn) hn.onchange = () => { const h = byId($('#cmdPanel').dataset.h); const v = hn.value.trim().slice(0, 50); if (!h || !v) { renderTable(); return; }
      const ch = store.characters.find(c => c.id === h.charId); log(`${h.name} is now called ${v}.`, 'sys'); h.name = v; if (ch) { ch.name = v; save(); } renderTable(); }; }
  $$('[data-sel]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); const h = byId(el.closest('[data-h]').dataset.h); if (!h || !ownTurn(h)) return;
    const [kind, id] = el.dataset.sel.split('|'); const s = UI.sel[h.id];
    if (s && s.id === id) delete UI.sel[h.id]; else UI.sel[h.id] = { kind, id };
    syncSel(h); renderTable(); }));
  $$('[data-tcat]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('[data-sel], [data-hand], button')) return; e.stopPropagation();
    const inner = e.target.closest('[data-tcat]'); if (inner !== el) return;
    const card = e.target.closest('[data-tcard]'); openHeroCategory(el.dataset.h, el.dataset.tcat, card ? card.dataset.tcard : null); }));
  $$('[data-npc]').forEach(el => el.onclick = () => { const m = byId(el.dataset.npc); if (!m) return;
    if (m === current() && G.dmMode === 'human' && G.phase === 'battle' && !G.over && !heroViewOf()) { UI.dmPop = UI.dmPop === m.id ? null : m.id; renderTable(); }
    else openNpcCategory(m.id); });
  on('#dmPopClose', () => { UI.dmPop = null; renderTable(); });
  on('#settingsBtn', () => openSettings());
  on('#dash', U('Dash', () => { doDash(current()); renderTable(); }));
  on('#browseCards', () => openCardBrowser(current()));
  { const vs = $('#viewSel'); if (vs) vs.onchange = e => setView(e.target.value); }
  $$('[data-cat]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); e.preventDefault();
    const card = e.target.closest('[data-zoom], [data-card], [data-hand]'); const sid = card ? (card.dataset.zoom || card.dataset.card || (card.dataset.hand || '').split('|')[1]) : null;
    openHeroCategory(el.dataset.h, el.dataset.cat, sid); }, true));
  $$('[data-ncat]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openNpcCategory(el.dataset.ncat); }, true));
  $$('.token.pc').forEach(t => t.addEventListener('click', () => { if (t.dataset.dragged || PICK.react || PICK.area || Date.now() - LAST_DRAG < 350) return;
    const m = current(); if (!m || m.side !== 'npc' || G.dmMode !== 'human' || heroViewOf() || G.busy) return;
    const h = byId(t.dataset.tok); if (!h || monsterCanAttack(m, h)) { toast(`${m.name} can't target ${h ? h.name : 'that'}: ${h ? monsterCanAttack(m, h) : ''}`); return; }
    UI.dmTarget = { m: m.id, h: h.id }; renderTable(); }));
  { const dt = $('#dmTarget'); if (dt) dt.onchange = e => { UI.dmTarget = { m: current()?.id, h: e.target.value }; }; }
  $$('.hero-panel .hp-head').forEach(el => el.addEventListener('click', e => { if (e.target.closest('button, [data-zoom]')) return;
    const id = el.closest('.hero-panel').dataset.unit; if (current()?.id === id) return; UI.open.has(id) ? UI.open.delete(id) : UI.open.add(id); renderTable(); }));
  on('#leave', async () => { if (G.phase === 'setup' || G.over || await ask('Leave the table?', 'This battle will be lost.', [{ label: 'Leave', value: true, cls: 'danger' }, { label: 'Stay', value: false }])) { G = null; showLobby(); } });
  on('#freeMove', () => { G.freeMove = !G.freeMove; log(G.freeMove ? 'Free move ON: any token can be dragged anywhere and range is not enforced.' : 'Free move OFF: movement and range rules enforced.', 'sys'); renderTable(); });
  $$('#dmToggle [data-dm]').forEach(b => b.onclick = async () => {
    G.dmMode = store.dmMode = b.dataset.dm; save(); log(`DM mode: ${G.dmMode === 'auto' ? 'Auto DM' : 'Human DM'}.`, 'sys'); renderTable();
    const u = current(); if (G.dmMode === 'auto' && u && u.side === 'npc' && !G.busy && G.phase === 'battle' && !G.over) await autoMonsterTurn(u);
  });
  $$('[data-life]').forEach(b => b.onclick = e => { e.stopPropagation(); const u = byId(b.dataset.life); const d = +b.dataset.d; pushUndo(`manual Life change on ${u.name}`);
    if (d < 0) { damage(u, 1, { byHero: false }); log(`Manual: ${u.name} −1 Life (${u.life}/${u.maxLife}).`, 'muted'); }
    else gainLife(u, 1, 'Manual + button (a person at the table)'); if (!checkEnd()) renderTable(); });
  $$('[data-hand]').forEach(el => el.onclick = e => { e.stopPropagation(); const [hid, id] = el.dataset.hand.split('|'); const h = byId(hid); zoomCard(id, playOptions(h, id)); });
  $$('[data-act]').forEach(b => b.onclick = U(() => `use ${CARD[b.dataset.act].name}`, () => useActivation(current(), b.dataset.act)));
  on('#startBattle', () => startBattle());
  on('#rematch', () => startTable());
  on('#toLobby', () => { G = null; showLobby(); });
  on('#toDmSetup', () => { G = null; showDmSetup(); });
  const at = $('#atkTarget'); if (at) at.onchange = e => { G.atk.target = e.target.value; renderTable(); };
  const aw = $('#atkWeapon'); if (aw) aw.onchange = e => { G.atk.weapon = e.target.value; G.atk.kind = attackKind(G.atk.tok, G.atk.weapon); const hh = current(); if (hh && hh.side === 'pc') { const v = G.atk.weapon; UI.sel[hh.id] = { kind: 'weapon', id: !v ? 'basic' : v.split('|')[0] }; } renderTable(); };
  on('#rollAtk', U('attack roll', rollHeroAttack));
  on('#applyDmg', U('apply Damage', () => finishAttack(true)));
  on('#missOk', U('miss', () => finishAttack(false)));
  on('#dmgMinus', U('Damage adjust', () => { G.atk.adjust--; evalAttack(); renderTable(); }));
  on('#dmgPlus', U('Damage adjust', () => { G.atk.adjust++; evalAttack(); renderTable(); }));
  on('#endTurn', U(() => `end ${current()?.name}'s turn`, () => endTurn()));
  $$('[data-cast]').forEach(b => b.onclick = U(() => `cast ${CARD[b.dataset.cast].name}`, async () => { const h = current(); await castSpell(h, b.dataset.cast); }));
  $('#smiteRow')?.scrollIntoView({ block: 'nearest' });   // v1.11.1: keep the post-hit Smite / Strike buttons in view in the turn panel
  $$('[data-smite]').forEach(b => b.onclick = U(() => `cast ${CARD[b.dataset.smite].name}`, async () => { await castSmite(current(), b.dataset.smite); }));
  on('#loh', U('Lay on Hands', () => layOnHands(current())));
  on('#endBear', U('end Bear form', () => { const h = current(); h.fx = h.fx.filter(f => !f.bear); log(`${h.name} ends Bear form.`, 'play'); renderTable(); }));
  const dmAtk = key => async () => { const m = current(); let h = byId($('#dmTarget')?.value); const mo = npcModeFor(m, h, key);
    if (mo.area === 'burst' || mo.area === 'engaged') { if (!areaTargets(m, mo).length) { UNDO.stack.pop(); renderTable(); toast(`${mo.name}: no hero in its area.`); return; } }
    else if (!h) { UNDO.stack.pop(); renderTable(); toast('Pick a target first.'); return; }
    if (h && mo.area !== 'burst' && mo.area !== 'engaged' && enforce() && !modeOK(mo, dist(m, h)) && $('#dmTarget')?.value === $('#dmTarget')?.dataset.pre) {   // the DM kept the suggested target: use the nearest one this attack can reach
      const legal = legalMonsterTargets(m).filter(x => modeOK(mo, dist(m, x)) && !monsterCanAttack(m, x)).sort((a, b) => (isDownHero(a) - isDownHero(b)) || dist(m, a) - dist(m, b));
      if (legal[0]) h = legal[0];
    }
    if (mo.area === 'burst' || mo.area === 'engaged') {}
    else if (enforce() && !modeOK(mo, dist(m, h))) { UNDO.stack.pop(); renderTable(); toast(`${mo.name}: ${mo.ranged ? `Range ${mo.range}` : 'melee needs an adjacent target'} — ${h.name} is ${dist(m, h)} sp away.`); return; }
    await monsterAttack(m, h, key); checkEnd(); };
  $$('[data-dmatk]').forEach(b => b.onclick = U(() => `${current()?.name} ${npcModeFor(current(), null, b.dataset.dmatk)?.name || 'attack'}`, dmAtk(b.dataset.dmatk)));
  on('#dmDash', U(() => `${current()?.name} Dash`, () => { const m = current(); if (m.dashed || m.attacksMade) return; npcDash(m, 'Human DM'); renderTable(); }));
  on('#dmFog', U(() => `${current()?.name} Fog Cloud`, () => { const m = current(); if (fogCloudReady(m)) { useFogCloud(m); renderTable(); } }));
  on('#dmEnd', U(() => `end ${current()?.name}'s turn`, () => endTurn()));
  $$('[data-hctl]').forEach(b => b.onclick = async e => { e.stopPropagation(); const h = byId(b.dataset.hctl);
    h.control = h.control === 'npc' ? 'user' : 'npc'; const ch = store.characters.find(c => c.id === h.charId); if (ch) { ch.control = h.control; save(); }
    log(`${h.name} is now ${h.control === 'npc' ? 'an NPC hero (computer-run)' : 'run by you'}.`, 'sys'); renderTable();
    if (h.control === 'npc' && current() === h && G.phase === 'battle' && !G.over && !G.busy && !G.aiTurn && !(G.atk && G.atk.d6 != null)) await autoHeroTurn(h); });
  on('#dmBlink', () => { pushUndo('Blink'); const m = current(); if (canBlink(m)) { m.blinking = true; renderTable(); } });
  on('#dmBlinkCancel', () => { current().blinking = false; renderTable(); });
  $$('.token.npc').forEach(t => t.addEventListener('click', () => { if (t.dataset.dragged || PICK.react || PICK.area) return;   // v1.9: during a hex pick the map handles the click
    const u = byId(t.dataset.tok), hc = current();
    if (hc && hc.side === 'pc' && G.atk && G.atk.d6 == null && !t.classList.contains('down') && G.atk.target !== u.id) { G.atk.target = u.id; renderTable(); return; }
    if (u.card && CARD[u.card] && !heroViewOf()) openNpcCategory(u.id); }));
  wireDrag();
}
// v1.10: click-to-move. Clicking a highlighted (green) hex moves the unit whose turn it is, with undo, exactly like dragging it there.
let LAST_DRAG = 0;
function clickMove(ev, mp) {
  if (!G || G.phase !== 'battle' || G.over || G.busy || PICK.react || PICK.area || Date.now() - LAST_DRAG < 350) return;
  if (ev.target.closest('.token')) return;
  const u = current(); if (!u || !canDrag(u)) return;
  const hv = heroViewOf(); if (hv && hv !== u) return;
  if (u.side === 'npc' && hv) return;
  const m2 = $('#map') || mp, r = m2.getBoundingClientRect(); if (!r.width) return;
  const hx = pxToHex((ev.clientX - r.left) / r.width * GR.imgW, (ev.clientY - r.top) / r.height * GR.imgH);
  if (hx.c === u.c && hx.r === u.r) return;
  const ok = u.blinking ? blinkHexes(u).some(p => p.c === hx.c && p.r === hx.r) : !!reachable(u, moveBudget(u)).get(hk(hx));
  if (!ok) { toast(`${u.name}: pick a highlighted space${u.blinking ? ' (purple)' : ' (green)'}.`); return; }
  const pushed = pushUndo(`move ${u.name}`, true);
  const err = tryMove(u, hx); if (err) { toast(err); if (pushed) UNDO.stack.pop(); }
  renderTable();
}
function wireDrag() {
  const map = $('#map');
  $$('.token', map).forEach(tok => {
    tok.onpointerdown = e => {
      const u = byId(tok.dataset.tok);
      if (!canDrag(u)) {   // say why (your own token, or the monster in Human DM)
        const cu = current(), ownTurn = cu && (cu === u || (u.comp && compOwner(u) === cu)) && (u.side === 'pc' ? cu.control !== 'npc' : G.dmMode === 'human');
        if (G.phase === 'battle' && !G.over && (ownTurn || (u.side === 'pc' && !u.comp && u.control !== 'npc'))) { const why = moveBlockReason(u) || (G.busy ? 'Wait — something is still resolving.' : null); if (why) toast(`${u.name} can't move: ${why}`); }
        return;
      }
      e.preventDefault();
      const r = map.getBoundingClientRect(); let movedPx = 0;
      tok.setPointerCapture(e.pointerId); tok.classList.add('dragging');
      const toHex = ev => pxToHex((ev.clientX - r.left) / r.width * GR.imgW, (ev.clientY - r.top) / r.height * GR.imgH);
      const mv = ev => { movedPx += Math.abs(ev.movementX) + Math.abs(ev.movementY);
        tok.style.left = (ev.clientX - r.left) / r.width * 100 + '%'; tok.style.top = (ev.clientY - r.top) / r.height * 100 + '%';
        const hx = toHex(ev); tok.setAttribute('data-moved', `${hexDist(u, hx)} sp`); };
      const up = ev => { tok.removeEventListener('pointermove', mv); tok.removeEventListener('pointerup', up); tok.classList.remove('dragging');
        if (movedPx > 4) { tok.dataset.dragged = '1'; LAST_DRAG = Date.now();
          const own = G.phase === 'battle' && (u.side === 'pc' ? (u.comp ? compOwner(u) : u).control !== 'npc' : G.dmMode === 'human');
          const pushed = own && pushUndo(`move ${u.name}`, true);
          const err = tryMove(u, toHex(ev)); if (err) { toast(err); if (pushed) UNDO.stack.pop(); } renderTable(); } };
      tok.addEventListener('pointermove', mv); tok.addEventListener('pointerup', up);
    };
  });
}

// test hook (used by the automated browser test only)
window.__AI = { setGrid: m => setGrid(m), puTiming, migrateV112: () => migrateV112(), V112_MIGRATED: () => V112_MIGRATED, buildFromChar: ch => buildFromChar(ch), lobbyBg: () => lobbyBg(), activeCards: h => [...activeCards(h)], migrateV03, V03_MIGRATED: () => V03_MIGRATED, levelBase, t: { occupied, fits, footprint, reachable, areaCreatures, inMap, logLine: (m, c) => log(m, c), gridInfo: () => ({ rad: GR.hexRadius, cols: GMAX.c, rows: GMAX.r, k: GK }), attackState, isArmed, askAs, ask, withView, clickMove, laHumanChoice, playOptions, dashBlocksCard, castSpell, canCast, asHero, smiteOptions, castSmite, layOnHands, attackParts, attackRange, targetCheck, newAttack, critMin, effSpeed, effTough, legalMonsterTargets, hide, poison, offGuard, isHidden, engaged, weaponChoices, KW, E, monsterCanAttack, canBlink, blinkTo, blinkHexes, monsterAttack, npcTurnStart, rangedSpot, pickTarget, npcRanged,
    npcAttackOptions, parseNpcAbility, areaTargets, modeReady, legendaryWindow, laPlan, laAvailable, laPoolSize, doLegendary, tacticPlan, npcDash, autoMove, attackableNow, canReachToAttack,
    damage: (t, n, o) => damage(t, n, o), gainLife: (u, n, src) => gainLife(u, n, src), heal: (u, n, src) => heal(u, n, src), healBy: (s0, t, n, w) => healBy(s0, t, n, w), isDownHero, downHit, heroDies, checkEnd: () => checkEnd(),
    nextTurn: () => nextTurn(), refillPU: h => refillPU(h), highlightRange: u => highlightRange(u), spellRangeOf: (h, id) => spellRangeOf(h, id), endTurn: () => endTurn(), heroTurnStart: u => heroTurnStart(u), npcMenace: u => npcMenace(u), useFogCloud, checkBloodied, evalAttack: () => evalAttack(), placeStart, autoHeroTurn: h => autoHeroTurn(h), syncLife: () => syncLife(), auditLife: () => auditLife(), makeMonster, walkStepMs: () => walkStepMs(), actText: h => actText(h), levelBase, atkSummary, actLeft: (h, e) => actLeft(h, e), wLeft: (h, e) => wLeft(h, e), spellSlotOK: (h, l) => spellSlotOK(h, l), syncNormals: h => syncNormals(h), useOneAction: h => useOneAction(h), reactMove: (h, n, t, l) => reactMove(h, n, t, l), reactCells, endPick, PICK, isAreaSave, areaShape, areaCellsAt, areaCreatures, chainNext: (h, sh, ids) => chainNext(h, sh, ids), autoChain: (h, sh) => autoChain(h, sh), isOnce, spellRng: (h, r) => spellRng(h, r), autoArea: (h, id) => autoArea(h, id), resolveAreaSave: (h, id, a) => resolveAreaSave(h, id, a), castSpell: (h, id, o) => castSpell(h, id, o), canCast: (h, id) => canCast(h, id), aiPickSpell: h => aiPickSpell(h), monsterMoved: (m, p) => monsterMoved(m, p), playWalk: m => playWalk(m), WALK },
  get G() { return G; }, UNDO, UI, VIEW, viewer: () => viewer(), setView: v => setView(v), isMine: (v, u) => isMine(v, u), openGallery, openHeroCategory: (h, c, s) => openHeroCategory(h, c, s), openNpcCategory: s => openNpcCategory(s), capRange, applyRangeRule, npcScaleAtk: m => npcScaleAtk(m), partyLevelG: () => partyLevelG(), ANIM, HURT, autoMonsterTurn: m => autoMonsterTurn(m), narrate: (k, d) => narrate(k, d), applySettings, openSettings, paceMs, npcModes: m => npcModes(m), npcModeFor: (m, h, k) => npcModeFor(m, h, k), monsterAttack: (m, h, k) => monsterAttack(m, h, k), moveBlockReason: u => moveBlockReason(u), dashBlock: h => dashBlock(h), FX, CARD, store, MON, creatureToken, current: () => G && current(), hexPx, hexDist, reachable: (u, n) => reachable(u, n), tryMove: (u, h) => tryMove(u, h), byId, renderTable: () => renderTable(), syncLife: () => syncLife() };

applyRangeRule();
applySettings();
const V03_MIGRATED = migrateV03();
const V112_MIGRATED = migrateV112();   // v1.12: every saved character gets a level-by-level build (cards unchanged)
if (store.current && store.players.includes(store.current)) showLobby(); else showStart();
if (V03_MIGRATED.length) setTimeout(() => toast(`Updated ${V03_MIGRATED.length} saved character${V03_MIGRATED.length > 1 ? 's' : ''} to the v0.3 decks (cut cards swapped; see Edit).`), 300);
})();
