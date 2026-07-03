const API_BASE = '/api';

let state = {
  screen: 'loading',
  questions: [],
  selectedAnswers: {},
  token: null,
  blockTimer: null,
  countdownTimer: null,
};

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  state.screen = name;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

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

function startCountdownToOpen(seconds) {
  let remaining = seconds;
  updateOpenCountdown(remaining);
  state.countdownTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(state.countdownTimer); init(); }
    else { updateOpenCountdown(remaining); }
  }, 1000);
}

function updateOpenCountdown(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  document.getElementById('countdown-timer').textContent =
    String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startBlockTimer(seconds) {
  let remaining = seconds;
  updateBlockDisplay(remaining);
  state.blockTimer = setInterval(() => {
    remaining--;
    if (remaining <= 0) { clearInterval(state.blockTimer); init(); }
    else { updateBlockDisplay(remaining); }
  }, 1000);
}

function updateBlockDisplay(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  document.getElementById('block-timer').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderQuiz(questions) {
  state.questions = questions;
  state.selectedAnswers = {};
  const container = document.getElementById('questions-list');
  container.innerHTML = '';

  questions.forEach((q, qi) => {
    const qDiv = document.createElement('div');
    qDiv.className = 'question';

    const qText = document.createElement('div');
    qText.className = 'question-text';
    qText.innerHTML = '<span class="question-num">' + (qi + 1) + '.</span> ' + escHtml(q.text);
    qDiv.appendChild(qText);

    const optsDiv = document.createElement('div');
    optsDiv.className = 'options';

    q.options.forEach((opt, oi) => {
      const label = document.createElement('label');
      label.className = 'option';
      label.innerHTML =
        '<input type="radio" name="q' + qi + '" value="' + oi + '">' +
        '<span class="option-circle"></span>' +
        '<span>' + escHtml(opt) + '</span>';
      label.addEventListener('click', () => selectOption(qi, oi, label, optsDiv));
      optsDiv.appendChild(label);
    });

    qDiv.appendChild(optsDiv);
    container.appendChild(qDiv);
  });
}

function selectOption(qi, oi, label, optsDiv) {
  optsDiv.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
  label.classList.add('selected');
  state.selectedAnswers[qi] = oi;
}

async function submitAnswers() {
  const answered = Object.keys(state.selectedAnswers).length;
  if (answered < state.questions.length) {
    alert('Будь ласка, дайте відповідь на всі питання!');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  showScreen('checking');

  const answers = state.questions.map((_, i) => state.selectedAnswers[i]);

  try {
    const data = await apiFetch('/submit', { method: 'POST', body: JSON.stringify({ answers }) });

    if (data.result === 'correct') {
      state.token = data.token;
      launchConfetti();
      showScreen('win');
    } else if (data.result === 'wrong') {
      startBlockTimer(600);
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
    alert('Помилка зв\'язку. Спробуйте ще раз.');
  }
}

async function claimPromo() {
  if (!state.token) return;
  try {
    const data = await apiFetch('/claim', { method: 'POST', body: JSON.stringify({ token: state.token }) });
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
    alert('Помилка зв\'язку. Спробуйте ще раз.');
  }
}

function copyPromo() {
  const code = document.getElementById('promo-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const hint = document.getElementById('copy-hint');
    hint.textContent = 'Скопійовано!';
    setTimeout(() => { hint.textContent = ''; }, 2000);
  });
}

function launchConfetti() {
  const wrap = document.getElementById('confetti-wrap');
  wrap.innerHTML = '';
  const colors = ['#E8192C', '#ff6b6b', '#ffd700', '#ff9f43', '#ee5a24', '#ffffff'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText =
      'left:' + Math.random() * 100 + '%;' +
      'background:' + colors[Math.floor(Math.random() * colors.length)] + ';' +
      'width:' + (4 + Math.random() * 8) + 'px;' +
      'height:' + (4 + Math.random() * 8) + 'px;' +
      'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') + ';' +
      'animation-duration:' + (1.5 + Math.random() * 2) + 's;' +
      'animation-delay:' + Math.random() * 0.8 + 's;';
    wrap.appendChild(piece);
  }
  setTimeout(() => { wrap.innerHTML = ''; }, 4000);
}

function clearTimers() {
  if (state.blockTimer) { clearInterval(state.blockTimer); state.blockTimer = null; }
  if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

init();
