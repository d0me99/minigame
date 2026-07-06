const canvasSharp = document.getElementById('gameCanvas');
const canvasBlur = document.getElementById('gameCanvasBlur');
const ctxSharp = canvasSharp.getContext('2d');
const ctxBlur = canvasBlur.getContext('2d');

const filmCounter = document.getElementById('filmCounter');
const scoreDisplay = document.getElementById('scoreDisplay');
const mistakeDisplay = document.getElementById('mistakeDisplay');
const healthBarInner = document.getElementById('healthBarInner');
const flashEl = document.getElementById('flash');
const warningEl = document.getElementById('warning');
const hazardWarningEl = document.getElementById('hazardWarning');
const hazardOverlay = document.getElementById('hazardOverlay');
const viewfinderWrap = document.getElementById('viewfinderWrap');
const duckIndicator = document.getElementById('duckIndicator');
const gameOverScreen = document.getElementById('gameOverScreen');
const gameOverText = document.getElementById('gameOverText');
const restartBtn = document.getElementById('restartBtn');

const W = 800;
const H = 400;

const MAX_FILM = 36;
const MAX_HEALTH = 100;
const GLOBAL_SPEED = 0.55;

let film, score, misses, health, people, banners, policeLines, frame, running;
let spawnInterval;
let cameraOffset = 0;
let keys = { left: false, right: false, down: false };
let isDucking = false;
let lineCounter = 0;

let hazard = null;
let nextGasIn = 0;
let nextCannonIn = 0;
let ambientHaze = [];

function rand(a, b) { return a + Math.random() * (b - a); }

function resetGame() {
  film = MAX_FILM;
  score = 0;
  misses = 0;
  health = MAX_HEALTH;
  people = [];
  banners = [];
  policeLines = [];
  frame = 0;
  running = true;
  spawnInterval = 105;
  cameraOffset = 0;
  hazard = null;
  nextGasIn = rand(260, 400);
  nextCannonIn = rand(650, 900);
  ambientHaze = [];
  for (let i = 0; i < 4; i++) {
    ambientHaze.push({ x: rand(0, W), y: rand(60, 160), r: rand(50, 110), speed: rand(0.05, 0.15), alpha: rand(0.03, 0.07) });
  }
  gameOverScreen.style.display = 'none';
  hazardOverlay.style.opacity = '0';
  updateHUD();
}

function updateHUD() {
  filmCounter.textContent = `FILM ${film}/${MAX_FILM}`;
  scoreDisplay.textContent = `INTERAKTIONEN ${score}`;
  mistakeDisplay.textContent = `FEHLSCHÜSSE ${misses}`;
  const pct = Math.max(0, health / MAX_HEALTH * 100);
  healthBarInner.style.width = pct + '%';
  if (pct < 30) healthBarInner.style.background = 'linear-gradient(90deg, #b71c1c, #e53935)';
  else if (pct < 60) healthBarInner.style.background = 'linear-gradient(90deg, #a1887f, #ffca28)';
  else healthBarInner.style.background = 'linear-gradient(90deg, #6b8f3a, #9ccc65)';
}

// ---------- Depth model (pseudo-3D) ----------

function depthToY(depth) { return 195 + depth * 135; }
function depthToScale(depth) { return 0.48 + depth * 0.78; }
function depthToSpeed(depth) { return (0.42 + depth * 0.55) * GLOBAL_SPEED; }
function depthToParallax(depth) { return 0.08 + depth * 0.42; }

function makePerson(type, depth, xOverride) {
  return {
    type,
    depth,
    x: xOverride !== undefined ? xOverride : W + 60 + rand(0, 60),
    y: depthToY(depth),
    scale: depthToScale(depth),
    speed: depthToSpeed(depth),
    parallax: depthToParallax(depth),
    hue: type === 'demonstrant' ? Math.floor(rand(0, 360)) : Math.floor(rand(25, 55)),
    lineId: null,
    spraying: 0,
    gasParticles: null,
    fleeing: false,
    photographed: false,
    fading: false,
    fadeAlpha: 1
  };
}

function renderX(p) { return p.x - cameraOffset * p.parallax; }

function spawnEntity() {
  const roll = Math.random();
  const depth = rand(0.1, 0.95);

  if (roll < 0.26) {
    people.push(makePerson('passant', depth));
  } else if (roll < 0.45) {
    people.push(makePerson('demonstrant', depth));
  } else if (roll < 0.66) {
    const count = 3 + Math.floor(rand(0, 2));
    const hue = Math.floor(rand(0, 360));
    const members = [];
    for (let i = 0; i < count; i++) {
      const p = makePerson('demonstrant', depth, W + 60 + i * 42 * depthToScale(depth));
      p.hue = hue + rand(-12, 12);
      members.push(p);
      people.push(p);
    }
    banners.push({ members, hue });
  } else if (roll < 0.8) {
    people.push(makePerson('police', depth));
  } else {
    const count = 3 + Math.floor(rand(0, 2));
    const id = 'line' + (lineCounter++);
    const members = [];
    for (let i = 0; i < count; i++) {
      const p = makePerson('police', depth, W + 60 + i * 48 * depthToScale(depth));
      p.lineId = id;
      p.speed *= 0.55;
      members.push(p);
      people.push(p);
    }
    policeLines.push({ id, members, lastFire: -99999 });
  }
}

// ---------- Background ----------

function drawBackground(ctx) {
  const bgOffset1 = cameraOffset * 0.04;
  const bgOffset2 = cameraOffset * 0.14;
  const bgOffset3 = cameraOffset * 0.5;

  const sky = ctx.createLinearGradient(0, 0, 0, 190);
  sky.addColorStop(0, '#7c93aa');
  sky.addColorStop(1, '#9fb0be');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 190);

  ctx.save();
  ctx.translate(-bgOffset1, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(140, 40, 60, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(560, 30, 80, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(-bgOffset2, 0);

  ctx.fillStyle = '#6b7a86';
  ctx.fillRect(0, 95, 260, 100);
  ctx.fillRect(540, 90, 260, 105);

  ctx.fillStyle = '#7a3226';
  ctx.fillRect(260, 60, 280, 140);
  ctx.fillStyle = '#5c261b';
  for (let i = 0; i < 5; i++) ctx.fillRect(280 + i * 50, 90, 24, 60);
  ctx.fillStyle = '#7a3226';
  ctx.beginPath();
  ctx.moveTo(380, 20); ctx.lineTo(420, 60); ctx.lineTo(340, 60);
  ctx.closePath(); ctx.fill();

  const sway = Math.sin(frame * 0.02) * 3;
  drawFlag(ctx, 60, 70, 60, 80, sway);
  drawFlag(ctx, 680, 70, 60, 80, -sway);

  ctx.restore();

  ambientHaze.forEach(h => {
    h.x -= h.speed;
    if (h.x < -150) h.x = W + 150;
    ctx.save();
    ctx.translate(-bgOffset2, 0);
    ctx.fillStyle = `rgba(220,225,215,${h.alpha})`;
    ctx.beginPath();
    ctx.ellipse(h.x, h.y, h.r, h.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.fillStyle = '#87837a';
  ctx.fillRect(0, 190, W, H - 190);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (let x = -60; x < W + 60; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x - bgOffset3 * 2, 190);
    ctx.lineTo(x - 20 - bgOffset3 * 2, H);
    ctx.stroke();
  }
}

function drawFlag(ctx, cx, topY, w, h, sway) {
  ctx.save();
  ctx.translate(cx, topY);
  ctx.transform(1, 0, sway * 0.01, 1, 0, 0);
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(0, 0, w, h);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w / 2, 24);
  ctx.lineTo(w / 2, h - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, 22, 10, Math.PI * 0.15, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
}

// ---------- Figures ----------

function applyDepthFilter(ctx, depth) {
  const sat = 0.55 + depth * 0.45;
  const bri = 0.82 + depth * 0.18;
  ctx.filter = `saturate(${sat}) brightness(${bri})`;
}

function drawPolice(ctx, p) {
  const rx = renderX(p);
  ctx.save();
  applyDepthFilter(ctx, p.depth);
  ctx.globalAlpha = p.fadeAlpha;
  ctx.translate(rx, p.y);
  ctx.scale(p.scale, p.scale);

  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-6, 40); ctx.lineTo(-8, 62);
  ctx.moveTo(6, 40); ctx.lineTo(8, 62);
  ctx.stroke();

  ctx.fillStyle = '#151b2e';
  ctx.fillRect(-16, 8, 32, 34);
  ctx.fillStyle = '#ffca28';
  ctx.fillRect(-16, 18, 32, 4);

  ctx.fillStyle = 'rgba(200, 215, 225, 0.55)';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, 44);
  ctx.lineTo(-24, 4);
  ctx.quadraticCurveTo(-24, -8, -12, -8);
  ctx.lineTo(-12, 44);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 20); ctx.lineTo(24, 34);
  ctx.stroke();

  ctx.fillStyle = '#10131f';
  ctx.beginPath();
  ctx.arc(0, -4, 14, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-14, -4, 28, 10);
  ctx.fillStyle = 'rgba(90, 120, 140, 0.75)';
  ctx.fillRect(-11, -2, 22, 7);

  ctx.restore();

  if (p.spraying > 0) drawGasSpray(ctx, p);
}

function drawDemonstrant(ctx, p) {
  const rx = renderX(p);
  ctx.save();
  applyDepthFilter(ctx, p.depth);
  ctx.globalAlpha = p.fadeAlpha;
  ctx.translate(rx, p.y);
  ctx.scale(p.scale, p.scale);

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, 40); ctx.lineTo(-8, 60);
  ctx.moveTo(6, 40); ctx.lineTo(8, 60);
  ctx.stroke();

  ctx.fillStyle = `hsl(${p.hue}, 55%, 50%)`;
  ctx.fillRect(-13, 10, 26, 30);

  ctx.fillStyle = '#e0b090';
  ctx.beginPath();
  ctx.arc(0, -2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3e2723';
  ctx.beginPath();
  ctx.arc(0, -7, 12, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}

function drawPassant(ctx, p) {
  const rx = renderX(p);
  ctx.save();
  applyDepthFilter(ctx, p.depth);
  ctx.globalAlpha = p.fadeAlpha * 0.9;
  ctx.translate(rx, p.y);
  ctx.scale(p.scale, p.scale);

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, 40); ctx.lineTo(-8, 58);
  ctx.moveTo(6, 40); ctx.lineTo(8, 58);
  ctx.stroke();

  ctx.fillStyle = `hsl(${p.hue}, 18%, 42%)`;
  ctx.fillRect(-12, 10, 24, 28);

  ctx.fillStyle = '#cbab8a';
  ctx.beginPath();
  ctx.arc(0, -2, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4038';
  ctx.beginPath();
  ctx.arc(0, -6, 11, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}

function getBoundingBox(p) {
  const rx = renderX(p);
  const w = 34 * p.scale;
  const h = 62 * p.scale;
  return { x: rx - w / 2, y: p.y - 22 * p.scale, w, h };
}

function unionBox(a, b) {
  const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w), y2 = Math.max(a.y + a.h, b.y + b.h);
  const m = 16;
  return { x: x1 - m, y: y1 - m, w: (x2 - x1) + m * 2, h: (y2 - y1) + m * 2 };
}

function drawBanner(ctx, b) {
  const alive = b.members.filter(m => m.fadeAlpha > 0.05);
  if (alive.length < 2) return;
  const xs = alive.map(m => renderX(m));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const avgY = alive.reduce((s, m) => s + m.y, 0) / alive.length;
  const avgScale = alive.reduce((s, m) => s + m.scale, 0) / alive.length;
  const topY = avgY - 34 * avgScale;

  ctx.save();
  ctx.globalAlpha = Math.min(...alive.map(m => m.fadeAlpha));
  ctx.fillStyle = `hsl(${b.hue}, 50%, 42%)`;
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.fillRect(minX - 6, topY - 16 * avgScale, (maxX - minX) + 12, 20 * avgScale);
  ctx.strokeRect(minX - 6, topY - 16 * avgScale, (maxX - minX) + 12, 20 * avgScale);
  ctx.restore();
}

// ---------- Gas spray ----------

function drawGasSpray(ctx, source) {
  if (!source.gasParticles) {
    source.gasParticles = [];
    for (let i = 0; i < 8; i++) {
      source.gasParticles.push({ ox: rand(-20, 30), oy: rand(-30, 5), r: rand(10, 20) });
    }
  }
  const cfg = HAZARD_CFG.gas;
  const total = cfg.warnTime + cfg.activeTime;
  const progress = 1 - source.spraying / total;
  const rx = renderX(source);
  ctx.save();
  ctx.globalAlpha = 0.35 * Math.min(1, progress * 2);
  ctx.fillStyle = '#7cb342';
  source.gasParticles.forEach(gp => {
    const growR = gp.r * (0.4 + progress * 1.6) * source.scale;
    ctx.beginPath();
    ctx.ellipse(rx + gp.ox * source.scale, source.y - 10 + gp.oy * source.scale, growR, growR * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---------- Water cannon vehicle ----------

function spawnWaterCannonVehicle() {
  return {
    x: W + 140,
    parkX: rand(420, 520),
    y: depthToY(0.95),
    scale: depthToScale(0.95) * 1.4,
    state: 'in'
  };
}

function updateVehicle(v, hz) {
  if (v.state === 'in') {
    v.x -= 3.2;
    if (v.x <= v.parkX) { v.x = v.parkX; v.state = 'spraying'; }
  } else if (v.state === 'out') {
    v.x -= 5;
  }
  if (hz.phase === 'active' && v.state === 'spraying' && hz.timer <= 0) {
    v.state = 'out';
  }
}

function drawWaterCannon(ctx, v) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.scale(v.scale, v.scale);

  ctx.fillStyle = '#37474f';
  ctx.fillRect(-70, -40, 140, 55);
  ctx.fillStyle = '#455a64';
  ctx.fillRect(-70, -65, 55, 30);
  ctx.fillStyle = 'rgba(160,190,205,0.6)';
  ctx.fillRect(-62, -58, 40, 18);

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(-45, 20, 14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(40, 20, 14, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#263238';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, -40); ctx.lineTo(-60, -60);
  ctx.stroke();

  if (v.state === 'spraying') {
    const wob = Math.sin(frame * 0.25) * 14;
    ctx.strokeStyle = 'rgba(150,200,230,0.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-60, -60);
    ctx.quadraticCurveTo(-160, -70 + wob, -260, 10 + wob * 1.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(180,215,235,0.5)';
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const px = -60 - t * 200 + rand(-8, 8);
      const py = -60 + t * 70 + wob * t + rand(-6, 6);
      ctx.beginPath();
      ctx.arc(px, py, rand(3, 7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ---------- Hazards ----------

const HAZARD_CFG = {
  gas: { warnTime: 50, activeTime: 170, dmg: 0.28, color: '150,190,90', label: 'ACHTUNG: TRAENENGAS' },
  rubber: { warnTime: 35, activeTime: 80, dmg: 0.85, color: '210,90,60', label: 'ACHTUNG: GUMMISCHROT' },
  cannon: { warnTime: 60, activeTime: 190, dmg: 0.32, color: '70,140,200', label: 'ACHTUNG: WASSERWERFER' }
};

function findVisiblePolice() {
  const candidates = people.filter(p => p.type === 'police' && !p.fading && !p.spraying);
  const onScreen = candidates.filter(p => { const rx = renderX(p); return rx > 40 && rx < W - 40; });
  const pool = onScreen.length ? onScreen : candidates;
  return pool.length ? pool[Math.floor(rand(0, pool.length))] : null;
}

function findRubberTrigger() {
  for (const line of policeLines) {
    if (frame - line.lastFire < 480) continue;
    const alive = line.members.filter(m => !m.fading);
    if (!alive.length) continue;
    for (const d of people) {
      if (d.type !== 'demonstrant' || d.fading || d.fleeing) continue;
      for (const m of alive) {
        if (Math.abs(d.depth - m.depth) > 0.15) continue;
        const dist = Math.abs(renderX(d) - renderX(m));
        if (dist < 60 * m.scale) return { line, target: d };
      }
    }
  }
  return null;
}

function showHazardWarning(text) {
  hazardWarningEl.textContent = text;
  hazardWarningEl.style.transition = 'none';
  hazardWarningEl.style.opacity = '1';
}

function startHazard(type, data) {
  const cfg = HAZARD_CFG[type];
  hazard = { type, phase: 'warning', timer: cfg.warnTime, data };
  showHazardWarning(cfg.label);
  if (type === 'rubber') {
    data.line.lastFire = frame;
    data.target.fleeing = true;
  }
  if (type === 'gas') {
    data.source.spraying = cfg.warnTime + cfg.activeTime;
  }
  if (type === 'cannon') {
    hazard.vehicle = spawnWaterCannonVehicle();
  }
}

function maybeStartHazard() {
  if (hazard) return;

  const rubberTrigger = findRubberTrigger();
  if (rubberTrigger) { startHazard('rubber', rubberTrigger); return; }

  nextGasIn--;
  if (nextGasIn <= 0) {
    const source = findVisiblePolice();
    if (source) { startHazard('gas', { source }); return; }
    nextGasIn = 40;
  }

  nextCannonIn--;
  if (nextCannonIn <= 0) {
    startHazard('cannon', {});
  }
}

function updateHazard() {
  if (!hazard) return;
  hazard.timer--;

  if (hazard.type === 'cannon' && hazard.vehicle) {
    updateVehicle(hazard.vehicle, hazard);
  }

  if (hazard.phase === 'warning') {
    if (hazard.timer <= 0) {
      hazard.phase = 'active';
      hazard.timer = HAZARD_CFG[hazard.type].activeTime;
      hazardWarningEl.style.transition = 'opacity 0.4s ease';
      hazardWarningEl.style.opacity = '0';
    }
  } else if (hazard.phase === 'active') {
    const cfg = HAZARD_CFG[hazard.type];
    const intensity = isDucking ? 0.1 : 0.38;
    hazardOverlay.style.background = `rgba(${cfg.color}, 1)`;
    hazardOverlay.style.opacity = String(intensity);

    if (!isDucking) {
      health -= cfg.dmg;
      if (health < 0) health = 0;
    }

    if (hazard.type === 'rubber' && hazard.data.target) {
      hazard.data.target.speed = Math.abs(hazard.data.target.speed) + 2.5;
    }

    if (hazard.timer <= 0) {
      if (hazard.type === 'gas') hazard.data.source.spraying = 0;
      if (hazard.type === 'rubber' && hazard.data.target) hazard.data.target.fading = true;

      if (hazard.type === 'cannon' && hazard.vehicle && hazard.vehicle.state !== 'out') {
        return; // wait for vehicle to leave before clearing
      }

      hazard = null;
      hazardOverlay.style.opacity = '0';
      nextGasIn = rand(500, 750);
      nextCannonIn = rand(900, 1250);
    }
  }

  if (hazard && hazard.type === 'cannon' && hazard.vehicle && hazard.vehicle.state === 'out' && hazard.vehicle.x < -180) {
    hazard = null;
    hazardOverlay.style.opacity = '0';
    nextGasIn = rand(500, 750);
    nextCannonIn = rand(900, 1250);
  }
}

function drawHazardExtras(ctx) {
  if (!hazard) return;

  if (hazard.type === 'cannon' && hazard.vehicle) {
    drawWaterCannon(ctx, hazard.vehicle);
  }

  if (hazard.type === 'rubber' && hazard.phase === 'active') {
    const line = hazard.data.line;
    const target = hazard.data.target;
    const alive = line.members.filter(m => !m.fading);
    if (frame % 10 < 5) {
      ctx.save();
      ctx.fillStyle = '#ffe082';
      alive.forEach(m => {
        const rx = renderX(m);
        ctx.beginPath();
        ctx.arc(rx - 26 * m.scale, m.y - 4 * m.scale, 5 * m.scale, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
    if (target && !target.fading) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 220, 130, 0.7)';
      ctx.lineWidth = 2;
      alive.forEach(m => {
        ctx.beginPath();
        ctx.moveTo(renderX(m) - 26 * m.scale, m.y - 6 * m.scale);
        ctx.lineTo(renderX(target), target.y - 10 * target.scale);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
}

// ---------- Input ----------

document.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft') { keys.left = true; e.preventDefault(); }
  if (e.code === 'ArrowRight') { keys.right = true; e.preventDefault(); }
  if (e.code === 'ArrowDown') { keys.down = true; e.preventDefault(); }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'ArrowRight') keys.right = false;
  if (e.code === 'ArrowDown') keys.down = false;
});

function triggerFlash() {
  flashEl.style.transition = 'none';
  flashEl.style.opacity = '0.85';
  requestAnimationFrame(() => {
    flashEl.style.transition = 'opacity 0.35s ease';
    flashEl.style.opacity = '0';
  });
}

function showWarning(text) {
  warningEl.textContent = text;
  warningEl.style.transition = 'none';
  warningEl.style.opacity = '1';
  requestAnimationFrame(() => {
    warningEl.style.transition = 'opacity 0.8s ease';
    warningEl.style.opacity = '0';
  });
}

function findInteractionPairs() {
  const pairs = [];
  const cops = people.filter(p => p.type === 'police' && !p.fading);
  const demos = people.filter(p => p.type === 'demonstrant' && !p.fading);
  cops.forEach(c => {
    demos.forEach(d => {
      if (Math.abs(c.depth - d.depth) > 0.22) return;
      const dist = Math.abs(renderX(c) - renderX(d));
      const thresh = 62 * ((c.scale + d.scale) / 2);
      if (dist < thresh) pairs.push({ c, d });
    });
  });
  return pairs;
}

function handleShot(clientX, clientY) {
  if (!running || film <= 0 || isDucking) return;

  const rect = canvasSharp.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  film--;
  triggerFlash();

  const pairs = findInteractionPairs();
  let matched = null;
  let bestArea = Infinity;
  pairs.forEach(pr => {
    const box = unionBox(getBoundingBox(pr.c), getBoundingBox(pr.d));
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      const area = box.w * box.h;
      if (area < bestArea) { bestArea = area; matched = pr; }
    }
  });

  if (matched) {
    matched.c.photographed = true; matched.c.fading = true;
    matched.d.photographed = true; matched.d.fading = true;
    const bonus = hazard && hazard.phase === 'active';
    score += bonus ? 2 : 1;
    showWarning(bonus ? 'Starkes Bild!' : 'Gutes Foto!');
  } else {
    misses++;
  }

  updateHUD();
  if (film <= 0) endGame('Film voll!');
}

canvasSharp.addEventListener('mousedown', (e) => handleShot(e.clientX, e.clientY));
canvasSharp.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  handleShot(t.clientX, t.clientY);
});

restartBtn.addEventListener('click', resetGame);

function endGame(reason) {
  running = false;
  gameOverText.innerHTML = `${reason}<br>Interaktionen fotografiert: ${score}<br>Fehlschüsse: ${misses}`;
  gameOverScreen.style.display = 'flex';
}

// ---------- Main loop ----------

function update() {
  if (!running) return;
  frame++;

  if (keys.left) cameraOffset = Math.max(-120, cameraOffset - 2);
  if (keys.right) cameraOffset = Math.min(120, cameraOffset + 2);

  isDucking = keys.down;
  viewfinderWrap.classList.toggle('ducking', isDucking);
  duckIndicator.classList.toggle('active', isDucking);

  if (frame % Math.max(60, spawnInterval) === 0) {
    spawnEntity();
    if (spawnInterval > 65) spawnInterval -= 1;
  }

  people.forEach(p => {
    p.x -= p.speed;
    if (p.spraying > 0) p.spraying--;
    if (p.fading) p.fadeAlpha -= 0.05;
  });
  people = people.filter(p => p.x > -100 && p.fadeAlpha > 0);
  banners = banners.filter(b => b.members.some(m => people.includes(m) && m.fadeAlpha > 0.05));
  policeLines = policeLines.filter(l => l.members.some(m => people.includes(m)));

  maybeStartHazard();
  updateHazard();

  if (!hazard && health < MAX_HEALTH) health = Math.min(MAX_HEALTH, health + 0.04);

  updateHUD();
  if (health <= 0) endGame('Du musstest den Platz verlassen.');
}

function draw(ctx) {
  ctx.clearRect(0, 0, W, H);
  ctx.filter = 'none';

  const wobbleX = Math.sin(frame * 0.02) * 1.4;
  const wobbleY = Math.cos(frame * 0.017) * 1.1;
  ctx.save();
  ctx.translate(wobbleX, wobbleY);

  ctx.filter = 'saturate(0.85) contrast(1.08) brightness(0.97)';
  drawBackground(ctx);

  banners.forEach(b => drawBanner(ctx, b));

  people
    .slice()
    .sort((a, b) => a.depth - b.depth)
    .forEach(p => {
      if (p.type === 'police') drawPolice(ctx, p);
      else if (p.type === 'demonstrant') drawDemonstrant(ctx, p);
      else drawPassant(ctx, p);
    });

  ctx.filter = 'none';
  drawHazardExtras(ctx);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(rand(0, W), rand(0, H), 1, 1);
  }

  ctx.restore();
}

function loop() {
  update();
  draw(ctxSharp);
  draw(ctxBlur);
  requestAnimationFrame(loop);
}

resetGame();
loop();
