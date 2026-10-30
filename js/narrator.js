// Adventures Inc v1.8: the Narrator. A cool old storyteller who reads out every attack result, condition, Down and the end of the fight.
// Moods: 'excited' (hero success or monster failure), 'grim' (monster success or hero failure: serious, disappointed).
// Speech: Web Speech API (speechSynthesis). Every line is ALSO shown as an on-screen caption. Lines are queued, never overlap.
(function () {
  const N = window.NARR = { history: [], queue: [], busy: false, cfg: { on: true, voice: '', volume: 0.9 } };
  // ---- line templates: several phrasings per case, picked at random (never the same twice in a row) ----
  N.T = {
    pcHit: [   // excited
      'Hit! {a} strikes {t} for {d} damage!', 'Yes! {a} lands it, {d} damage to {t}!', 'A fine blow! {t} reels as {a} deals {d} damage!',
      'Ha! {a} finds the gap, and {t} takes {d}!', 'Splendid! {a} cuts into {t} for {d} damage!'],
    pcHitCrit: ['A critical hit! {a} smashes {t} for {d} damage!', 'Magnificent! A critical strike from {a}, {d} damage to {t}!'],
    pcHitNoDmg: ['{a} hits {t}... but it does no damage.', 'A hit from {a}, yet {t} shrugs it off.'],
    pcMiss: [  // grim
      "Miss. {a}'s {w} goes wide.", '{a} swings... and misses {t}. A pity.', 'No. {a} fails to find {t}.',
      "Alas. {t} slips away from {a}'s {w}.", '{a} misses. {t} is unharmed.'],
    npcHit: [  // grim
      'Hit. {a} strikes {t} for {d} damage.', '{t} takes {d} damage from {a}. A grim moment.', 'Alas. {a} wounds {t} for {d}.',
      'The blow lands. {t} suffers {d} damage at the hands of {a}.', '{a} finds its mark. {d} damage to {t}.'],
    npcHitCrit: ['A critical hit. {a} tears into {t} for {d} damage.', 'Dreadful. {a} lands a critical blow, {d} damage to {t}.'],
    npcHitNoDmg: ['{a} hits {t}, but no damage gets through. Well held!', '{t} takes the blow from {a}, and feels nothing!'],
    npcMiss: [ // excited
      "Miss! {a}'s {w} goes wide!", 'Ha! {a} misses {t} completely!', '{t} dodges, and {a} hits nothing but air!',
      'Missed! {a} cannot touch {t}!', 'Not today! {a} fails to strike {t}!'],
    condPc: [  // grim
      '{t} is {c}.', 'Alas, {t} is {c}.', 'Ill fortune. {t} is {c}.'],
    condNpc: [ // excited
      '{t} is {c}!', 'Ha! {t} is {c}!', 'Good! Now {t} is {c}!'],
    downPc: ['{t} falls... and is down. Heal them, quickly!', '{t} is down, but still breathing. Someone, help them!', 'No... {t} collapses. Three rounds, no more, to save them.'],
    // v1.8 dying (heroes only)
    dyingPc: ['{t} is fading... rounds left to save them: {n}.', 'Hurry! {t} lies still. Rounds left: {n}.', "{t}'s breath grows faint. Rounds remaining: {n}."],
    dyingHit: ['They strike {t} where they lie. A cruel blow.', 'A hit on the fallen {t}. Their time grows short.'],
    deadPc: ['{t} is dead. The party will mourn them.', 'And so {t} falls, never to rise. A grievous loss.', '{t} has breathed their last. Darkness takes them.'],
    upPc: ['{t} rises again! Not done yet!', 'Saved! {t} is back on their feet!', 'Ha! {t} gets up, battered but alive!'],
    legendary: ['{a} acts out of turn! {w}!', 'Legendary might! {a} unleashes {w}.'],
    downNpc: ['{t} is down!', 'And {t} falls!', '{t} is defeated! Well fought!'],
    victory: ['Victory! The heroes stand triumphant!', 'Victory! Every foe has fallen. A tale worth telling!'],
    defeat: ['The party has fallen. Darkness takes the day.', 'Defeat. The heroes are lost... this time.'],
  };
  N.MOOD = { pcHit: 'excited', pcHitCrit: 'excited', pcHitNoDmg: 'grim', pcMiss: 'grim', npcHit: 'grim', npcHitCrit: 'grim', npcHitNoDmg: 'excited', npcMiss: 'excited',
    condPc: 'grim', condNpc: 'excited', downPc: 'grim', downNpc: 'excited', dyingPc: 'grim', dyingHit: 'grim', deadPc: 'grim', upPc: 'excited', legendary: 'grim', victory: 'excited', defeat: 'grim' };
  // speech settings per mood (deep and slow when grim, quicker and brighter when excited)
  N.VOICE = { excited: { rate: 1.05, pitch: 0.95, volume: 1.0 }, grim: { rate: 0.82, pitch: 0.7, volume: 0.85 } };
  const last = {};
  N.line = (key, vars) => {
    const pool = N.T[key] || [key]; let i = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && i === last[key]) i = (i + 1) % pool.length; last[key] = i;
    const out = pool[i].replace(/\{(\w)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  // ---- voices: deepest / most narrator-like male English voice ----
  // best first: real narrator voices (macOS Daniel, Chrome's UK male, Edge's George/Guy/Ryan), then the offline espeak-ng
  // variants that speech-dispatcher gives Chrome on Linux (deep "Mr_Serious", the old "grandpa", Edward), then any male English voice.
  const PREF = [/daniel/i, /google uk english male/i, /microsoft (george|guy|ryan|davis)/i, /\b(arthur|oliver|fred|gordon)\b/i,
    /english \(great britain\)\+mr_serious/i, /english \(great britain\)\+grandpa/i, /english \(great britain\)\+edward\b/i, /english \(great britain\)\+michael/i,
    /english \(great britain\) espeak/i, /english.*\+(mr_serious|grandpa|edward|michael)/i, /\bmale\b/i, /en[-_]gb/i, /en[-_]us/i, /^en/i];
  N.voices = () => { try { return (window.speechSynthesis?.getVoices() || []).filter(v => /^en([-_]|$)/i.test(v.lang)); } catch (e) { return []; } };
  N.score = v => { const s = `${v.name} ${v.lang} ${v.voiceURI}`; let i = PREF.findIndex(r => r.test(s)); if (i < 0) i = PREF.length;
    return i * 10 + (/robo|robot|whisper|croak|demonic|announcement|tweaky|fast_test|klatt/i.test(s) ? 300 : 0) + (/female|woman|grandma|zira|samantha|karen|moira|tessa|fiona|victoria|susan|hazel|libby|sonia|aria|jenny/i.test(s) ? 5 : 0) + (v.localService ? 0 : 1); };
  N.pick = () => { const vs = N.voices(); if (!vs.length) return null;
    return vs.find(v => v.name === N.cfg.voice) || vs.slice().sort((a, b) => N.score(a) - N.score(b))[0]; };
  N.voiceName = () => N.pick()?.name || (window.speechSynthesis ? 'no voice available (captions only)' : 'speech not supported (captions only)');
  try { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => N.onVoices && N.onVoices(); } catch (e) {}
  // ---- queue ----
  N.waitCap = () => (window.NARR_WAIT_CAP != null ? window.NARR_WAIT_CAP : 6000);   // max time one line may hold up the game
  N.say = (key, vars, extra = {}) => {
    const text = N.line(key, vars || {}), mood = N.MOOD[key] || extra.mood || 'grim';
    const item = { key, mood, text, at: Date.now() }; N.history.push(item); if (N.history.length > 80) N.history.shift();
    N.queue.push(item); pump(); return item;
  };
  async function pump() {
    if (N.busy) return; N.busy = true;
    while (N.queue.length) {
      const it = N.queue.shift(); N.current = it;
      N.caption && N.caption(it);
      try { await speak(it); } catch (e) { console.warn('narrator', e); }
    }
    N.current = null; N.busy = false; N.caption && N.caption(null);
    (N._idle || []).splice(0).forEach(r => r());
  }
  function speak(it) {
    const est = Math.min(N.waitCap(), 700 + it.text.length * 55);
    const ss = window.speechSynthesis;
    if (!N.cfg.on || !ss || typeof SpeechSynthesisUtterance === 'undefined') return new Promise(r => setTimeout(r, Math.min(est, N.captionOnlyMs ?? 1400)));
    return new Promise(res => {
      // the caption stays up at least a short reading time, even if the voice finishes instantly (e.g. no audio device)
      const t0 = Date.now(), minMs = Math.min(est, N.captionOnlyMs ?? 1400);
      let done = false; const fin = (now) => { if (done) return; done = true; clearTimeout(tm); N._fin = null; const left = now === true ? 0 : minMs - (Date.now() - t0); left > 0 ? setTimeout(res, left) : res(); };
      N._fin = () => fin(true);
      const u = new SpeechSynthesisUtterance(it.text), p = N.VOICE[it.mood] || N.VOICE.grim, v = N.pick();
      try { if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB'; } catch (e) { /* not a real SpeechSynthesisVoice */ }
      u.rate = p.rate; u.pitch = p.pitch; u.volume = Math.max(0, Math.min(1, p.volume * (N.cfg.volume ?? 1)));
      it.voice = v?.name || ''; it.rate = u.rate; it.pitch = u.pitch; it.volume = u.volume;
      u.onend = fin; u.onerror = fin;
      const tm = setTimeout(() => { try { ss.cancel(); } catch (e) {} fin(); }, Math.max(est * 2.2, 2500) > N.waitCap() ? N.waitCap() : Math.max(est * 2.2, 2500));
      try { ss.speak(u); } catch (e) { fin(); }
    });
  }
  // resolves when the queue is empty (or after maxMs)
  N.idle = (maxMs = N.waitCap()) => new Promise(r => { if (!N.busy && !N.queue.length) return r(); (N._idle = N._idle || []).push(r); setTimeout(r, maxMs); });
  N.stop = () => { N.queue.length = 0; try { window.speechSynthesis?.cancel(); } catch (e) {} if (N._fin) N._fin(); };
})();
