const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const filmCounter = document.getElementById('filmCounter');
const scoreDisplay = document.getElementById('scoreDisplay');
const mistakeDisplay = document.getElementById('mistakeDisplay');
const flashEl = document.getElementById('flash');
const warningEl = document.getElementById('warning');
const gameOverScreen = document.getElementById('gameOverScreen');
const gameOverText = document.getElementById('gameOverText');
const restartBtn = document.getElementById('restartBtn');

const W = canvas.width;
const H = canvas.height;

const MAX_FILM = 36;
let film = MAX_FILM;
let score = 0;
let mistakes = 0;
let people = [];
let frame = 0;
let running = true;
let spawnInterval = 70;

function resetGame() {
  film = MAX_FILM;
  score = 0;
  mistakes = 0;
  people = [];
  frame = 0;
  running = true;
  spawnInterval = 70;
  gameOverScreen.style.display = 'none';
  updateHUD();
}

function updateHUD() {
  filmCounter.textContent = `Film: ${film}/${MAX_FILM}`;
  scoreDisplay.textContent = `Polizei fotografiert: ${score}`;
  mistakeDisplay.textContent = `Fehlaufnahmen: ${mistakes}`;
}

function spawnPerson() {
  const isPolice = Math.random() < 0.32;
  const lane = Math.floor(Math.random() * 3); // 0 = back, 1 = mid, 2 = front
  const scale = 0.7 + lane * 0.22;
  const baseY = 230 + lane * 45;
  people.push({
    x: W + 40,
    y: baseY,
    scale: scale,
    speed: (1.1 + Math.random() * 1.0) * (0.7 + lane * 0.3),
    isPolice: isPolice,
    hue: isPolice ? 0 : Math.floor(Math.random() * 360),
    signOffset: Math.random() * 6 - 3,
    photographed: false,
    fading: false,
    fadeAlpha: 1
  });
}

function drawBackground() {
  // sky
  ctx.fillStyle = '#b0c4de';
  ctx.fillRect(0, 0, W, 190);

  // Rathaus silhouette (Basel Rathaus, stilisiert)
  ctx.fillStyle = '#8b3a2a';
  ctx.fillRect(260, 60, 280, 140);
  ctx.fillStyle = '#6e2c1e';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(280 + i * 50, 90, 24, 60);
  }
  ctx.fillStyle = '#8b3a2a';
  ctx.beginPath();
  ctx.moveTo(380, 20);
  ctx.lineTo(420, 60);
  ctx.lineTo(340, 60);
  ctx.closePath();
  ctx.fill();

  // Basler Stab Fahne
  ctx.fillStyle = '#fff';
  ctx.fillRect(60, 70, 60, 80);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(60, 70, 60, 80);
  drawBaslerstab(90, 80, 60);

  ctx.fillStyle = '#fff';
  ctx.fillRect(680, 70, 60, 80);
  ctx.strokeStyle = '#333';
  ctx.strokeRect(680, 70, 60, 80);
  drawBaslerstab(710, 80, 60);

  // ground (Marktplatz)
  ctx.fillStyle = '#9e9e93';
  ctx.fillRect(0, 190, W, H - 190);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let x = 0; x < W; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 190);
    ctx.lineTo(x - 20, H);
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

function drawPerson(p) {
  ctx.save();
  ctx.globalAlpha = p.fadeAlpha;
  ctx.translate(p.x, p.y);
  ctx.scale(p.scale, p.scale);

  // legs
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-6, 40);
  ctx.lineTo(-8, 60);
  ctx.moveTo(6, 40);
  ctx.lineTo(8, 60);
  ctx.stroke();

  if (p.isPolice) {
    // body
    ctx.fillStyle = '#1a2340';
    ctx.fillRect(-14, 10, 28, 32);
    // vest strap
    ctx.fillStyle = '#ffca28';
    ctx.fillRect(-14, 20, 28, 5);
    // head
    ctx.fillStyle = '#e0b090';
    ctx.beginPath();
    ctx.arc(0, -2, 12, 0, Math.PI * 2);
    ctx.fill();
    // helmet
    ctx.fillStyle = '#0d1330';
    ctx.beginPath();
    ctx.arc(0, -6, 13, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-13, -6, 26, 4);
  } else {
    // body - colorful casual clothing
    ctx.fillStyle = `hsl(${p.hue}, 55%, 50%)`;
    ctx.fillRect(-13, 10, 26, 30);
    // head
    ctx.fillStyle = '#e0b090';
    ctx.beginPath();
    ctx.arc(0, -2, 12, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.arc(0, -7, 12, Math.PI, 0);
    ctx.fill();
    // sign
    ctx.strokeStyle = '#6d4c41';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16 + p.signOffset, 10);
    ctx.lineTo(16 + p.signOffset, -20);
    ctx.stroke();
    ctx.fillStyle = `hsl(${(p.hue + 120) % 360}, 60%, 60%)`;
    ctx.fillRect(2 + p.signOffset, -34, 30, 18);
  }

  ctx.restore();
}

function getBoundingBox(p) {
  const w = 34 * p.scale;
  const h = 60 * p.scale;
  return {
    x: p.x - w / 2,
    y: p.y - 20 * p.scale,
    w: w,
    h: h
  };
}

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
  if (!running || film <= 0) return;

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

  if (film <= 0) {
    endGame();
  }
}

function endGame() {
  running = false;
  gameOverText.innerHTML =
    `Film voll!<br>Polizei fotografiert: ${score}<br>Fehlaufnahmen: ${mistakes}`;
  gameOverScreen.style.display = 'flex';
}

canvas.addEventListener('mousedown', (e) => handleShot(e.clientX, e.clientY));
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  handleShot(t.clientX, t.clientY);
});

restartBtn.addEventListener('click', resetGame);

function update() {
  if (!running) return;
  frame++;

  if (frame % Math.max(28, spawnInterval) === 0) {
    spawnPerson();
    if (spawnInterval > 32) spawnInterval -= 1;
  }

  people.forEach(p => {
    p.x -= p.speed;
    if (p.fading) {
      p.fadeAlpha -= 0.06;
    }
  });

  people = people.filter(p => p.x > -60 && p.fadeAlpha > 0);
}

function draw() {
  drawBackground();
  people
    .slice()
    .sort((a, b) => a.scale - b.scale)
    .forEach(drawPerson);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

updateHUD();
loop();
