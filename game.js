const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
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

const W = canvas.width;
const H = canvas.height;

const MAX_FILM = 36;
const MAX_HEALTH = 100;

let film, score, mistakes, health, people, banners, frame, running;
let spawnInterval;
let cameraOffset = 0;
let keys = { left: false, right: false, down: false };
let isDucking = false;

let hazard = null; // {type, phase:'warning'|'active', timer}
let nextHazardIn = 0;

function resetGame() {
  film = MAX_FILM;
  score = 0;
  mistakes = 0;
  health = MAX_HEALTH;
  people = [];
  banners = [];
  frame = 0;
  running = true;
  spawnInterval = 70;
  cameraOffset = 0;
  hazard = null;
  nextHazardIn = 300 + Math.random() * 300;
  gameOverScreen.style.display = 'none';
  hazardOverlay.style.background = 'transparent';
  hazardOverlay.style.opacity = '0';
  updateHUD();
}

function updateHUD() {
  filmCounter.textContent = `FILM ${film}/${MAX_FILM}`;
  scoreDisplay.textContent = `POLIZEI ${score}`;
  mistakeDisplay.textContent = `FEHLER ${mistakes}`;
  const pct = Math.max(0, health / MAX_HEALTH * 100);
  healthBarInner.style.width = pct + '%';
  if (pct < 30) {
    healthBarInner.style.background = 'linear-gradient(90deg, #b71c1c, #e53935)';
  } else if (pct < 60) {
    healthBarInner.style.background = 'linear-gradient(90deg, #a1887f, #ffca28)';
  } else {
    healthBarInner.style.background = 'linear-gradient(90deg, #6b8f3a, #9ccc65)';
  }
}

// ---------- Spawning ----------

function makePerson(isPolice, lane, xOverride) {
  const scale = 0.7 + lane * 0.22;
  const baseY = 230 + lane * 45;
  return {
    x: xOverride !== undefined ? xOverride : W + 40,
    y: baseY,
    scale: scale,
    parallax: 0.25 + lane * 0.18,
    speed: (1.1 + Math.random() * 1.0) * (0.7 + lane * 0.3),
    isPolice: isPolice,
    hue: isPolice ? 0 : Math.floor(Math.random() * 360),
    photographed: false,
    fading: false,
    fadeAlpha: 1
  };
}

function spawnEntity() {
  const roll = Math.random();
  const lane = Math.floor(Math.random() * 3);

  if (roll < 0.22) {
    // Polizeikette (mehrere in Vollmontur, Schulter an Schulter)
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const p = makePerson(true, lane, W + 40 + i * 48);
      p.speed *= 0.6;
      people.push(p);
    }
  } else if (roll < 0.5) {
    // einzelne/r Polizist*in
    people.push(makePerson(true, lane));
  } else if (roll < 0.72) {
    // Demo-Gruppe mit Banner
    const count = 3 + Math.floor(Math.random() * 2);
    const members = [];
    const hue = Math.floor(Math.random() * 360);
    for (let i = 0; i < count; i++) {
      const p = makePerson(false, lane, W + 40 + i * 42);
      p.hue = hue + (Math.random() * 30 - 15);
      members.push(p);
      people.push(p);
    }
    banners.push({ members: members, hue: hue });
  } else {
    // einzelne demonstrierende Person
    people.push(makePerson(false, lane));
  }
}

// ---------- Background ----------

function drawBackground() {
  const bgOffset = cameraOffset * 0.12;

  ctx.fillStyle = '#8fa3b8';
  ctx.fillRect(0, 0, W, 190);

  ctx.save();
  ctx.translate(-bgOffset, 0);

  ctx.fillStyle = '#7a3226';
  ctx.fillRect(260, 60, 280, 140);
  ctx.fillStyle = '#5c261b';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(280 + i * 50, 90, 24, 60);
  }
  ctx.fillStyle = '#7a3226';
  ctx.beginPath();
  ctx.moveTo(380, 20);
  ctx.lineTo(420, 60);
  ctx.lineTo(340, 60);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(60, 70, 60, 80);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(60, 70, 60, 80);
  drawBaslerstab(90, 80, 60);

  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(680, 70, 60, 80);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(680, 70, 60, 80);
  drawBaslerstab(710, 80, 60);

  ctx.restore();

  ctx.fillStyle = '#83807a';
  ctx.fillRect(0, 190, W, H - 190);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  for (let x = -40; x < W + 40; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x - bgOffset * 2, 190);
    ctx.lineTo(x - 20 - bgOffset * 2, H);
    ctx.stroke();
  }
}

function drawBaslerstab(cx, topY, height) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, topY + 14);
  ctx.lineTo(cx, topY + height);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, topY + 12, 10, Math.PI * 0.15, Math.PI * 1.75);
  ctx.stroke();
}

// ---------- People ----------

function renderX(p) {
  return p.x - cameraOffset * p.parallax;
}

function drawPolice(p) {
  const rx = renderX(p);
  ctx.save();
  ctx.globalAlpha = p.fadeAlpha;
  ctx.translate(rx, p.y);
  ctx.scale(p.scale, p.scale);

  // legs
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-6, 40); ctx.lineTo(-8, 62);
  ctx.moveTo(6, 40); ctx.lineTo(8, 62);
  ctx.stroke();

  // torso - tactical vest, bulkier
  ctx.fillStyle = '#151b2e';
  ctx.fillRect(-16, 8, 32, 34);
  ctx.fillStyle = '#ffca28';
  ctx.fillRect(-16, 18, 32, 4);

  // shield (round-top rectangle in front)
  ctx.fillStyle = 'rgba(200, 215, 225, 0.55)';
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-24, 44);
  ctx.lineTo(-24, 4);
  ctx.quadraticCurveTo(-24, -8, -12, -8);
  ctx.lineTo(-12, 44);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // baton
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, 20); ctx.lineTo(24, 34);
  ctx.stroke();

  // helmet with visor (no visible face)
  ctx.fillStyle = '#10131f';
  ctx.beginPath();
  ctx.arc(0, -4, 14, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-14, -4, 28, 10);
  ctx.fillStyle = 'rgba(90, 120, 140, 0.75)';
  ctx.fillRect(-11, -2, 22, 7);

  ctx.restore();
}

function drawDemonstrant(p) {
  const rx = renderX(p);
  ctx.save();
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

function getBoundingBox(p) {
  const rx = renderX(p);
  const w = 34 * p.scale;
  const h = 60 * p.scale;
  return { x: rx - w / 2, y: p.y - 20 * p.scale, w: w, h: h };
}

function drawBanner(b) {
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

// ---------- Hazards ----------

const HAZARD_TYPES = [
  { key: 'gas', label: 'ACHTUNG: TRAENENGAS', warnTime: 55, activeTime: 150, damagePerFrame: 0.35, color: '150, 190, 90' },
  { key: 'rubber', label: 'ACHTUNG: GUMMISCHROT', warnTime: 40, activeTime: 90, damagePerFrame: 0.7, color: '200, 90, 60' },
  { key: 'cannon', label: 'ACHTUNG: WASSERWERFER', warnTime: 55, activeTime: 130, damagePerFrame: 0.45, color: '70, 130, 190' }
];

function maybeStartHazard() {
  if (hazard) return;
  nextHazardIn--;
  if (nextHazardIn <= 0) {
    const type = HAZARD_TYPES[Math.floor(Math.random() * HAZARD_TYPES.length)];
    hazard = { type: type, phase: 'warning', timer: type.warnTime };
    hazardWarningEl.textContent = type.label;
    hazardWarningEl.style.transition = 'none';
    hazardWarningEl.style.opacity = '1';
  }
}

function updateHazard() {
  if (!hazard) return;
  hazard.timer--;

  if (hazard.phase === 'warning') {
    if (hazard.timer <= 0) {
      hazard.phase = 'active';
      hazard.timer = hazard.type.activeTime;
      hazardWarningEl.style.transition = 'opacity 0.4s ease';
      hazardWarningEl.style.opacity = '0';
    }
  } else if (hazard.phase === 'active') {
    const intensity = isDucking ? 0.12 : 0.4;
    hazardOverlay.style.background = `rgba(${hazard.type.color}, 1)`;
    hazardOverlay.style.opacity = String(intensity);

    if (!isDucking) {
      health -= hazard.type.damagePerFrame;
      if (health < 0) health = 0;
    }

    if (hazard.timer <= 0) {
      hazard = null;
      nextHazardIn = 400 + Math.random() * 400;
      hazardOverlay.style.opacity = '0';
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

function handleShot(clientX, clientY) {
  if (!running || film <= 0 || isDucking) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  film--;
  triggerFlash();

  let hitPerson = null;
  for (let i = people.length - 1; i >= 0; i--) {
    const p = people[i];
    if (p.photographed) continue;
    const box = getBoundingBox(p);
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      hitPerson = p;
      break;
    }
  }

  if (hitPerson) {
    hitPerson.photographed = true;
    hitPerson.fading = true;
    if (hitPerson.isPolice) {
      score++;
    } else {
      mistakes++;
      showWarning('Nicht fotografieren!');
    }
  }

  updateHUD();

  if (film <= 0) endGame('Film voll!');
}

canvas.addEventListener('mousedown', (e) => handleShot(e.clientX, e.clientY));
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  handleShot(t.clientX, t.clientY);
});

restartBtn.addEventListener('click', resetGame);

function endGame(reason) {
  running = false;
  gameOverText.innerHTML =
    `${reason}<br>Polizei fotografiert: ${score}<br>Fehlaufnahmen: ${mistakes}`;
  gameOverScreen.style.display = 'flex';
}

// ---------- Main loop ----------

function update() {
  if (!running) return;
  frame++;

  if (keys.left) cameraOffset = Math.max(-120, cameraOffset - 2.5);
  if (keys.right) cameraOffset = Math.min(120, cameraOffset + 2.5);

  isDucking = keys.down;
  viewfinderWrap.classList.toggle('ducking', isDucking);
  duckIndicator.classList.toggle('active', isDucking);

  if (frame % Math.max(28, spawnInterval) === 0) {
    spawnEntity();
    if (spawnInterval > 34) spawnInterval -= 1;
  }

  people.forEach(p => {
    p.x -= p.speed;
    if (p.fading) p.fadeAlpha -= 0.06;
  });
  people = people.filter(p => p.x > -80 && p.fadeAlpha > 0);
  banners = banners.filter(b => b.members.some(m => people.includes(m) && m.fadeAlpha > 0.05));

  maybeStartHazard();
  updateHazard();

  if (!hazard && health < MAX_HEALTH) {
    health = Math.min(MAX_HEALTH, health + 0.05);
  }

  updateHUD();

  if (health <= 0) endGame('Du musstest den Platz verlassen.');
}

function draw() {
  drawBackground();
  banners.forEach(drawBanner);
  people
    .slice()
    .sort((a, b) => a.scale - b.scale)
    .forEach(p => p.isPolice ? drawPolice(p) : drawDemonstrant(p));
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

resetGame();
loop();
