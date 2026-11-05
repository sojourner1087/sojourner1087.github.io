const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const html = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// A small DOM fixture exercises the actual page script. Layout tests supply
// explicit control rectangles; these are not a substitute for browser visual QA.
function fixture(width = 1280, height = 800, reducedMotion = false) {
  const frames = new Map();
  let frameId = 0, seed = 7419, layoutObserver;
  const listeners = {};
  const context = Object.fromEntries(['clearRect', 'fillRect', 'setTransform', 'beginPath', 'arc', 'fill', 'stroke', 'fillText', 'moveTo', 'lineTo'].map(key => [key, () => {}]));
  const elements = {};
  const document = { hidden: false, activeElement: null, getElementById: id => elements[id], querySelectorAll: () => overlays,
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  const window = { innerWidth: width, innerHeight: height, devicePixelRatio: 2,
    matchMedia: () => ({ matches: reducedMotion }), addEventListener: (name, fn) => { listeners[name] = fn; } };
  function rect(x, y, w, h) { return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }; }
  function element(id) {
    return { id, hidden: false, dataset: {}, textContent: '', attributes: {}, listeners: {},
      getContext: () => context, setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      emit(name, event = {}) { this.listeners[name]?.(event); },
      focus() { if (document.activeElement === this) return; document.activeElement?.emit('blur'); document.activeElement = this; this.emit('focus'); },
      getBoundingClientRect: () => rect(0, 0, window.innerWidth, window.innerHeight) };
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements[match[1]] = element(match[1]);
  const overlays = ['identity', 'controls', 'panel', 'stats'].map(id => elements[id] ||= element(id));
  elements.identity.getBoundingClientRect = () => rect(16, 18, 160, 70);
  elements.controls.getBoundingClientRect = () => rect(window.innerWidth - 156, 18, 140, 40);
  elements.panel.getBoundingClientRect = () => {
    const h = elements['panel-body'].hidden ? 110 : 280;
    return rect(16, window.innerHeight - 16 - h, Math.min(380, window.innerWidth - 32), h);
  };
  elements.stats.getBoundingClientRect = () => window.innerWidth <= 600 ? rect(0, 0, 0, 0) : rect(window.innerWidth - 156, window.innerHeight - 60, 140, 44);
  const math = Object.create(Math);
  math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const environment = vm.createContext({ window, document, Math: math,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { constructor(fn) { layoutObserver = fn; } observe() {} } });
  vm.runInContext(source, environment);
  const run = code => vm.runInContext(code, environment);
  function key(key, extra = {}) {
    const event = { key, preventDefault() { this.prevented = true; }, ...extra };
    elements.flow.emit('keydown', event); return event;
  }
  function click(x, y, button = 0, pointerType = 'mouse') {
    elements.flow.emit('pointerdown', { clientX: x, clientY: y, button, pointerType, isPrimary: true });
  }
  function assertAccessible() {
    const circles = run('vortices.map(v => ({x:v.x,y:v.y}))');
    for (const v of circles) {
      assert(v.x >= 28 && v.x <= window.innerWidth - 28 && v.y >= 28 && v.y <= window.innerHeight - 28, 'center and deletion target stay on-screen');
      for (const overlay of overlays) {
        const r = overlay.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        assert(v.x < r.left - 28 || v.x > r.right + 28 || v.y < r.top - 28 || v.y > r.bottom + 28, 'deletion target stays clear of controls');
      }
    }
  }
  return { run, key, click, elements, window, document, frames, listeners, assertAccessible, layout: () => layoutObserver() };
}

test('dense vortex orbits stay accurate across 20, 30, 60 and 120 FPS', () => {
  const app = fixture();
  app.run('vortices = []');
  app.click(600, 400);
  for (let i = 0; i < 6; i++) app.click(600 + 24 * Math.cos(i * Math.PI / 3), 400 + 24 * Math.sin(i * Math.PI / 3));
  assert.equal(app.run('vortices.length'), 7, 'cluster is reachable through normal clicks');
  const sample = dt => app.run(`(() => { const p = {x:610,y:400}; for(let i=0;i<${Math.round(3 / dt)};i++) advanceParticle(p, ${dt}); return p; })()`);
  const reference = sample(1 / 2000);
  for (const fps of [20, 30, 60, 120]) {
    const p = sample(1 / fps);
    assert(Math.abs(Math.hypot(p.x - 600, p.y - 400) - 10) < .1, `orbit radius at ${fps} FPS`);
    assert(Math.hypot(p.x - reference.x, p.y - reference.y) < .2, `trajectory at ${fps} FPS agrees with fine-step reference`);
  }
});

test('empty and maximum-size fields have finite, bounded particle positions', () => {
  const app = fixture();
  app.run('vortices=[]; particles=[{x:600,y:400,age:10}]; paint(.05)');
  assert.equal(app.run('particles[0].x'), 600);
  app.run('vortices=Array.from({length:24},(_,i)=>({x:500+(i%6)*24,y:300+Math.floor(i/6)*24,direction:i%2?1:-1})); particles=Array.from({length:100},randomParticle); for(let i=0;i<100;i++)paint(.05)');
  assert(app.run('particles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))'));
});

test('random pairs are visible on desktop, portrait and landscape screens', () => {
  for (const [w, h] of [[1280,800], [375,667], [320,568], [812,375]]) {
    const app = fixture(w, h);
    for (let i = 0; i < 30; i++) {
      app.elements.reset.emit('click');
      assert.equal(app.run('vortices.length'), 2);
      app.assertAccessible();
      assert(app.run('Math.hypot(vortices[0].x-vortices[1].x,vortices[0].y-vortices[1].y)>22'));
    }
  }
});

test('panel expansion, layout changes and rotation preserve accessible vortices', () => {
  const app = fixture(375,667);
  app.run('vortices=[]'); app.click(200,450);
  assert.equal(app.run('vortices.length'), 1);
  app.elements['toggle-panel'].emit('click');
  assert.equal(app.elements['toggle-panel'].attributes['aria-expanded'], 'true');
  app.assertAccessible(); assert.equal(app.run('vortices.length'), 1);
  app.elements.panel.getBoundingClientRect = () => ({left:16,top:250,right:356,bottom:651,width:340,height:401});
  app.layout(); app.assertAccessible();
  // Restore a responsive panel rectangle for the rotation.
  app.elements.panel.getBoundingClientRect = () => ({left:16,top:249,right:396,bottom:359,width:380,height:110});
  app.window.innerWidth = 812; app.window.innerHeight = 375; app.listeners.resize();
  app.assertAccessible(); assert.equal(app.run('vortices.length'), 1);
});

test('keyboard can move, add both directions, select and remove without trapping Tab', () => {
  const app = fixture(); app.run('vortices=[]'); app.elements.flow.focus();
  assert(app.run('cursor.visible'));
  const x = app.run('cursor.x'); app.key('ArrowRight'); assert.equal(app.run('cursor.x'), x + 16);
  app.key('ArrowLeft', { shiftKey:true }); assert.equal(app.run('cursor.x'), x + 12);
  app.key('Enter'); assert.equal(app.run('vortices.length'), 1); assert.equal(app.run('vortices[0].direction'), 1);
  app.key('Enter', { repeat:true }); assert.equal(app.run('vortices.length'), 1);
  app.key('ArrowRight'); app.key('ArrowRight'); app.key('c'); app.key('Enter');
  assert.equal(app.run('vortices.length'), 2); assert.equal(app.run('vortices[1].direction'), -1);
  app.key('n'); assert.equal(app.run('cursor.selected === vortices[0]'), true);
  app.key('Delete'); assert.equal(app.run('vortices.length'), 1);
  app.key('n'); app.key('Delete'); assert.equal(app.run('vortices.length'), 0);
  assert(!app.key('Tab').prevented); assert(!app.key('c', { metaKey:true }).prevented);
  app.elements.pause.focus(); assert(!app.run('cursor.visible'));
  assert.match(html, /id="flow" tabindex="0" role="application"/);
});

test('mouse directions, touch choice, deletion and visible limit feedback', () => {
  const app = fixture(); app.run('vortices=[]');
  app.click(600,300); app.click(650,300,2);
  app.elements.counterclockwise.emit('click'); app.click(700,300,0,'touch');
  assert.equal(app.run('vortices.map(v=>v.direction).join()'), '1,-1,-1');
  app.click(600,300); assert.equal(app.run('vortices.length'), 2);
  for(let y=150;y<=450;y+=50) for(let x=450;x<=1000;x+=50) app.click(x,y);
  // Some clicks remove existing centers; fill remaining slots through unoccupied positions.
  for(let y=170;y<=470;y+=50) for(let x=470;x<=1020;x+=50) if(app.run('vortices.length')<24) app.click(x,y);
  assert.equal(app.run('vortices.length'), 24);
  assert.equal(app.elements.count.textContent, '24 / 24');
  app.click(1100,500);
  assert.match(app.elements.announcement.textContent, /Limit reached/);
  assert.equal(app.elements.announcement.dataset.warning, 'true');
  assert.match(html, /class="feedback" id="announcement" role="status"/);
  const center=app.run('({x:vortices[0].x,y:vortices[0].y})'); app.click(center.x,center.y);
  assert.equal(app.elements.count.textContent, '23 / 24'); assert.equal(app.elements.announcement.dataset.warning, 'false');
});

test('pause, hidden-tab suspension and reduced-motion start retain correct animation lifecycle', () => {
  const app=fixture(375,667,true); assert.equal(app.frames.size,0);
  app.elements.pause.emit('click'); assert.equal(app.frames.size,1);
  app.document.hidden=true; app.listeners.visibilitychange(); assert.equal(app.frames.size,0);
  app.document.hidden=false; app.listeners.visibilitychange(); assert.equal(app.frames.size,1);
  app.elements.pause.emit('click'); assert.equal(app.frames.size,0);
  app.elements.reset.emit('click'); assert.equal(app.frames.size,0); assert.equal(app.run('vortices.length'),2);
});
