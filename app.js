'use strict';

// ===== SCREEN ROUTER =====
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ===== UTILS =====
function pad(n) { return String(n).padStart(2, '0'); }
function formatDuration(s) { const m = Math.floor(s / 60); return m > 0 ? pad(m) + ':' + pad(s % 60) : ':' + pad(s); }
function formatMmSs(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
function formatChrono(ms) {
  const cs = Math.floor(ms / 10) % 100;
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60000);
  return pad(min) + ':' + pad(sec) + '.' + pad(cs);
}

// ===== AUDIO + VIBRATION =====
let audioCtx = null;

function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur, vol) {
  if (!audioCtx) return;
  vol = vol || 0.4;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

function playPhaseSound(name) {
  if (name === 'WORK') {
    beep(880, 0.12); setTimeout(function() { beep(1100, 0.2); }, 130);
  } else if (name === 'REST') {
    beep(440, 0.3);
  } else if (name === 'REST BETWEEN CYCLES') {
    beep(440, 0.2); setTimeout(function() { beep(330, 0.3); }, 250);
  } else if (name === 'COOLDOWN') {
    beep(660, 0.25);
  } else if (name === 'DONE!') {
    beep(660, 0.12); setTimeout(function() { beep(880, 0.12); }, 150); setTimeout(function() { beep(1100, 0.35); }, 300);
  } else {
    beep(660, 0.1);
  }
}

function vib(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ===== COUNTDOWN =====
let countdownInterval = null;
document.getElementById('start-btn').addEventListener('click', startCountdown);
document.getElementById('stop-countdown-btn').addEventListener('click', stopCountdown);

function validateDate(v) {
  if (!v) return 'Please select a date and time.';
  var d = new Date(v);
  if (isNaN(d.getTime())) return 'Invalid date.';
  if (d <= new Date()) return 'Target date must be in the future.';
  return null;
}

function startCountdown() {
  var err = validateDate(document.getElementById('target-date').value);
  document.getElementById('error-message').textContent = err || '';
  if (err) return;
  var target = new Date(document.getElementById('target-date').value);
  document.getElementById('target-display').textContent = target.toLocaleString(undefined, { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  document.getElementById('finished-message').classList.add('hidden');
  document.getElementById('countdown-setup').classList.add('hidden');
  document.getElementById('countdown-running').classList.remove('hidden');
  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) {
      ['days','hours','minutes','seconds'].forEach(function(id) { document.getElementById(id).textContent = '00'; });
      document.getElementById('finished-message').classList.remove('hidden');
      clearInterval(countdownInterval);
      return;
    }
    var total = Math.floor(diff / 1000);
    document.getElementById('days').textContent = pad(Math.floor(total / 86400));
    document.getElementById('hours').textContent = pad(Math.floor((total % 86400) / 3600));
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

// ===== TABATA CONFIG =====
var tabataConfig = { prepare:15, work:60, rest:30, rounds:3, cycles:1, restBetweenCycles:120, cooldown:150 };
var PARAM_IS_COUNT = { rounds:true, cycles:true };
var PARAM_MIN = { prepare:5, work:5, rest:5, rounds:1, cycles:1, restBetweenCycles:5, cooldown:5 };
var TABATA_KEYS = ['prepare','work','rest','rounds','cycles','restBetweenCycles','cooldown'];

function adjustParam(key, delta) {
  tabataConfig[key] = Math.max(PARAM_MIN[key], tabataConfig[key] + delta);
  document.getElementById('val-' + key).textContent = PARAM_IS_COUNT[key] ? tabataConfig[key] : formatDuration(tabataConfig[key]);
  if (key === 'rounds') document.getElementById('cycles-rounds-label').textContent = tabataConfig.rounds;
}

function refreshTabataSetup() {
  TABATA_KEYS.forEach(function(k) {
    document.getElementById('val-' + k).textContent = PARAM_IS_COUNT[k] ? tabataConfig[k] : formatDuration(tabataConfig[k]);
  });
  document.getElementById('cycles-rounds-label').textContent = tabataConfig.rounds;
}

// ===== TABATA RUNNING =====
var tabataSeq = [], tabataIndex = 0, tabataRemaining = 0, tabataInterval = null;

function buildTabataSequence(cfg) {
  var seq = [];
  seq.push({ name:'PREPARE', color:'#eab308', duration:cfg.prepare, round:0, cycle:0 });
  for (var c = 1; c <= cfg.cycles; c++) {
    for (var r = 1; r <= cfg.rounds; r++) {
      seq.push({ name:'WORK', color:'#22c55e', duration:cfg.work, round:r, cycle:c });
      if (!(c === cfg.cycles && r === cfg.rounds)) {
        seq.push({ name:'REST', color:'#ef4444', duration:cfg.rest, round:r, cycle:c });
      }
    }
    if (c < cfg.cycles) seq.push({ name:'REST BETWEEN CYCLES', color:'#eab308', duration:cfg.restBetweenCycles, round:0, cycle:c });
  }
  seq.push({ name:'COOLDOWN', color:'#3b82f6', duration:cfg.cooldown, round:0, cycle:0 });
  return seq;
}

function updateTabataDisplay() {
  var phase = tabataSeq[tabataIndex];
  var badge = document.getElementById('tabata-phase-badge');
  badge.textContent = phase.name;
  badge.style.background = phase.color;
  document.getElementById('tabata-timer').textContent = formatMmSs(tabataRemaining);
  document.getElementById('tabata-progress').textContent = phase.round > 0
    ? 'Round ' + phase.round + ' / ' + tabataConfig.rounds + '  ·  Cycle ' + phase.cycle + ' / ' + tabataConfig.cycles
    : '';
  document.getElementById('screen-tabata-running').style.background = phase.color + '14';
}

function startTabata() {
  unlockAudio();
  tabataSeq = buildTabataSequence(tabataConfig);
  tabataIndex = 0;
  tabataRemaining = tabataSeq[0].duration;
  show('screen-tabata-running');
  updateTabataDisplay();
  playPhaseSound(tabataSeq[0].name);
  tabataInterval = setInterval(tabataTick, 1000);
}

function tabataTick() {
  tabataRemaining--;
  if (tabataRemaining <= 3 && tabataRemaining > 0) {
    beep(440, 0.06, 0.25);
    vib(30);
  }
  if (tabataRemaining <= 0) {
    tabataIndex++;
    if (tabataIndex >= tabataSeq.length) {
      clearInterval(tabataInterval);
      var badge = document.getElementById('tabata-phase-badge');
      badge.textContent = 'DONE!';
      badge.style.background = '#4ade80';
      document.getElementById('tabata-timer').textContent = '00:00';
      document.getElementById('tabata-progress').textContent = 'Workout complete';
      document.getElementById('screen-tabata-running').style.background = '#4ade8014';
      playPhaseSound('DONE!');
      vib([200, 100, 200, 100, 400]);
      return;
    }
    tabataRemaining = tabataSeq[tabataIndex].duration;
    playPhaseSound(tabataSeq[tabataIndex].name);
    vib([100, 50, 100]);
  }
  updateTabataDisplay();
}

function skipTabataPhase() {
  tabataIndex++;
  if (tabataIndex >= tabataSeq.length) {
    stopTabata(); return;
  }
  tabataRemaining = tabataSeq[tabataIndex].duration;
  playPhaseSound(tabataSeq[tabataIndex].name);
  vib([60]);
  updateTabataDisplay();
}

function stopTabata() {
  clearInterval(tabataInterval);
  document.getElementById('screen-tabata-running').style.background = '';
  show('screen-tabata-setup');
}

// ===== CHRONO =====
var chronoStart = 0, chronoElapsed = 0, chronoRunning = false, chronoRafId = null, chronoLapTimes = [];

function toggleChrono() {
  if (chronoRunning) {
    chronoElapsed += Date.now() - chronoStart;
    cancelAnimationFrame(chronoRafId);
    chronoRunning = false;
    document.getElementById('chrono-start-btn').textContent = 'Start';
    document.getElementById('chrono-lap-btn').disabled = true;
    document.getElementById('chrono-reset-btn').disabled = false;
  } else {
    unlockAudio();
    chronoStart = Date.now();
    chronoRunning = true;
    document.getElementById('chrono-start-btn').textContent = 'Pause';
    document.getElementById('chrono-lap-btn').disabled = false;
    document.getElementById('chrono-reset-btn').disabled = true;
    tickChrono();
  }
}

function tickChrono() {
  document.getElementById('chrono-display').textContent = formatChrono(chronoElapsed + (chronoRunning ? Date.now() - chronoStart : 0));
  chronoRafId = requestAnimationFrame(tickChrono);
}

function resetChrono() {
  cancelAnimationFrame(chronoRafId);
  chronoRunning = false; chronoElapsed = 0; chronoLapTimes = [];
  document.getElementById('chrono-display').textContent = '00:00.00';
  document.getElementById('chrono-laps').innerHTML = '';
  document.getElementById('chrono-start-btn').textContent = 'Start';
  document.getElementById('chrono-reset-btn').disabled = true;
  document.getElementById('chrono-lap-btn').disabled = true;
}

function chronoLap() {
  var ms = chronoElapsed + (Date.now() - chronoStart);
  chronoLapTimes.push(ms);
  var prev = chronoLapTimes.length > 1 ? chronoLapTimes[chronoLapTimes.length - 2] : 0;
  var li = document.createElement('li');
  li.className = 'lap-item';
  li.innerHTML = '<span>Lap ' + chronoLapTimes.length + '</span><span>' + formatChrono(ms - prev) + '</span><span class="lap-total">' + formatChrono(ms) + '</span>';
  document.getElementById('chrono-laps').prepend(li);
}

// ===== WORKOUT STORAGE =====
function loadWorkouts() { try { return JSON.parse(localStorage.getItem('workouts') || '[]'); } catch(e) { return []; } }
function saveWorkouts(list) { localStorage.setItem('workouts', JSON.stringify(list)); }
function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function showWorkouts() {
  renderWorkouts();
  show('screen-workouts');
}

function renderWorkouts() {
  var list = loadWorkouts();
  var ul = document.getElementById('workouts-list');
  var empty = document.getElementById('workouts-empty');
  ul.innerHTML = '';
  if (list.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.forEach(function(w) {
    var li = document.createElement('li');
    li.className = 'workout-item';
    var desc = w.description ? '<span class="workout-item-desc">' + escHtml(w.description) + '</span>' : '';
    var meta = w.rounds + ' rounds · ' + w.cycles + ' cycle' + (w.cycles > 1 ? 's' : '') + ' · Work ' + formatDuration(w.work);
    li.innerHTML =
      '<div class="workout-item-main" onclick="loadWorkoutToTabata(\'' + w.id + '\')">' +
        '<span class="workout-item-name">' + escHtml(w.name) + '</span>' + desc +
        '<span class="workout-item-meta">' + meta + '</span>' +
      '</div>' +
      '<div class="workout-item-actions">' +
        '<button class="icon-btn" onclick="openWorkoutEdit(getWorkout(\'' + w.id + '\'),\'screen-workouts\')" aria-label="Edit">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="icon-btn danger" onclick="deleteWorkout(\'' + w.id + '\')" aria-label="Delete">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>' +
        '</button>' +
      '</div>';
    ul.appendChild(li);
  });
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getWorkout(id) { return loadWorkouts().find(function(w) { return w.id === id; }) || null; }

function loadWorkoutToTabata(id) {
  var w = getWorkout(id);
  if (!w) return;
  TABATA_KEYS.forEach(function(k) { tabataConfig[k] = w[k]; });
  refreshTabataSetup();
  show('screen-tabata-setup');
}

function deleteWorkout(id) {
  if (!confirm('Delete this workout?')) return;
  var list = loadWorkouts().filter(function(w) { return w.id !== id; });
  saveWorkouts(list);
  renderWorkouts();
}

// ===== WORKOUT EDIT =====
var editConfig = { prepare:15, work:60, rest:30, rounds:3, cycles:1, restBetweenCycles:120, cooldown:150 };
var editingWorkoutId = null;
var workoutEditOrigin = 'screen-workouts';

function adjustEditParam(key, delta) {
  editConfig[key] = Math.max(PARAM_MIN[key], editConfig[key] + delta);
  document.getElementById('we-val-' + key).textContent = PARAM_IS_COUNT[key] ? editConfig[key] : formatDuration(editConfig[key]);
}

function refreshWorkoutEditDisplay() {
  TABATA_KEYS.forEach(function(k) {
    document.getElementById('we-val-' + k).textContent = PARAM_IS_COUNT[k] ? editConfig[k] : formatDuration(editConfig[k]);
  });
}

function openWorkoutEdit(workout, origin) {
  workoutEditOrigin = origin || 'screen-workouts';
  editingWorkoutId = workout ? workout.id : null;
  document.getElementById('workout-edit-title').textContent = workout ? 'Edit Workout' : 'New Workout';
  document.getElementById('workout-name').value = workout ? workout.name : '';
  document.getElementById('workout-description').value = workout ? (workout.description || '') : '';
  var src = workout || { prepare:15, work:60, rest:30, rounds:3, cycles:1, restBetweenCycles:120, cooldown:150 };
  TABATA_KEYS.forEach(function(k) { editConfig[k] = src[k]; });
  refreshWorkoutEditDisplay();
  show('screen-workout-edit');
}

function openSaveWorkout() {
  TABATA_KEYS.forEach(function(k) { editConfig[k] = tabataConfig[k]; });
  editingWorkoutId = null;
  document.getElementById('workout-edit-title').textContent = 'Save Workout';
  document.getElementById('workout-name').value = '';
  document.getElementById('workout-description').value = '';
  refreshWorkoutEditDisplay();
  workoutEditOrigin = 'screen-tabata-setup';
  show('screen-workout-edit');
}

function cancelWorkoutEdit() { show(workoutEditOrigin); }

function saveWorkout() {
  var name = document.getElementById('workout-name').value.trim();
  if (!name) { document.getElementById('workout-name').focus(); return; }
  var desc = document.getElementById('workout-description').value.trim();
  var list = loadWorkouts();
  if (editingWorkoutId) {
    list = list.map(function(w) {
      if (w.id !== editingWorkoutId) return w;
      return Object.assign({}, w, { name:name, description:desc }, editConfig);
    });
  } else {
    var entry = Object.assign({ id:genId(), name:name, description:desc }, editConfig);
    list.push(entry);
  }
  saveWorkouts(list);
  show(workoutEditOrigin);
  if (workoutEditOrigin === 'screen-workouts') renderWorkouts();
}
