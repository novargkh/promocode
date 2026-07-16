// ============================================================
// LUXEL Daily Quiz — Frontend Logic
// ============================================================

const API_BASE = '/api';
const QUIZ_SECONDS = 30;

let state = {
  screen: 'loading',
  questions: [],
  selectedAnswers: {},
  token: null,
  blockTimer: null,
  countdownTimer: null,
  quizTimer: null,
};

// ── Screen Manager ───────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  state.screen = name;
}

// ── API Helpers ──────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  showScreen('loading');
  try {
    const data = await apiFetch('/status');
    handleStatus(data);
  } catch (e) {
    console.error(e);
    showScreen('no-quiz');
  }
}

function handleStatus(data) {
  clearTimers();

  if (data.status === 'not_yet') {
    document.getElementById('open-time').textContent =
      String(data.openHour || 9).padStart(2, '0') + ':00';
    startCountdownToOpen(data.secondsUntilOpen);
    showScreen('not-yet');

  } else if (data.status === 'active') {
    renderQuiz(data.questions);
    startQuizTimer();
    showScreen('quiz');

  } else if (data.status === 'blocked') {
    startBlockTimer(data.remainingSeconds);
    showScreen('blocked');

  } else if (data.status === 'finished') {
    showScreen('finished');

  } else {
    showScreen('no-quiz');
  }
}

// ── Countdown to open ─────────────────────────────────────────
function startCountdownToOpen(seconds) {
  let remaining = seconds;
  updateOpenCountdown(remaining);

  state.countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(state.countdownTimer);
      init();
    } else {
      updateOpenCountdown(remaining);
    }
  }, 1000);
}

function updateOpenCountdown(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  document.getElementById('countdown-timer').textContent =
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0');
}

// ── Block Timer ───────────────────────────────────────────────
function startBlockTimer(seconds) {
  let remaining = seconds;
  updateBlockDisplay(remaining);

  state.blockTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(state.blockTimer);
      init();
    } else {
      updateBlockDisplay(remaining);
    }
  }, 1000);
}

function updateBlockDisplay(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  document.getElementById('block-timer').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// ── Quiz Timer (30s) ──────────────────────────────────────────
function startQuizTimer() {
  let remaining = QUIZ_SECONDS;
  updateQuizTimerUI(remaining);

  state.quizTimer = setInterval(() => {
    remaining--;
    updateQuizTimerUI(remaining);
    if (remaining <= 0) {
      clearInterval(state.quizTimer);
      state.quizTimer = null;
      timeExpired();
    }
  }, 1000);
}

function updateQuizTimerUI(remaining) {
  const arc = document.getElementById('timer-arc');
  const txt = document.getElementById('quiz-timer-text');
  if (!arc || !txt) return;

  const offset = 100 * (1 - remaining / QUIZ_SECONDS);
  arc.style.strokeDashoffset = offset;
  arc.style.stroke = remaining <= 10 ? '#c0111f' : '#E8192C';
  txt.textContent = remaining;
  txt.classList.toggle('urgent', remaining <= 10);
}

async function timeExpired() {
  clearTimers();
  showScreen('checking');
  try {
    const wrongAnswers = state.questions.map(() => -1);
    const data = await apiFetch('/submit', {
      method: 'POST',
      body: JSON.stringify({ answers: wrongAnswers }),
    });
    startBlockTimer(data.remainingSeconds || 600);
  } catch (e) {
    startBlockTimer(600);
  }
  const blockedMsg = document.querySelector('#screen-blocked .muted');
  if (blockedMsg) blockedMsg.textContent = 'Час вийшов! Повторна спроба через:';
  showScreen('blocked');
}

// ── Render Quiz ───────────────────────────────────────────────
function renderQuiz(questions) {
  state.questions = questions;
  state.selectedAnswers = {};

  const container = document.getElementById('questions-list');
  container.innerHTML = '';

  container.addEventListener('contextmenu', e => e.preventDefault());

  questions.forEach((q, qi) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'question';

    const canvas = document.createElement('canvas');
    canvas.className = 'question-canvas';
    qDiv.appendChild(canvas);

    const optsDiv = document.createElement('div');
    optsDiv.className = 'options';

    q.options.forEach((opt, oi) => {
      const label = document.createElement('label');
      label.className = 'option';
      label.innerHTML = `
        <input type="radio" name="q${qi}" value="${oi}">
        <span class="option-circle"></span>
        <span>${escHtml(opt)}</span>
      `;
      label.addEventListener('click', () => selectOption(qi, oi, label, optsDiv));
      optsDiv.appendChild(label);
    });

    qDiv.appendChild(optsDiv);
    container.appendChild(qDiv);
  });

  const drawAll = () => {
    document.querySelectorAll('.question-canvas').forEach((c, i) => {
      if (questions[i]) drawQuestion(c, questions[i].text, i + 1);
    });
  };
  document.fonts.ready.then(drawAll);
}

// ── Canvas Question Renderer ──────────────────────────────────
function drawQuestion(canvas, text, num) {
  const parent = canvas.parentElement;
  const w = parent ? parent.offsetWidth : 460;
  if (w === 0) {
    setTimeout(() => drawQuestion(canvas, text, num), 60);
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fontSize = 15;
  const lineH = 24;
  const numW = 26;

  const mc = document.createElement('canvas').getContext('2d');
  mc.font = `600 ${fontSize}px "Exo 2", Arial, sans-serif`;
  const lines = breakLines(mc, text, w - numW - 4);
  const h = Math.max(32, lines.length * lineH + 10);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const noiseCount = Math.ceil(w * h * 0.06);
  for (let i = 0; i < noiseCount; i++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const g = (Math.random() * 35) | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},0.016)`;
    ctx.fillRect(x, y, 1, 1);
  }

  ctx.fillStyle = '#E8192C';
  ctx.font = `bold ${fontSize}px "Exo 2", Arial, sans-serif`;
  ctx.fillText(`${num}.`, 0, fontSize + 2);

  ctx.fillStyle = '#1c1c2e';
  ctx.font = `600 ${fontSize}px "Exo 2", Arial, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, numW, fontSize + 2 + i * lineH);
  });
}

function breakLines(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function selectOption(qi, oi, label, optsDiv) {
  optsDiv.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
  label.classList.add('selected');
  state.selectedAnswers[qi] = oi;
}

// ── Submit Answers ────────────────────────────────────────────
async function submitAnswers() {
  const answered = Object.keys(state.selectedAnswers).length;
  if (answered < state.questions.length) {
    alert('Будь ласка, дайте відповідь на всі питання!');
    return;
  }

  clearTimers();

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;

  showScreen('checking');

  const answers = state.questions.map((_, i) => state.selectedAnswers[i]);

  try {
    const data = await apiFetch('/submit', {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });

    if (data.result === 'correct') {
      state.token = data.token;
      launchConfetti();
      showScreen('win');

    } else if (data.result === 'wrong') {
      startBlockTimer(600);
      const blockedMsg = document.querySelector('#screen-blocked .muted');
      if (blockedMsg) blockedMsg.textContent = 'На жаль, ви відповіли не на всі питання правильно.';
      showScreen('blocked');

    } else if (data.result === 'blocked') {
      startBlockTimer(data.remainingSeconds);
      showScreen('blocked');

    } else if (data.result === 'finished') {
      showScreen('finished');

    } else {
      showScreen('no-quiz');
    }
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    showScreen('quiz');
    alert('Помилка з\'єднання. Спробуйте ще раз.');
  }
}

// ── Claim Promo ───────────────────────────────────────────────
async function claimPromo() {
  if (!state.token) return;

  try {
    const data = await apiFetch('/claim', {
      method: 'POST',
      body: JSON.stringify({ token: state.token }),
    });

    if (data.result === 'claimed') {
      document.getElementById('promo-code').textContent = data.promoCode;
      showScreen('promo');

    } else if (data.result === 'finished') {
      showScreen('finished');

    } else {
      showScreen('no-quiz');
    }
  } catch (e) {
    console.error(e);
    alert('Помилка з\'єднання. Спробуйте ще раз.');
  }
}

// ── Copy Promo ────────────────────────────────────────────────
function copyPromo() {
  const code = document.getElementById('promo-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const hint = document.getElementById('copy-hint');
    hint.textContent = '✓ Скопійовано!';
    setTimeout(() => { hint.textContent = ''; }, 2000);
  });
}

// ── Confetti ──────────────────────────────────────────────────
function launchConfetti() {
  const wrap = document.getElementById('confetti-wrap');
  wrap.innerHTML = '';
  const colors = ['#E8192C', '#ff6b6b', '#ffd700', '#ff9f43', '#ee5a24', '#ffffff'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.8}s;
    `;
    wrap.appendChild(piece);
  }

  setTimeout(() => { wrap.innerHTML = ''; }, 4000);
}

// ── Helpers ───────────────────────────────────────────────────
function clearTimers() {
  if (state.blockTimer) { clearInterval(state.blockTimer); state.blockTimer = null; }
  if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
  if (state.quizTimer) { clearInterval(state.quizTimer); state.quizTimer = null; }
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Start ─────────────────────────────────────────────────────
init();
