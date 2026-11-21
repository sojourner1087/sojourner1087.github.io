const colors = { w:'#ffeccc', l:'#ffbc83', o:'#fb7349', r:'#a74248', b:'#192b43', m:'#80dfcf', t:'#3c8291', v:'#9488be', g:'#667581' };
const art = {
  ship: [
    '....ww....','....ww....','...woow...','...wmow...','..owmmwo..','..owttwo..',
    '.oowbbwoo.','oowwwwwwoo','rrborr obrr'.replace(' ',''),'.b......b.'
  ],
  scout: [
    '..r.....r..','.roorrroor.','oorowwworoo','..rwmwmwr..','...rtttr...',
    '...rroorr..','....r.r....'
  ],
  flanker: [
    '...v...v...','..vvb.bvv..','.vvvwwbvvv.','vvtwmmmtvvv',
    '.vbbtmtbbv.','..v.bb..v..','....vvv....'
  ],
  rock: [
    '...gggg....','..gwwgggg..','.gwggbbggg.','ggggbbgtggg','ggttgggggbg',
    '.ggttggbbbg','.bggggbbbg.','..bbbggbg..','....bbb....'
  ],
  letter: ['wwwwwww','otwwwto','wotwtow','wwotoww','wwwwwww'],
  boss: [
    '....rr.........rr....','...rwwrrrrrrrrrwwr...','..rowwwwbbbbbwwwwor..',
    '.rowwtttwwwwwtttwwor.','rrwttwwwooooowwwttwrr','rowwwbbwororrowbbwwwor',
    'bbbrrbbwororrowbbrrbbb','..brrbbwooooowbbrrb..','..b..bbwwwwwbb..b....',
    '.....rrbbrbbrr.......'
  ]
};
const spriteCache = new Map();
function sprite(ctx, name, x, y, size) {
  let canvas = spriteCache.get(name);
  if (!canvas) {
    const rows = art[name];
    canvas = document.createElement('canvas');
    canvas.width = Math.max(...rows.map(row => row.length)); canvas.height = rows.length;
    const image = canvas.getContext('2d');
    rows.forEach((row, r) => [...row].forEach((color, c) => {
      if (!colors[color]) return;
      image.fillStyle = colors[color]; image.fillRect(c, r, 1, 1);
    }));
    spriteCache.set(name, canvas);
  }
  ctx.drawImage(canvas, Math.round(x - canvas.width * size / 2), Math.round(y - canvas.height * size / 2),
    canvas.width * size, canvas.height * size);
}

const stars = Array.from({length: 113}, (_, i) => ({
  x: (i * 107 + i * i * 13) % 359, y: (i * 179 + i * i * 5) % 641,
  layer: 1 + (i % 3)
}));

function line(ctx, x, y, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
}

function warningLine(ctx, e) {
  const endY = e.vy > 0 ? 660 : e.y;
  ctx.strokeStyle = 'rgba(255,157,112,.52)';
  ctx.setLineDash([3, 8]); line(ctx, e.x, e.y, e.x + (endY - e.y) * e.vx / e.vy, endY);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffe2a6'; ctx.fillRect(e.x - 2, Math.max(4, e.y - 2), 4, 4);
}

function drawNova(ctx, e) {
  const left = e.x - e.gap / 2, right = e.x + e.gap / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, left, 640); ctx.rect(right, 0, 360 - right, 640); ctx.clip();
  ctx.fillStyle = e.delay ? 'rgba(234,112,75,.13)' : 'rgba(255,171,117,.84)';
  ctx.fillRect(0, 0, 360, 640);
  ctx.strokeStyle = e.delay ? '#f68b6050' : '#ffe9bd';
  for (let x = -640; x < 380; x += 18) line(ctx, x, 640, x + 640, 0);
  ctx.restore();
  ctx.strokeStyle = '#ffdc9d'; ctx.lineWidth = 2;
  line(ctx, left, 0, left, 640); line(ctx, right, 0, right, 640); ctx.lineWidth = 1;
  ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffefbf';
  ctx.fillText(e.delay ? 'NOVA ' + (e.delay / 60).toFixed(1) : 'NOVA', e.x, 460);
}

function drawWell(ctx, e, tick) {
  ctx.save();
  if (e.delay) {
    ctx.strokeStyle = '#c5aee485';
    ctx.setLineDash([3, 7]);
    for (const x of [e.x - e.radius, e.x + e.radius]) line(ctx, x, 0, x, 640);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#dfc8ff';
    ctx.beginPath();
    ctx.moveTo(e.x - 6, 31);
    ctx.lineTo(e.x, 38);
    ctx.lineTo(e.x + 6, 31);
    ctx.stroke();
    ctx.fillStyle = '#dfc8ff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('BLACK HOLE', Math.max(37, Math.min(323, e.x)), 54);
  } else {
    ctx.fillStyle = '#080614';
    ctx.strokeStyle = '#ad96d8';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, e.radius - 6 - i * 6, e.radius - 12 - i * 6, tick / 70 + i, i, i + 3.8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawThreat(ctx, e, tick) {
  if (e.kind === 'nova') { drawNova(ctx, e); return; }
  if (e.kind === 'well') { drawWell(ctx, e, tick); return; }
  if (e.delay) {
    if (e.kind === 'flanker') {
      ctx.fillStyle = colors.v; ctx.font = 'bold 20px monospace';
      ctx.fillText(e.vx > 0 ? '»' : '«', e.vx > 0 ? 3 : 345, e.y + 5);
    } else warningLine(ctx, e);
    return;
  }
  if (e.kind === 'bolt') {
    ctx.fillStyle = '#e56f59';ctx.fillRect(Math.round(e.x)-2, Math.round(e.y)-4, 4, 9);
    ctx.fillStyle = '#ffe8ae';ctx.fillRect(Math.round(e.x)-1, Math.round(e.y), 2, 4);
    return;
  }
  sprite(ctx, e.kind, e.x, e.y, e.kind === 'rock' ? 2.6 : 2);
}

export function draw(ctx, s, effects) {
  const canvas = ctx.canvas;
  ctx.setTransform(canvas.width / 360, 0, 0, canvas.height / 640, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const sky = ctx.createLinearGradient(0, 0, 300, 640);
  sky.addColorStop(0,'#091220'); sky.addColorStop(.62,'#102433'); sky.addColorStop(1,'#122031');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 360, 640);
  ctx.save();
  ctx.strokeStyle = '#52948c18';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.ellipse(440, 160 + s.station * 13, 195+i*4, 88+i*2, -.38, .1, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  for (const p of stars) {
    const y = Math.floor((p.y + s.tick * p.layer * .14) % 640);
    ctx.fillStyle = ['','#617b88','#778e96','#aec5c0'][p.layer];
    ctx.fillRect(p.x, y, 1, p.layer === 3 ? 2 : 1);
  }
  ctx.fillStyle = '#8ca6a306'; ctx.fillRect(0,512,360,128);
  ctx.strokeStyle = '#9dc9ba55'; ctx.setLineDash([5,7]); line(ctx,0,512,360,512); ctx.setLineDash([]);
  for (const e of s.threats) drawThreat(ctx, e, s.tick);
  if (s.boss) {
    sprite(ctx,'boss',s.boss.x,s.boss.y,3);
    ctx.fillStyle='#49323c';ctx.fillRect(s.boss.x-30,s.boss.y-25,60,3);
    ctx.fillStyle=colors.o;ctx.fillRect(s.boss.x-30,s.boss.y-25,2*s.boss.hp,3);
  }
  for (const l of s.letters) sprite(ctx,'letter',l.x,l.y,2);
  for (const shot of s.shots) {
    ctx.fillStyle = colors.t;ctx.fillRect(Math.round(shot.x)-2,shot.y,4,9);
    ctx.fillStyle = '#c9fff1';ctx.fillRect(Math.round(shot.x)-1,shot.y-4,2,9);
  }
  ctx.fillStyle = s.tick % 8 < 4 ? colors.o : colors.l;
  ctx.fillRect(Math.round(s.x)-2,Math.round(s.y)+6,4, s.tick % 8 < 4 ? 8 : 5);
  sprite(ctx,'ship',s.x,s.y,1.6);
  if (s.shield) {
    ctx.strokeStyle=colors.m;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(s.x,s.y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }
  for (const p of effects) {
    const age = s.tick - p.tick;
    ctx.globalAlpha = Math.max(0,1-age/25);
    if (p.kind === 'letter') {
      ctx.font = 'bold 11px monospace';ctx.fillStyle = colors.m;ctx.fillText('+250',p.x,p.y-age*.5);
    } else if (p.kind === 'rock-hit') {
      ctx.globalAlpha = Math.max(0, 1 - age / 10);
      ctx.fillStyle = colors.l;
      ctx.fillRect(p.x - age, p.y + age * 0.4, 2, 2);
      ctx.fillRect(p.x + age, p.y + age * 0.4, 2, 2);
      ctx.fillStyle = colors.w;
      ctx.fillRect(p.x, p.y - age, 2, 2);
    } else {
      for (let i=0;i<8;i++) {
        ctx.fillStyle = i%2 ? colors.l : colors.o;
        ctx.fillRect(p.x + Math.cos(i * Math.PI / 4)*age, p.y + Math.sin(i * Math.PI / 4)*age, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
}
