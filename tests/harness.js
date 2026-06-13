// Headless boot harness: stubs browser APIs and loads game.js.
const fs = require('fs');
const path = require('path');

function boot() {
  const noop = () => {};
  const ctxStub = new Proxy({}, {
    get(t, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop: noop });
      return typeof prop === 'string' ? noop : undefined;
    },
    set() { return true; },
  });
  global.Image = class {
    constructor() { this.complete = true; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
  };
  global.document = {
    getElementById: () => ({ getContext: () => ctxStub, width: 960, height: 540 }),
    createElement: () => ({ getContext: () => ctxStub, width: 0, height: 0 }),
  };
  const listeners = {};
  global.window = { addEventListener: (ev, fn) => { listeners[ev] = fn; } };
  let rafCb = null;
  global.requestAnimationFrame = cb => { rafCb = cb; };

  const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  // eslint-disable-next-line no-eval
  eval.call(global, src.replace("'use strict';", '') + '\n;globalThis.game = game;');

  let t = 0;
  return {
    game: globalThis.game,
    press: c => listeners.keydown({ code: c, preventDefault: noop }),
    release: c => listeners.keyup({ code: c }),
    frames: n => { for (let i = 0; i < n; i++) { t += 1000 / 60; rafCb(t); } },
  };
}
module.exports = { boot };
