// The simulation uses logical field units. Velocities are units per 60 Hz tick.
export const FIELD = Object.freeze({ width: 360, height: 640, ceiling: 512, radius: 8 });
export const STATIONS = [
  { name: 'Outbox', seconds: 24, scout: 120, speed: 110 },
  { name: 'Loose Freight', seconds: 28, scout: 180, pair: true, speed: 120, rock: 360 },
  { name: 'Side Door', seconds: 30, scout: 120, flank: 360, speed: 135, wells: [13] },
  { name: 'Lost Property', seconds: 32, scout: 90, flank: 300, speed: 150, rock: 480, wells: [6, 21] },
  { name: 'Sorting Office', seconds: 60, scout: 180, pair: true, speed: 150 },
  { name: 'Dead Sun', seconds: 26, scout: 150, speed: 140, novas: [6, 17] },
  { name: 'Crossed Wires', seconds: 34, scout: 120, flank: 300, speed: 160, rock: 360, novas: [10, 24] },
  { name: 'Last Delivery', seconds: 40, scout: 180, pair: true, flank: 240, speed: 175, rock: 420, wells: [7, 23], novas: [9, 25] }
];

const columns = [60, 180, 300];
const lanes = [36, 84, 132, 180, 228, 276, 324];
const environmental = new Set(['rock', 'well', 'nova']);
const wellRadius = 36;
const wellSpeed = 210 / 60;
const wellTiming = { warning: 120, life: Math.ceil((FIELD.height + 2 * wellRadius) / wellSpeed) };
const novaTiming = { warning: 144, life: 36 };
const rockTiming = { warning: 72, life: 320 };
const neutral = Object.freeze({ x: 0, y: 0, fire: false });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const multiplier = chain => Math.min(4, 1 + Math.floor(Math.max(0, chain - 1) / 3));

export function movement(x, y, fire) {
  const scale = Math.max(1, Math.hypot(x, y));
  return { x: Math.trunc(x / scale * 127), y: Math.trunc(y / scale * 127), fire };
}

export function newRun(seed) {
  return {
    seed: seed >>> 0, station: 0, tick: 0, wave: 0, interlude: 0,
    x: 180, y: 576, lives: 3, score: 0, cooldown: 0, shield: 0,
    chain: 0, lastKill: -121, scouts: 0, threats: [], shots: [], letters: [],
    boss: null, route: null, end: '', events: []
  };
}

function roll(s, count) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return Math.floor(s.seed / 4294967296 * count);
}

function body(kind, x, y, vx, vy, radius, life, delay = 0, hp = 0) {
  return { kind, x, y, vx, vy, radius, life, delay, hp, age: 0 };
}

// A flight plan waits 15 ticks, moves horizontally at full speed, then holds.
// Check closest approach over each continuous segment, including both endpoints.
function routeClear(route, threats, now, until = Infinity) {
  const offset = now - route.start;
  const arrival = 15 + Math.abs(route.to - route.from) / 4;
  const pilotX = t => route.from + Math.sign(route.to - route.from) *
    Math.min(Math.abs(route.to - route.from), 4 * Math.max(0, t + offset - 15));
  for (const e of threats) {
    const begin = e.delay, end = Math.min(until - now, begin + e.life - e.age);
    if (end < begin) continue;
    if (e.kind === 'nova') {
      if (Math.max(Math.abs(pilotX(begin) - e.x), Math.abs(pilotX(end) - e.x)) > e.gap / 2 - 12) return false;
      continue;
    }
    const times = [begin, clamp(15 - offset, begin, end), clamp(arrival - offset, begin, end), end];
    for (let i = 1; i < times.length; i++) {
      const a = times[i - 1], b = times[i];
      const dx = e.x + e.vx * (a - begin) - pilotX(a);
      const dy = e.y + e.vy * (a - begin) - route.y;
      const vx = e.vx * (b - a) - (pilotX(b) - pilotX(a));
      const vy = e.vy * (b - a);
      const fraction = clamp(-(dx * vx + dy * vy) / (vx * vx + vy * vy || 1), 0, 1);
      if ((dx + vx * fraction) ** 2 + (dy + vy * fraction) ** 2 <= (e.radius + 13) ** 2) return false;
    }
  }
  return true;
}

function preservesRoute(s, candidates) {
  return !s.route || s.route.until <= s.tick || routeClear(s.route, candidates, s.tick, s.route.until);
}

function findRoute(s, traffic) {
  const destinations = [s.x, ...lanes.toSorted((a, b) => Math.abs(a - s.x) - Math.abs(b - s.x))];
  for (const to of destinations) {
    const route = { from: s.x, to, y: s.y, start: s.tick };
    if (!routeClear(route, traffic, s.tick)) continue;
    route.until = s.tick + Math.max(...traffic.map(e => e.delay + e.life - e.age));
    return route;
  }
  return null;
}

function admit(s, batch) {
  if (!preservesRoute(s, batch)) return false;
  const route = findRoute(s, [...s.threats, ...batch]);
  if (!route) return false;
  s.route = route;
  s.threats.push(...batch);
  return true;
}

function hazards(s, station) {
  const seconds = s.wave / 60;
  const nova = station.novas?.includes(seconds);
  const well = station.wells?.includes(seconds);
  const rock = station.rock && s.wave % station.rock === 0;
  if (!(nova || well || rock)) return;
  if (nova && s.station === 5) {
    s.threats = [];
    s.route = null;
  }
  const active = s.threats.filter(e => environmental.has(e.kind));
  if (active.length >= 2) return;
  // Reserve future simultaneous warning/active slots before admitting a rock.
  if (rock && !(nova || well)) {
    const warnings = [
      ...(station.wells || []).map(t => [60 * t, 60 * t + wellTiming.warning + wellTiming.life]),
      ...(station.novas || []).map(t => [60 * t, 60 * t + novaTiming.warning + novaTiming.life]),
      ...active.filter(e => e.kind === 'rock').map(e => [s.wave, s.wave + e.delay + e.life - e.age])
    ];
    if (warnings.some(([t]) => t >= s.wave && t < s.wave + rockTiming.warning + rockTiming.life &&
        warnings.filter(([a, b]) => a <= t && t < b).length >= 2)) return;
  }
  const first = roll(s, lanes.length);
  for (let i = 0; i < lanes.length; i++) {
    const x = lanes[(first + i) % lanes.length];
    let candidate;
    if (nova) {
      candidate = { ...body('nova', x, 0, 0, 0, 0, novaTiming.life, novaTiming.warning), gap: 76 };
    } else if (well) {
      candidate = body('well', x, -wellRadius, 0, wellSpeed, wellRadius, wellTiming.life, wellTiming.warning);
    } else {
      const vx = (x < 180 ? 1 : -1) * 0.18;
      candidate = body('rock', x, -16, vx, Math.sqrt((128 / 60) ** 2 - vx ** 2),
        14, rockTiming.life, rockTiming.warning, 3);
    }
    if (admit(s, [candidate])) return;
  }
}

function regularTraffic(s, station) {
  if (s.station === 5 && s.threats.some(e => e.kind === 'nova')) return;
  const count = () => s.threats.filter(e => e.kind === 'scout' || e.kind === 'flanker').length;
  if (s.wave % station.scout === 0) {
    const slot = s.wave / station.scout - 1;
    const first = station.pair ? slot % 2 : slot % columns.length;
    for (let j = 0; j < (station.pair ? 2 : 1) && count() < 6; j++) {
      admit(s, [body('scout', columns[first + j], -12, 0, 1.2, 9, 556, 0, 1)]);
    }
  }
  if (station.flank && s.wave % station.flank === 0 && count() < 6) {
    const left = (s.wave / station.flank) % 2 === 1;
    admit(s, [body('flanker', left ? -12 : 372, 180, (left ? 1 : -1) * 100 / 60, 0, 11, 233, 48, 2)]);
  }
}

function bolt(x, y, vx, vy, delay) {
  const life = Math.ceil(Math.min(vy > 0 ? (654 - y) / vy : Infinity,
    vx > 0 ? (372 - x) / vx : vx < 0 ? (-12 - x) / vx : Infinity));
  return body('bolt', x, y, vx, vy, 3, life, delay);
}

function volley(s, shots) {
  if (s.threats.filter(e => e.kind === 'bolt').length + shots.length <= 12) admit(s, shots);
}

function bossTurn(s) {
  if (s.wave === 1200) {
    s.threats = [];
    s.route = null;
    s.boss = { x: 180, y: 105, hp: 30 };
  }
  const boss = s.boss;
  const elapsed = s.wave - 1200;
  const beat = Math.floor(elapsed / 120);
  const phase = elapsed % 120;
  if (phase < 60) boss.x += clamp(columns[beat % 3] - boss.x, -2, 2);
  if (phase !== 60) return;
  const speed = 165 / 60;
  const shots = [-1, 0, 1].map(i => {
    const angle = beat % 2 ? 0 : i * Math.PI / 9;
    return bolt(boss.x + (beat % 2 ? i * 36 : 0), boss.y + 12,
      speed * Math.sin(angle), speed * Math.cos(angle), 60);
  });
  volley(s, shots);
}

function advanceTraffic(s, station) {
  const shooters = [];
  for (const e of s.threats) {
    if (e.delay) { e.delay--; continue; }
    e.x += e.vx;
    e.y += e.vy;
    e.age++;
    if ((e.kind === 'scout' && e.age === 163) || (e.kind === 'flanker' && e.age === 85)) shooters.push(e);
  }
  for (const e of shooters) {
    if (e.kind === 'scout' && e.age === 163) {
      volley(s, [{ ...bolt(e.x, e.y + 36, 0, station.speed / 60, 30), shooter: e }]);
    } else {
      const x = e.x + 30 * e.vx;
      const distance = Math.hypot(s.x - x, s.y - e.y);
      volley(s, [{ ...bolt(x, e.y, (s.x - x) / distance * station.speed / 60,
        (s.y - e.y) / distance * station.speed / 60, 30), shooter: e }]);
    }
  }
}

const touching = (a, b, distance) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= distance ** 2;

function scoreKill(s, e) {
  s.chain++;
  s.lastKill = s.tick;
  s.score += ({ scout: 100, flanker: 200, rock: 50 })[e.kind] * multiplier(s.chain);
  s.events.push({ kind: 'burst', x: e.x, y: e.y });
  if (e.kind === 'scout' && ++s.scouts % 4 === 0) s.letters.push({ x: e.x, y: e.y });
}

function deflectRock(s, rock, shot) {
  s.events.push({ kind: 'rock-hit', x: shot.x, y: shot.y });
  const offset = clamp((rock.x - shot.x) / rock.radius, -1, 1);
  const vx = clamp(rock.vx + offset * 0.34, -0.6, 0.6);
  if (vx === rock.vx) return;
  const candidate = { ...rock, vx };
  if (!preservesRoute(s, [candidate])) return;
  const traffic = s.threats.filter(e => !e.gone).map(e => e === rock ? candidate : e);
  const route = findRoute(s, traffic);
  if (!route) return;
  rock.vx = vx;
  s.route = route;
}

function collide(s) {
  const wells = s.threats.filter(e => e.kind === 'well' && !e.delay);
  for (const shot of s.shots) {
    shot.y -= 8;
    if (wells.some(e => touching(shot, e, e.radius))) { shot.used = true; continue; }
    const target = s.threats.find(e => e.hp > 0 && !e.delay && touching(shot, e, e.radius + 3));
    if (target) {
      shot.used = true;
      if (--target.hp === 0) { target.gone = true; scoreKill(s, target); }
      else if (target.kind === 'rock') deflectRock(s, target, shot);
    } else if (s.boss?.hp > 0 && touching(shot, s.boss, 22)) {
      shot.used = true;
      if (--s.boss.hp === 0) {
        s.score += 2000;
        s.events.push({ kind: 'burst', x: s.boss.x, y: s.boss.y });
      }
    }
  }
  s.shots = s.shots.filter(p => !p.used && p.y > -8);
  s.letters = s.letters.filter(letter => {
    letter.y += 100 / 60;
    if (!touching(s, letter, 16)) return letter.y < 651;
    s.score += 250;
    s.events.push({ kind: 'letter', x: letter.x, y: letter.y });
    return false;
  });
  s.threats = s.threats.filter(e => {
    if (e.gone) return false;
    if (e.kind !== 'bolt') return true;
    if (!e.age && e.shooter?.gone) return false;
    return e.delay || !wells.some(w => touching(w, e, w.radius));
  });
  const hit = s.threats.some(e => !e.delay && (e.kind === 'nova'
    ? Math.abs(s.x - e.x) + FIELD.radius > e.gap / 2
    : touching(s, e, e.radius + FIELD.radius)));
  if (hit && !s.shield) {
    s.lives--;
    s.events.push({ kind: 'hit', x: s.x, y: s.y });
    s.chain = 0;
    if (!s.lives) s.end = 'Skiff lost';
    else {
      s.x = 180; s.y = 576; s.shield = 120; s.cooldown = 0;
      s.threats = s.threats.filter(e => e.kind !== 'bolt');
      s.route = null;
    }
  }
  s.threats = s.threats.filter(e => e.age < e.life);
}

export function step(s, input = neutral) {
  s.events = [];
  if (s.end) return;
  s.tick++;
  if (s.interlude) { s.interlude--; return; }
  const station = STATIONS[s.station];
  s.wave++;
  if (s.shield) s.shield--;
  if (s.cooldown) s.cooldown--;
  if (s.tick - s.lastKill > 120) s.chain = 0;
  s.x = clamp(s.x + input.x / 127 * 4, 8, 352);
  s.y = clamp(s.y + input.y / 127 * 4, 520, 632);
  if (input.fire && !s.cooldown) {
    s.shots.push({ x: s.x, y: s.y - 8 });
    s.cooldown = 10;
    s.events.push({ kind: 'fire' });
  }
  if (s.station === 4 && s.wave >= 1200) bossTurn(s);
  else if (s.wave < station.seconds * 60) { hazards(s, station); regularTraffic(s, station); }
  advanceTraffic(s, station);
  collide(s);
  if (s.end) return;
  if (s.boss?.hp === 0 || s.wave === station.seconds * 60) {
    if (s.boss?.hp > 0) { s.end = 'Gate closed'; return; }
    s.score += 500;
    if (s.station === STATIONS.length - 1) { s.end = 'Mail delivered'; return; }
    s.station++;
    Object.assign(s, { wave: 0, interlude: 120, scouts: 0, chain: 0, x: 180, y: 576,
      shield: 0, cooldown: 0, threats: [], shots: [], letters: [], boss: null, route: null });
  }
}
