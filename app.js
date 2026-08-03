'use strict';

// ===== SCREEN ROUTER =====
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== UTILS =====
function pad(n) { return String(n).padStart(2, '0'); }

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${pad(m)}:${pad(sec)}` : `:${pad(sec)}`;
}

function formatMmSs(s) {
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ===== COUNTDOWN =====
let countdownInterval = null;

document.getElementById('start-btn').addEventListener('click', startCountdown);
document.getElementById('stop-countdown-btn').addEventListener('click', stopCountdown);

function validateDate(value) {
  if (!value) return 'Please select a date and time.';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Invalid date.';
  if (d <= new Date()) return 'Target date must be in the future.';
  return null;
}

function startCountdown() {
  const error = validateDate(document.getElementById('target-date').value);
  document.getElementById('error-message').textContent = error || '';
  if (error) return;

  const target = new Date(document.getElementById('target-date').value);
  document.getElementById('target-display').textContent = target.toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  document.getElementById('finished-message').classList.add('hidden');
  document.getElementById('countdown-setup').classList.add('hidden');
  document.getElementById('countdown-running').classList.remove('hidden');

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      ['days', 'hours', 'minutes', 'seconds'].forEach(id => { document.getElementById(id).textContent = '00'; });
      document.getElementById('finished-message').classList.remove('hidden');
      clearInterval(countdownInterval);
      return;
    }
    const total = Math.floor(diff / 1000);
    document.getElementById('days').textContent    = pad(Math.floor(total / 86400));
    document.getElementById('hours').textContent   = pad(Math.floor((total % 86400) / 3600));
    document.getElementById('minutes').textContent = pad(Math.floor((total % 3600) / 60));
    document.getElementById('seconds').textContent = pad(total % 60);
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  clearInterval(countdownInterval);
  document.getElementById('countdown-setup').classList.remove('hidden');
  document.getElementById('countdown-running').classList.add('hidden');
}

// ===== TABATA =====
const tabataConfig = {
  prepare: 15,
  work: 60,
  rest: 30,
  rounds: 3,
  cycles: 1,
  restBetweenCycles: 120,
  cooldown: 150,
};

const PARAM_IS_COUNT = { rounds: true, cycles: true };
const PARAM_MIN = { prepare: 5, work: 5, rest: 5, rounds: 1, cycles: 1, restBetweenCycles: 5, cooldown: 5 };

function adjustParam(key, delta) {
  tabataConfig[key] = Math.max(PARAM_MIN[key], tabataConfig[key] + delta);
  const el = document.getElementById(`val-${key}`);
  el.textContent = PARAM_IS_COUNT[key] ? tabataConfig[key] : formatDuration(tabataConfig[key]);
  if (key === 'rounds') {
    document.getElementById('cycles-rounds-label').textContent = tabataConfig.rounds;
  }
}

function buildTabataSequence(cfg) {
  const seq = [];
  seq.push({ name: 'PREPARE', color: '#eab308', duration: cfg.prepare, round: 0, cycle: 0 });
  for (let c = 1; c <= cfg.cycles; c++) {
    for (let r = 1; r <= cfg.rounds; r++) {
      seq.push({ name: 'WORK', color: '#22c55e', duration: cfg.work, round: r, cycle: c });
      const isLast = c === cfg.cycles && r === cfg.rounds;
      if (!isLast) {
        seq.push({ name: 'REST', color: '#ef4444', duration: cfg.rest, round: r, cycle: c });
      }
    }
    if (c < cfg.cycles) {
      seq.push({ name: 'REST BETWEEN CYCLES', color: '#eab308', duration: cfg.restBetweenCycles, round: 0, cycle: c });
    }
  }
  seq.push({ name: 'COOLDOWN', color: '#3b82f6', duration: cfg.cooldown, round: 0, cycle: 0 });
  return seq;
}

let tabataSeq = [];
let tabataIndex = 0;
let tabataRemaining = 0;
let tabataInterval = null;

function updateTabataDisplay() {
  const phase = tabataSeq[tabataIndex];
  const badge = document.getElementById('tabata-phase-badge');
  badge.textContent = phase.name;
  badge.style.background = phase.color;

  document.getElementById('tabata-timer').textContent = formatMmSs(tabataRemaining);

  const progress = document.getElementById('tabata-progress');
  progress.textContent = phase.round > 0
    ? `Round ${phase.round} / ${tabataConfig.rounds}  ·  Cycle ${phase.cycle} / ${tabataConfig.cycles}`
    : '';

  document.getElementById('screen-tabata-running').style.background =
    phase.color + '14';
}

function startTabata() {
  tabataSeq = buildTabataSequence(tabataConfig);
  tabataIndex = 0;
  tabataRemaining = tabataSeq[0].duration;
  show('screen-tabata-running');
  updateTabataDisplay();
  tabataInterval = setInterval(tabataTick, 1000);
}

function tabataTick() {
  tabataRemaining--;
  if (tabataRemaining <= 0) {
    tabataIndex++;
    if (tabataIndex >= tabataSeq.length) {
      clearInterval(tabataInterval);
      document.getElementById('tabata-phase-badge').textContent = 'DONE!';
      document.getElementById('tabata-phase-badge').style.background = '#4ade80';
      document.getElementById('tabata-timer').textContent = '00:00';
      document.getElementById('tabata-progress').textContent = 'Workout complete';
      document.getElementById('screen-tabata-running').style.background = '#4ade8014';
      return;
    }
    tabataRemaining = tabataSeq[tabataIndex].duration;
  }
  updateTabataDisplay();
}

function stopTabata() {
  clearInterval(tabataInterval);
  document.getElementById('screen-tabata-running').style.background = '';
  show('screen-tabata-setup');
}

// ===== CHRONO =====
let chronoStart = 0;
let chronoElapsed = 0;
let chronoRunning = false;
let chronoRafId = null;
let chronoLapTimes = [];

function toggleChrono() {
  if (chronoRunning) {
    chronoElapsed += Date.now() - chronoStart;
    cancelAnimationFrame(chronoRafId);
    chronoRunning = false;
    document.getElementById('chrono-start-btn').textContent = 'Start';
    document.getElementById('chrono-lap-btn').disabled = true;
    document.getElementById('chrono-reset-btn').disabled = false;
  } else {
    chronoStart = Date.now();
    chronoRunning = true;
    document.getElementById('chrono-start-btn').textContent = 'Pause';
    document.getElementById('chrono-lap-btn').disabled = false;
    document.getElementById('chrono-reset-btn').disabled = true;
    tickChrono();
  }
}

function tickChrono() {
  updateChronoDisplay();
  chronoRafId = requestAnimationFrame(tickChrono);
}

function updateChronoDisplay() {
  const ms = chronoElapsed + (chronoRunning ? Date.now() - chronoStart : 0);
  document.getElementById('chrono-display').textContent = formatChrono(ms);
}

function formatChrono(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}.${pad(cs)}`;
}

function resetChrono() {
  cancelAnimationFrame(chronoRafId);
  chronoRunning = false;
  chronoElapsed = 0;
  chronoLapTimes = [];
  document.getElementById('chrono-display').textContent = '00:00.00';
  document.getElementById('chrono-laps').innerHTML = '';
  document.getElementById('chrono-start-btn').textContent = 'Start';
  document.getElementById('chrono-reset-btn').disabled = true;
  document.getElementById('chrono-lap-btn').disabled = true;
}

function chronoLap() {
  const ms = chronoElapsed + (Date.now() - chronoStart);
  chronoLapTimes.push(ms);
  const prev = chronoLapTimes.length > 1 ? chronoLapTimes[chronoLapTimes.length - 2] : 0;
  const li = document.createElement('li');
  li.className = 'lap-item';
  li.innerHTML =
    `<span>Lap ${chronoLapTimes.length}</span>` +
    `<span>${formatChrono(ms - prev)}</span>` +
    `<span class="lap-total">${formatChrono(ms)}</span>`;
  document.getElementById('chrono-laps').prepend(li);
}
