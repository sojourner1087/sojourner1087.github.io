import { STATIONS, newRun, movement, multiplier, clamp, step } from './simulation.mjs';
import { draw } from './render.mjs';

const id = name => document.getElementById(name);
const field = id('field'), ctx = field.getContext('2d', { alpha: false });
const panel = id('panel'), keys = new Set();
const held = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space']);
const pad = (value, length) => String(value).padStart(length, '0');
const touchDevice = () => matchMedia('(pointer: coarse)').matches;
const storageKey = 'dead-letter-orbit.records.v1';
let record = { best: 0, furthest: 0, flights: 0 };
try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  for (const key of Object.keys(record)) if (Number.isSafeInteger(stored?.[key]) && stored[key] >= 0) record[key] = stored[key];
} catch { /* Storage is optional in private browsing. */ }

let run, mode = 'hangar', dialogKind = '', touchMode = false, drag = null, tapShot = false;
let frame = 0, previous = null, accumulator = 0, effects = [], audio = null, soundOn = false;
const desktopHelp = 'Move with WASD or arrow keys. Hold Space to fire. Press Esc to pause.';
const touchHelp = 'Drag anywhere on the field to steer. The skiff fires automatically, even when you lift your thumb.';

for (const station of STATIONS) {
  const node = document.createElement('li');
  const marker = document.createElement('span'); marker.className = 'node';
  node.append(marker, station.name); id('route').append(node);
  const label = document.createElement('li'); label.textContent = station.name; id('flight-route').append(label);
}

function showRecord() {
  id('best').textContent = pad(record.best, 6);
  id('flights').textContent = pad(record.flights, 3);
  id('furthest').firstChild.textContent = (record.furthest ? pad(record.furthest, 2) : '—') + ' ';
  [...id('route').children].forEach((node, i) => node.classList.toggle('reached', i < record.furthest));
}
showRecord();

function tone(frequency, seconds, shape = 'triangle', end = frequency) {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  const now = audio.currentTime;
  oscillator.type = shape; oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(end, now + seconds);
  gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + seconds);
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start(now); oscillator.stop(now + seconds);
}

id('sound').addEventListener('click', async () => {
  if (!soundOn) {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ??= new Audio();
      await audio.resume();
    } catch { id('sound-label').textContent = 'Audio unavailable'; return; }
  }
  soundOn = !soundOn;
  id('sound-label').textContent = soundOn ? 'Sound on' : 'Sound off';
  id('sound').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) tone(440, .12, 'triangle', 660);
  if (mode === 'flying') field.focus({ preventScroll: true });
});

function resizeField() {
  const dpr = Math.min(devicePixelRatio || 1, 3), box = field.getBoundingClientRect();
  if (!box.width) return;
  field.width = Math.round(box.width * dpr); field.height = Math.round(box.height * dpr);
  if (run) draw(ctx, run, effects);
}
new ResizeObserver(resizeField).observe(field);

function releaseDrag() {
  if (drag && field.hasPointerCapture(drag.id)) field.releasePointerCapture(drag.id);
  drag = null;
}

function clearInput() {
  keys.clear(); tapShot = false;
  releaseDrag();
}

function setTouchMode(enabled) {
  touchMode = enabled;
  document.querySelector('.aside-help').textContent = enabled ? touchHelp : desktopHelp;
}

function updateHud() {
  const station = STATIONS[run.station];
  id('score').textContent = pad(run.score, 6);
  id('combo').textContent = '×' + multiplier(run.chain);
  id('combo-bar').style.transform = 'scaleX(' + (run.chain ? Math.max(0, 1-(run.tick-run.lastKill)/120) : 0) + ')';
  id('lives').textContent = run.lives;
  id('station-label').textContent = pad(run.station + 1, 2) + ' / ' + station.name;
  const time = Math.ceil(station.seconds-run.wave/60);
  id('timer').textContent = Math.floor(time/60) + ':' + pad(time%60,2);
  id('transition').hidden = !run.interlude;
  id('incoming').textContent = station.name;
  [...id('flight-route').children].forEach((item, i) => {
    if (i === run.station) item.setAttribute('aria-current','step');
    else item.removeAttribute('aria-current');
  });
}

function input() {
  const down = (...codes) => codes.some(code => keys.has(code));
  let x = Number(down('ArrowRight','KeyD')) - Number(down('ArrowLeft','KeyA'));
  let y = Number(down('ArrowDown','KeyS')) - Number(down('ArrowUp','KeyW'));
  if (drag) { x = (drag.x - run.x) / 4; y = (drag.y - run.y) / 4; }
  const value = movement(x, y, touchMode || down('Space') || tapShot);
  tapShot = false;
  return value;
}

function animate(time) {
  if (mode !== 'flying') return;
  if (previous !== null) accumulator += Math.min(time - previous, 200);
  previous = time;
  while (accumulator + 1e-8 >= 1000/60 && !run.end) {
    const stationBefore = run.station;
    step(run, input()); accumulator -= 1000/60;
    if (run.station !== stationBefore) { effects = []; releaseDrag(); tone(460,.25,'triangle',800); }
    for (const event of run.events) {
      if (event.kind === 'fire') tone(420,.045,'square',220);
      else {
        effects.push({ ...event, tick: run.tick });
        if (event.kind === 'letter') tone(620,.16,'triangle',960);
        else if (event.kind === 'rock-hit') tone(380,.055,'triangle',190);
        else tone(event.kind === 'hit' ? 170 : 240,.12,'sawtooth',55);
      }
    }
  }
  effects = effects.filter(p => run.tick - p.tick < 25);
  updateHud(); draw(ctx,run,effects);
  if (run.end) { finish(); return; }
  frame = requestAnimationFrame(animate);
}

function fly() {
  closePanel();
  mode = 'flying'; previous = null; accumulator = 0;
  field.focus({ preventScroll: true });
  frame = requestAnimationFrame(animate);
}

function launch() {
  cancelAnimationFrame(frame); clearInput(); closePanel();
  run = newRun(crypto.getRandomValues(new Uint32Array(1))[0]);
  effects = [];
  id('hangar').hidden = true; id('cockpit').hidden = false;
  document.body.classList.add('in-flight');
  resizeField(); updateHud(); fly();
}

function hangar() {
  closePanel(); cancelAnimationFrame(frame); clearInput();
  mode = 'hangar'; run = null;
  document.body.classList.remove('in-flight');
  id('cockpit').hidden = true; id('hangar').hidden = false;
  showRecord(); id('launch').focus({ preventScroll: true });
}

function stopFlight() {
  mode = 'paused'; cancelAnimationFrame(frame); clearInput();
}

function closePanel() {
  if (panel.open) panel.close();
  dialogKind = '';
}

function showPanel(kind, title, content, actions) {
  dialogKind = kind;
  id('panel-title').textContent = title;
  id('panel-body').innerHTML = content;
  id('panel-actions').replaceChildren();
  for (const [i, [text, act]] of actions.entries()) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = i ? 'secondary' : 'primary'; btn.textContent = text;
    btn.addEventListener('click', act); id('panel-actions').append(btn);
  }
  if (!panel.open) panel.showModal();
  id('panel-actions').firstChild.focus({ preventScroll: true });
}

function pause() {
  if (mode !== 'flying') return;
  stopFlight();
  showPanel('pause','Flight paused','<p>' + STATIONS[run.station].name + ' · Station ' + (run.station+1) + ' of 8</p>',
    [['Resume', fly], ['Restart', launch], ['Hangar', hangar]]);
}

function finish() {
  mode = 'results'; clearInput();
  record.best = Math.max(record.best, run.score);
  record.furthest = Math.max(record.furthest, run.station+1); record.flights++;
  try { localStorage.setItem(storageKey,JSON.stringify(record)); } catch { /* Results still work without persistent storage. */ }
  showRecord();
  showPanel('results',run.end,'<p>Final score <strong class="result-number">' + pad(run.score,6) +
    '</strong></p><p>Station ' + (run.station+1) + ' · ' + STATIONS[run.station].name +
    '<br>Personal best on this device · ' + pad(record.best,6) + '</p>', [['Fly again',launch],['Hangar',hangar]]);
}

id('launch').addEventListener('click', e => { setTouchMode(e.pointerType === 'touch' || touchDevice()); launch(); });
id('pause').addEventListener('click',pause);
id('manual-open').addEventListener('click', () => {
  const duringFlight = mode === 'flying';
  if (duringFlight) stopFlight();
  showPanel('manual','Flight manual','<p><strong>Flight controls</strong><br>' + desktopHelp + ' ' + touchHelp +
    '</p><p><strong>Make the delivery</strong><br>Stay in the bottom flight band. Shoot drones, catch falling letters for 250 points, and chain kills within two seconds to build your multiplier.</p>' +
    '<p>Steer clear of black holes as they drift down the marked lane. Clip an asteroid from the side to nudge it off course.</p>' +
    '<p>Three lives cover eight stations. Break the Sorting Engine’s seal at station 5. During a supernova, fly between the marked brackets.</p>' +
    '<p>Practice scores are saved on this device.</p>',[[duringFlight ? 'Resume flight' : 'Back to hangar', duringFlight ? fly : closePanel]]);
});
panel.addEventListener('cancel', e => {
  e.preventDefault();
  if (dialogKind === 'results') hangar();
  else if (mode === 'paused') fly();
  else closePanel();
});
id('panel-inner').addEventListener('submit', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (mode !== 'flying' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Escape') { e.preventDefault(); pause(); return; }
  if (!held.has(e.code)) return;
  if (e.code === 'Space' && document.activeElement?.tagName === 'BUTTON') return;
  e.preventDefault();
  if (e.code === 'Space' && !e.repeat) tapShot = true;
  keys.add(e.code);
});
window.addEventListener('keyup', e => { keys.delete(e.code); });
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
matchMedia('(orientation: portrait)').addEventListener('change',pause);

field.addEventListener('pointerdown', e => {
  if (mode !== 'flying' || drag || e.pointerType === 'mouse') return;
  e.preventDefault(); setTouchMode(true);
  field.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, shipX: run.x, shipY: run.y, x: run.x, y: run.y };
});
field.addEventListener('pointermove', e => {
  if (e.pointerId !== drag?.id) return;
  const rect = field.getBoundingClientRect();
  drag.x = clamp(drag.shipX + (e.clientX - drag.startX) * 360 / rect.width, 8, 352);
  drag.y = clamp(drag.shipY + (e.clientY - drag.startY) * 640 / rect.height, 520, 632);
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) field.addEventListener(event, e => {
  if (e.pointerId === drag?.id) drag = null;
});
