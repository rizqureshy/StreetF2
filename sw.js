// Swift Sword service worker — cache-first for full offline play.
const CACHE = 'swift-sword-v3';
const ASSETS = [
  '.', 'index.html', 'style.css', 'game.js', 'manifest.json',
  'vendor/pixi.min.js', 'vendor/pixi-filters.js',
  'assets/background.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/music/battle.mp3',
  'assets/music/doom.mp3',
  'assets/music/menu.mp3',
  'assets/music/night.mp3',
  'assets/p1/Attack1.png',
  'assets/p1/Attack2.png',
  'assets/p1/Death.png',
  'assets/p1/Fall.png',
  'assets/p1/Idle.png',
  'assets/p1/Jump.png',
  'assets/p1/Run.png',
  'assets/p1/TakeHit.png',
  'assets/p2/Attack1.png',
  'assets/p2/Attack2.png',
  'assets/p2/Death.png',
  'assets/p2/Fall.png',
  'assets/p2/Idle.png',
  'assets/p2/Jump.png',
  'assets/p2/Run.png',
  'assets/p2/TakeHit.png',
  'assets/sfx/chop.mp3',
  'assets/sfx/click1.mp3',
  'assets/sfx/click3.mp3',
  'assets/sfx/cloth_1.mp3',
  'assets/sfx/cloth_3.mp3',
  'assets/sfx/draw_knife_1.mp3',
  'assets/sfx/draw_knife_2.mp3',
  'assets/sfx/draw_knife_3.mp3',
  'assets/sfx/explosion_crunch_000.mp3',
  'assets/sfx/explosion_crunch_001.mp3',
  'assets/sfx/explosion_crunch_002.mp3',
  'assets/sfx/footstep_wood_000.mp3',
  'assets/sfx/footstep_wood_001.mp3',
  'assets/sfx/force_field_000.mp3',
  'assets/sfx/force_field_001.mp3',
  'assets/sfx/force_field_002.mp3',
  'assets/sfx/impact_bell_heavy_000.mp3',
  'assets/sfx/impact_metal_light_000.mp3',
  'assets/sfx/impact_metal_light_001.mp3',
  'assets/sfx/impact_metal_medium_000.mp3',
  'assets/sfx/impact_punch_heavy_000.mp3',
  'assets/sfx/impact_punch_heavy_001.mp3',
  'assets/sfx/impact_punch_heavy_002.mp3',
  'assets/sfx/impact_punch_medium_000.mp3',
  'assets/sfx/impact_punch_medium_001.mp3',
  'assets/sfx/impact_soft_heavy_000.mp3',
  'assets/sfx/impact_soft_heavy_001.mp3',
  'assets/sfx/impact_wood_heavy_000.mp3',
  'assets/sfx/knife_slice.mp3',
  'assets/sfx/knife_slice_2.mp3',
  'assets/sfx/laser_large_000.mp3',
  'assets/sfx/laser_large_001.mp3',
  'assets/sfx/silence.mp3',
  'assets/shop.png',
  'assets/vo/1.mp3',
  'assets/vo/2.mp3',
  'assets/vo/3.mp3',
  'assets/vo/choose_your_character.mp3',
  'assets/vo/combo.mp3',
  'assets/vo/congratulations.mp3',
  'assets/vo/fight.mp3',
  'assets/vo/final_round.mp3',
  'assets/vo/flawless_victory.mp3',
  'assets/vo/game_over.mp3',
  'assets/vo/go.mp3',
  'assets/vo/hurry_up.mp3',
  'assets/vo/its_a_tie.mp3',
  'assets/vo/player_1.mp3',
  'assets/vo/player_2.mp3',
  'assets/vo/prepare_yourself.mp3',
  'assets/vo/ready.mp3',
  'assets/vo/round.mp3',
  'assets/vo/round_1.mp3',
  'assets/vo/round_2.mp3',
  'assets/vo/round_3.mp3',
  'assets/vo/sudden_death.mp3',
  'assets/vo/time_over.mp3',
  'assets/vo/winner.mp3',
  'assets/vo/you_lose.mp3',
  'assets/vo/you_win.mp3',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});
