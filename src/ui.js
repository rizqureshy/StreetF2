// Swift Sword — DOM interface: menus, character/stage select, HUD, announcer
// and on-screen touch controls. Pure presentation; flow lives in main.js.
import { Touch } from './input.js';
import { MAX_HP, ROUNDS_TO_WIN, CHARACTERS, STAGES } from './config.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const SCREENS = ['loading', 'title', 'menu', 'select', 'stagesel', 'versus', 'hud', 'result', 'help'];

export class UI {
  constructor() {
    this.root = $('ui');
    this.active = null;          // current nav controller: { nav(action, player) }
    this.portraits = {};
    this.hudCache = {};
    if (Touch.enabled) document.body.classList.add('touch');
    this.bindTouch();
    this.root.addEventListener('click', e => {
      const b = e.target.closest('[data-act=back]');
      if (b && this.active) this.active.nav('back', 0);
    });
    $('press').textContent = Touch.enabled ? 'TAP TO BEGIN' : 'PRESS ANY KEY';
  }

  show(...names) { for (const s of SCREENS) $(s).classList.toggle('on', names.includes(s)); }
  add(name) { $(name).classList.add('on'); }
  remove(name) { $(name).classList.remove('on'); }
  hudVisible(on) { $('hud').classList.toggle('cine', !on); }
  letterbox(on) { $('bars').classList.toggle('on', on); }
  fighting(on) { document.body.classList.toggle('fighting', on); }
  loading(p, text) { $('loadfill').style.transform = `scaleX(${p})`; if (text) $('loadtext').textContent = text; }
  fatal(html) { const f = $('fatal'); f.innerHTML = html; f.classList.add('on'); }

  nav(action, player) { if (this.active) this.active.nav(action, player); }

  // ------------------------------------------------------------------ title
  openTitle(onStart) {
    this.show('title');
    const go = () => { $('title').removeEventListener('click', go); onStart(); };
    $('title').addEventListener('click', go);
    this.active = { nav: a => { if (a === 'confirm' || a === 'key' || a === 'pause') go(); } };
  }

  // ------------------------------------------------------------- list menus
  /**
   * items: [{ label, sub, value(): string, locked, pick(), left(), right() }]
   */
  openMenu({ title, kanji, items, hint, center, onBack, keep = [] , focus = 0, sfx }) {
    this.show('menu', ...keep);
    $('menu').classList.toggle('center', !!center);
    $('menutitle').innerHTML = (kanji ? `<span class="kanji">${kanji}</span>` : '') + title;
    $('menuhint').textContent = hint || (Touch.enabled ? 'Tap to choose' : 'W / S or ↑ / ↓ to move  ·  Enter to choose  ·  Esc to go back');
    const ul = $('menulist'); ul.innerHTML = '';
    const lis = items.map((it, i) => {
      const li = el('li', it.locked ? 'locked' : '', `<span><b>${it.label}</b>${it.sub ? `<small>${it.sub}</small>` : ''}</span>` + (it.value ? `<span class="val"></span>` : ''));
      li.addEventListener('pointerenter', () => setFocus(i, true));
      li.addEventListener('click', e => {
        setFocus(i, true);
        if (it.value && (it.left || it.right)) {
          const r = li.getBoundingClientRect();
          (e.clientX < r.left + r.width * 0.5 && it.left ? it.left : it.right || it.pick)();
          if (sfx) sfx('select');
        } else if (it.pick) { if (sfx) sfx('confirm'); it.pick(); }
        refresh();
      });
      ul.appendChild(li);
      return li;
    });
    let idx = focus;
    const refresh = () => items.forEach((it, i) => { if (it.value) lis[i].querySelector('.val').textContent = '‹ ' + it.value() + ' ›'; });
    const setFocus = (i, quiet) => {
      if (i !== idx && !quiet && sfx) sfx('select');
      idx = (i + items.length) % items.length;
      lis.forEach((li, k) => li.classList.toggle('focus', k === idx));
      lis[idx].scrollIntoView({ block: 'nearest' });
    };
    setFocus(idx, true); refresh();
    this.active = {
      nav: a => {
        const it = items[idx];
        if (a === 'up') setFocus(idx - 1);
        else if (a === 'down') setFocus(idx + 1);
        else if (a === 'left' && it.left) { it.left(); if (sfx) sfx('select'); refresh(); }
        else if (a === 'right' && it.right) { it.right(); if (sfx) sfx('select'); refresh(); }
        else if (a === 'confirm') { if (it.pick) { if (sfx) sfx('confirm'); it.pick(); } else if (it.right) { it.right(); if (sfx) sfx('select'); } refresh(); }
        else if ((a === 'back' || a === 'pause') && onBack) onBack();
      },
    };
  }

  // -------------------------------------------------------- character select
  /**
   * opts: { title, players: [{ label, human }], unlocked(char), start: [i,i], onMove(side, idx), onLock(side, idx), onDone(), onBack(), sfx }
   * Sides are chosen one after another unless both are human (then simultaneously).
   */
  openSelect(opts) {
    this.show('select');
    $('seltitle').textContent = opts.title;
    const roster = $('roster'); roster.innerHTML = '';
    const chars = CHARACTERS;
    const cur = opts.start.slice(), locked = [false, false];
    const both = opts.players[0].human && opts.players[1].human;
    let turn = 0;                                   // side currently choosing when sequential
    const activeSide = p => (both ? p : turn);
    const tiles = chars.map((c, i) => {
      const t = el('div', 'tile' + (opts.unlocked(c) ? '' : ' lock'),
        `<img src="${this.portraits[c.id] || ''}" alt=""><span class="kj kanji">${c.kanji}</span><span class="tagp t0">${opts.players[0].label}</span><span class="tagp t1">${opts.players[1].label}</span><span class="nm">${opts.unlocked(c) ? c.name : '???'}</span>`);
      t.addEventListener('click', () => {
        const side = both ? (locked[0] ? 1 : 0) : turn;
        if (locked[side]) return;
        if (cur[side] === i && opts.unlocked(c)) lock(side); else move(side, i);
      });
      roster.appendChild(t);
      return t;
    });
    const info = side => {
      const c = chars[cur[side]], p = opts.players[side], box = $('info' + side);
      const shown = side === 0 || both || turn === 1 || opts.players[1].preview;
      box.style.opacity = shown ? 1 : 0;
      box.style.setProperty('--c', c.color);
      box.classList.toggle('locked', locked[side]);
      const ok = opts.unlocked(c);
      const stat = (n, v) => `<div class="stat"><span>${n}</span>${[1, 2, 3, 4, 5].map(k => `<i class="${k <= v ? 'f' : ''}"></i>`).join('')}</div>`;
      box.innerHTML = ok ? `<div class="who">${p.label}</div><h3>${c.name}</h3><div class="ttl">${c.title}</div><p class="bio">${c.bio}</p>
        ${stat('POWER', c.stats.power)}${stat('SPEED', c.stats.speed)}${stat('REACH', c.stats.reach)}
        <div class="moves"><b>${c.moves.wave}</b> · <b>${c.moves.dashSlash}</b> · <b>${c.moves.risingSlash}</b><br>SPIRIT ART — <b>${c.moves[c.superMove]}</b></div>
        <span class="ready">READY</span>`
        : `<div class="who">${p.label}</div><h3>???</h3><div class="ttl">Sealed</div><p class="bio">Clear the Arcade ladder to break the seal.</p>`;
    };
    const paint = () => {
      tiles.forEach((t, i) => { t.classList.toggle('c0', cur[0] === i && (both || turn === 0 || locked[0])); t.classList.toggle('c1', cur[1] === i && (both || turn === 1)); });
      info(0); info(1);
    };
    const move = (side, i) => {
      if (locked[side]) return;
      cur[side] = (i + chars.length) % chars.length;
      if (opts.sfx) opts.sfx('select');
      opts.onMove(side, cur[side]);
      paint();
    };
    const lock = side => {
      if (locked[side] || !opts.unlocked(chars[cur[side]])) return;
      locked[side] = true;
      if (opts.sfx) opts.sfx('confirm');
      opts.onLock(side, cur[side]);
      if (!both && side === 0 && opts.players[1].pick) { turn = 1; opts.onMove(1, cur[1]); paint(); return; }
      paint();
      if (both ? locked[0] && locked[1] : true) opts.onDone(cur.slice());
    };
    const unlock = () => {
      if (both) { if (locked[1]) locked[1] = false; else if (locked[0]) locked[0] = false; else return opts.onBack(); }
      else if (turn === 1) { turn = 0; locked[0] = false; }
      else return opts.onBack();
      paint();
    };
    $('selconfirm').onclick = () => lock(both ? (locked[0] ? 1 : 0) : turn);
    paint();
    this.active = {
      nav: (a, player) => {
        const side = both ? player : turn;
        if (a === 'left') move(side, cur[side] - 1);
        else if (a === 'right') move(side, cur[side] + 1);
        else if (a === 'confirm') lock(side);
        else if (a === 'back') unlock();
      },
    };
  }

  // ------------------------------------------------------------ stage select
  openStages({ start, onMove, onPick, onBack, sfx }) {
    this.show('stagesel');
    const box = $('stages'); box.innerHTML = '';
    let idx = start;
    const cards = STAGES.map((s, i) => {
      const c = el('div', 'stagecard', `<img src="assets/stages/${s.bg}_thumb.webp" alt=""><span class="kj kanji">${s.kanji}</span><div class="cap"><b>${s.name}</b><small>${s.sub}</small></div>`);
      c.addEventListener('click', () => { if (idx === i) { if (sfx) sfx('confirm'); onPick(idx); } else set(i); });
      box.appendChild(c);
      return c;
    });
    const set = i => { idx = (i + STAGES.length) % STAGES.length; cards.forEach((c, k) => c.classList.toggle('focus', k === idx)); if (sfx) sfx('select'); onMove(idx); };
    cards[idx].classList.add('focus');
    this.active = { nav: a => { if (a === 'left' || a === 'up') set(idx - 1); else if (a === 'right' || a === 'down') set(idx + 1); else if (a === 'confirm') { if (sfx) sfx('confirm'); onPick(idx); } else if (a === 'back') onBack(); } };
  }

  // ------------------------------------------------------------------ versus
  openVersus(c1, c2, stage, sub) {
    this.show('versus');
    for (const [i, c] of [[0, c1], [1, c2]]) {
      const b = $('vs' + i);
      b.style.setProperty('--c', c.color);
      b.innerHTML = `<span class="kanji">${c.kanji}</span><h3>${c.name}</h3><p>${c.title}</p>`;
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    }
    $('vsstage').innerHTML = `${stage.name}<small>${sub || stage.sub}</small>`;
    this.active = null;
  }

  // --------------------------------------------------------------------- HUD
  hudInit(match, modeTag) {
    this.hudCache = {};
    for (const f of match.fighters) {
      const i = f.side, c = f.char;
      $('name' + i).textContent = c.name;
      $('por' + i).src = this.portraits[c.id] || '';
      for (const n of document.querySelectorAll('#hud .p' + (i + 1))) n.style.setProperty('--c', c.color);
      $('mlabel' + i).textContent = c.moves[c.superMove];
      $('pips' + i).innerHTML = Array.from({ length: ROUNDS_TO_WIN }, () => '<i></i>').join('');
    }
    document.documentElement.style.setProperty('--p1', match.p1.char.color);
    document.documentElement.style.setProperty('--p2', match.p2.char.color);
    $('modetag').textContent = modeTag || '';
    $('announce').innerHTML = ''; $('cards').innerHTML = ''; $('floats').innerHTML = '';
    for (const i of [0, 1]) { $('combo' + i).classList.remove('show'); $('callout' + i).classList.remove('show'); }
  }
  hudUpdate(match) {
    const h = this.hudCache;
    const set = (key, val, fn) => { if (h[key] !== val) { h[key] = val; fn(val); } };
    for (const f of match.fighters) {
      const i = f.side;
      set('hp' + i, Math.round(f.hp * 10), v => { $('life' + i).style.transform = `scaleX(${v / 10 / MAX_HP})`; $('life' + i).classList.toggle('low', v / 10 <= 25); });
      set('gh' + i, Math.round(f.hpGhost * 5), v => { $('ghost' + i).style.transform = `scaleX(${v / 5 / MAX_HP})`; });
      set('mt' + i, Math.round(f.meter), v => { $('meter' + i).style.transform = `scaleX(${v / 100})`; $('meter' + i).parentElement.classList.toggle('full', v >= 100); if (i === 0) document.querySelector('.tb.sp').classList.toggle('ready', v >= 100); });
      set('win' + i, match.wins[i], v => { [...$('pips' + i).children].forEach((p, k) => p.classList.toggle('won', k < v)); });
    }
    set('time', match.training ? -1 : match.timeLeft, v => { const t = $('timer'); t.textContent = v < 0 ? '∞' : String(v).padStart(2, '0'); t.classList.toggle('low', v >= 0 && v <= 10); });
    set('round', match.round + (match.finalRound ? 100 : 0), () => { $('roundlabel').textContent = match.training ? 'TRAINING' : match.finalRound ? 'FINAL ROUND' : 'ROUND ' + match.round; });
  }

  announce(text, frames, o = {}) {
    const box = $('announce');
    box.innerHTML = '';
    const a = el('div', 'a' + (o.ko ? ' ko' : '') + (o.count ? ' count' : '') + (o.fight ? ' fight' : ''),
      (o.kanji ? `<span class="kanji">${o.kanji}</span>` : '') + `<b>${text}</b>` + (o.sub ? `<small>${o.sub}</small>` : ''));
    a.style.setProperty('--dur', (frames / 60).toFixed(2) + 's');
    box.appendChild(a);
    a.addEventListener('animationend', () => a.remove());
  }
  nameCard(side, c) {
    const d = el('div', 'card s' + side, `<span class="kanji">${c.kanji}</span><h3>${c.name}</h3><p>${c.title}</p>`);
    d.style.setProperty('--c', c.color);
    $('cards').appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }
  stageCard(s) {
    const d = el('div', 'card stage', `<span class="kanji">${s.kanji}</span><h3>${s.name}</h3>`);
    $('cards').appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }
  clearCards() { $('cards').innerHTML = ''; }
  callout(side, text, isSuper) {
    const c = $('callout' + side);
    c.textContent = text;
    c.classList.toggle('super', !!isSuper);
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }
  combo(side, count, dmg) {
    const c = $('combo' + side);
    c.innerHTML = `<b>${count}</b> HITS<small>${dmg} DAMAGE</small>`;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
  }
  float(text, x, y, color) {
    const f = el('div', 'fl', text);
    f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.color = color;
    $('floats').appendChild(f);
    f.addEventListener('animationend', () => f.remove());
  }

  // ------------------------------------------------------------------ result
  openResult({ title, quote, kanji, color, items, sfx }) {
    this.add('result');
    $('restitle').textContent = title; $('resquote').textContent = quote ? `“${quote}”` : '';
    $('reskanji').textContent = kanji; $('restitle').style.color = color || '';
    const ul = $('reslist'); ul.innerHTML = '';
    let idx = 0;
    const lis = items.map((it, i) => { const li = el('li', '', it.label); li.addEventListener('click', () => { if (sfx) sfx('confirm'); it.pick(); }); li.addEventListener('pointerenter', () => set(i)); ul.appendChild(li); return li; });
    const set = i => { idx = (i + items.length) % items.length; lis.forEach((l, k) => l.classList.toggle('focus', k === idx)); };
    set(0);
    this.active = { nav: a => { if (a === 'left' || a === 'up') { set(idx - 1); if (sfx) sfx('select'); } else if (a === 'right' || a === 'down') { set(idx + 1); if (sfx) sfx('select'); } else if (a === 'confirm') { if (sfx) sfx('confirm'); items[idx].pick(); } else if (a === 'back') items[items.length - 1].pick(); } };
  }

  // -------------------------------------------------------------------- help
  openHelp(char, onBack) {
    this.add('help');
    const k = s => s.split(' ').map(x => (x === '+' || x === 'then' || x === 'or' ? ` ${x} ` : `<kbd>${x}</kbd>`)).join('');
    const names = char ? char.moves : { wave: 'Wave', dashSlash: 'Dash slash', risingSlash: 'Rising slash' };
    const sup = char ? char.moves[char.superMove] : 'Spirit Art';
    $('helpbody').innerHTML = `
      <div><h4>PLAYER ONE</h4><table>
        <tr><td>${k('A D')}</td><td>Move · hold away from your foe to <b>guard</b></td></tr>
        <tr><td>${k('W')} / ${k('S')}</td><td>Jump / crouch</td></tr>
        <tr><td>${k('F')}</td><td>Slash — press again on hit for a 3-cut chain</td></tr>
        <tr><td>${k('G')}</td><td>Cleave — slow, heavy, breaks guards down</td></tr>
        <tr><td>${k('R')} ${k('T')} ${k('Y')}</td><td>Special arts (shortcut keys)</td></tr>
        <tr><td>${k('H')}</td><td>Spirit Art when the gauge is full</td></tr>
        <tr><td>${k('Esc')}</td><td>Pause</td></tr></table></div>
      <div><h4>PLAYER TWO</h4><table>
        <tr><td>${k('← →')}</td><td>Move / guard</td></tr>
        <tr><td>${k('↑')} / ${k('↓')}</td><td>Jump / crouch</td></tr>
        <tr><td>${k('K')}</td><td>Slash</td></tr>
        <tr><td>${k('L')}</td><td>Cleave</td></tr>
        <tr><td>${k('I')} ${k('O')} ${k('P')}</td><td>Special arts</td></tr>
        <tr><td>${k(';')}</td><td>Spirit Art</td></tr></table></div>
      <div><h4>ARTS${char ? ' — ' + char.name : ''}</h4><table>
        <tr><td>${names.wave}</td><td>${k('↓ → + F')} or ${k('R')}</td></tr>
        <tr><td>${names.dashSlash}</td><td>${k('↓ → + G')} or ${k('T')}</td></tr>
        <tr><td>${names.risingSlash}</td><td>${k('↓ ↓ + F')} or ${k('Y')}</td></tr>
        <tr><td>${sup}</td><td>${k('F + G')} or ${k('H')} — full gauge</td></tr>
        <tr><td>Guard breaker</td><td>${k('→ + F')} up close (cannot be blocked)</td></tr>
        <tr><td>Low thrust / sweep</td><td>${k('S + F')} / ${k('S + G')}</td></tr>
        <tr><td>Falling blade</td><td>${k('F')} or ${k('G')} in the air</td></tr>
        <tr><td>Dash / evade</td><td>Tap ${k('→ →')} / ${k('← ←')}</td></tr></table></div>
      <div><h4>THE DUEL</h4><p>First to win two rounds takes the match. Landing or guarding blows fills your <b>spirit gauge</b>; striking a foe during their wind-up scores a <b>counter</b> for extra damage. Each consecutive hit in a combo deals a little less.</p>
        <p style="margin-top:.8em">Gamepads work too: stick or d-pad to move, <b>X</b> slash, <b>A</b> cleave, <b>B</b> dash, <b>Y</b> rise, <b>RB</b> wave, <b>RT</b> spirit art. On a phone, use the on-screen stick and buttons.</p></div>`;
    const prev = this.active;
    this.active = { nav: a => { if (a === 'back' || a === 'confirm' || a === 'pause') { this.remove('help'); this.active = prev; if (onBack) onBack(); } } };
  }

  // ----------------------------------------------------------- touch controls
  bindTouch() {
    const stick = $('stick'), knob = $('knob');
    let id = null;
    const setDir = (dx, dy, r) => {
      const d = Touch.dir, dead = 0.3;
      const nx = dx / r, ny = dy / r;
      d.left = nx < -dead; d.right = nx > dead; d.down = ny > 0.45; d.up = ny < -0.5;
      const m = Math.hypot(nx, ny), k = m > 1 ? 1 / m : 1;
      knob.style.transform = `translate(${nx * k * r * 0.6}px, ${ny * k * r * 0.6}px)`;
    };
    const move = e => {
      if (e.pointerId !== id) return;
      const r = stick.getBoundingClientRect();
      setDir(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
      e.preventDefault();
    };
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; Touch.dir.left = Touch.dir.right = Touch.dir.up = Touch.dir.down = false;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', e => { id = e.pointerId; try { stick.setPointerCapture(id); } catch (err) { /* ignore */ } move(e); });
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll('.tb')) {
      b.addEventListener('pointerdown', e => { Touch.press(b.dataset.b); b.classList.add('on'); e.preventDefault(); });
      const up = () => b.classList.remove('on');
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    }
    // stop long-press menus / double-tap zoom on the play surface
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());
  }
}
