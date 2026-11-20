import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD, STATIONS, movement, multiplier, newRun, step } from '../game/simulation.mjs';

const ticks = (run, count, input) => {
  for (let i = 0; i < count; i++) step(run, input);
};

test('normalized diagonals and flight band constraints hold at all four corners', () => {
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const run = newRun(123), input = movement(x, y, false);
    assert(Math.hypot(input.x, input.y) <= 127);
    ticks(run, 90, input);
    assert.equal(run.x, x < 0 ? FIELD.radius : FIELD.width - FIELD.radius);
    assert.equal(run.y, y < 0 ? FIELD.ceiling + FIELD.radius : FIELD.height - FIELD.radius);
  }
});

test('the shared gun fires on the first tick and then exactly six times per second', () => {
  const run = newRun(123), shotTicks = [];
  for (let i = 0; i < 600; i++) {
    step(run, movement(0, 0, true));
    if (run.events.some(e => e.kind === 'fire')) shotTicks.push(i);
  }
  assert.deepEqual(shotTicks, Array.from({ length: 60 }, (_, i) => i * 10));
});

test('a station clear keeps score and lives but resets position, cooldown and combo', () => {
  const run = newRun(123);
  run.score = 100; run.lives = 2; run.chain = 3;
  run.wave = 1439;
  step(run, movement(-1, 0, true));
  assert.equal(run.station, 1);
  assert.equal(run.interlude, 120);
  assert.equal(run.lives, 2);
  assert.equal(run.score, 600);
  assert.equal(run.chain, 0);
  assert.equal(run.x, 180);
  ticks(run, 120, movement(1, 1, true));
  assert.equal(run.wave, 0);
  assert.equal(run.shots.length, 0);
  step(run, movement(1, 0, true));
  assert.equal(run.shots.length, 1);
});

test('the escort leads to a real 30 HP boss, with both a clear and a timeout', () => {
  const defeated = newRun(123);
  defeated.station = 4; defeated.wave = 1199;
  step(defeated);
  assert.equal(defeated.boss.hp, 30);
  for (let i = 0; i < 1700 && defeated.station === 4 && !defeated.end; i++) {
    step(defeated, movement((defeated.boss.x - defeated.x) / 4, 0, true));
  }
  assert.equal(defeated.station, 5);
  assert.equal(defeated.score, 2500);

  const missed = newRun(123);
  missed.station = 4; missed.wave = 1199;
  step(missed);
  missed.wave = 3599;
  step(missed);
  assert.equal(missed.end, 'Gate closed');
});

test('a hit consumes one life, clears fire and resets the chain', () => {
  const run = newRun(123);
  run.chain = 4; run.lastKill = 0;
  const bolt = { kind: 'bolt', x: 180, y: 576, radius: 3, vx: 0, vy: 0, delay: 0, age: 0, life: 100 };
  run.threats.push({ ...bolt }, { ...bolt });
  step(run);
  assert.equal(run.lives, 2);
  assert.equal(run.shield, 120);
  assert.equal(run.threats.length, 0);
  assert.equal(run.chain, 0);
  run.threats.push({ ...bolt });
  step(run);
  assert.equal(run.lives, 2);
  assert.deepEqual([1, 4, 7, 10, 22].map(multiplier), [1, 2, 3, 4, 4]);
});

test('the final station delivers the mail and awards its clear bonus', () => {
  const run = newRun(123);
  run.station = STATIONS.length - 1;
  run.wave = STATIONS.at(-1).seconds * 60 - 1;
  step(run);
  assert.equal(run.end, 'Mail delivered');
  assert.equal(run.score, 500);
  step(run);
  assert.equal(run.score, 500);
});

test('seeded stages keep stable results and entity caps', () => {
  const first = newRun(42), second = newRun(42);
  first.station = second.station = 7;
  for (let i = 0; i < 2400 && !first.end; i++) {
    const input = movement(i % 180 < 90 ? -1 : 1, 0, true);
    step(first, input); step(second, input);
    assert(first.threats.filter(e => e.kind === 'bolt').length <= 12);
    assert(first.threats.filter(e => ['nova','well','rock'].includes(e.kind)).length <= 2);
    assert(first.threats.filter(e => ['scout','flanker'].includes(e.kind)).length <= 6);
  }
  assert.deepEqual(first, second);
});

test('an overlapping black hole and supernova leave a shared reachable opening', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const run = newRun(seed);
    run.station = 7; run.wave = 479;
    step(run);
    const well = run.threats.find(e => e.kind === 'well');
    assert(well);
    ticks(run, 60);
    const nova = run.threats.find(e => e.kind === 'nova');
    assert(nova);
    assert.equal(nova.delay, 143);
    const target = run.route.to;
    assert(Math.abs(target - nova.x) + FIELD.radius <= nova.gap / 2);
    assert(Math.abs(target - well.x) > well.radius + FIELD.radius);
    ticks(run, 15);
    for (let i = 0; i < 300; i++) step(run, movement((target - run.x)/4, 0, false));
    assert.equal(run.lives, 3);
  }
});
