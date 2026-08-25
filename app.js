'use strict';

// ROUTER
function show(id) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// UTILS
function pad(n) { return String(n).padStart(2, '0'); }
function formatDuration(s) { var m = Math.floor(s / 60); return m > 0 ? pad(m) + ':' + pad(s % 60) : ':' + pad(s); }
function formatMmSs(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
function formatChrono(ms) { var cs = Math.floor(ms/10)%100; var sec = Math.floor(ms/1000)%60; var min = Math.floor(ms/60000); return pad(min)+':'+pad(sec)+'.'+pad(cs); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function calcTotalDuration(w) {
  var nBetween = Math.max(0, w.cycles - 1);
  var workRest = 0;
  for (var ci = 0; ci < w.cycles; ci++) {
    var cr = (w.cycleRounds && w.cycleRounds[ci] > 0) ? w.cycleRounds[ci] : w.rounds;
    workRest += cr * (w.work + w.rest);
  }
  return w.prepare + workRest + nBetween * w.restBetweenCycles + w.cooldown;
}

function roundsSummary(w) {
  var vals = [];
  for (var ci = 0; ci < w.cycles; ci++) {
    vals.push((w.cycleRounds && w.cycleRounds[ci] > 0) ? w.cycleRounds[ci] : w.rounds);
  }
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  return mn === mx ? mn + 'r' : mn + '–' + mx + 'r';
}

function formatTotalDuration(s) {
  var h = Math.floor(s/3600); var m = Math.floor((s%3600)/60); var sec = s%60;
  if (h > 0) return h + 'h ' + pad(m) + 'min';
  if (m > 0 && sec > 0) return m + 'min ' + sec + 's';
  if (m > 0) return m + 'min';
  return sec + 's';
}

// AUDIO
var audioCtx = null;
var audioOut = null; // brick-wall limiter node

function unlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Brick-wall limiter: allows high gain without clipping
    var lim = audioCtx.createDynamicsCompressor();
    lim.threshold.value = -1;   // kick in at -1 dBFS
    lim.knee.value = 0;         // hard knee
    lim.ratio.value = 20;       // near brick-wall
    lim.attack.value = 0.001;   // 1 ms
    lim.release.value = 0.05;   // 50 ms
    lim.connect(audioCtx.destination);
    audioOut = lim;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, vol, type) {
  if (!audioCtx) return;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioOut || audioCtx.destination);
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol != null ? vol : 0.85, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
}

// Sonnerie de début de phase
function playStartChime(name) {
  if (!audioCtx) return;
  if (name === 'PREPARE') {
    // Arpège montant C5-E5-G5 : "prêt ?"
    beep(523, 0.09, 0.75); setTimeout(function(){ beep(659, 0.09, 0.8); }, 120); setTimeout(function(){ beep(784, 0.25, 0.9); }, 240);
  } else if (name === 'WORK') {
    // Double impulsion aiguë : "GO !"
    beep(880, 0.07, 0.85, 'square'); setTimeout(function(){ beep(1100, 0.18, 0.9, 'square'); }, 95);
  } else if (name === 'REST') {
    // Descente douce : "souffle"
    beep(660, 0.14, 0.78); setTimeout(function(){ beep(494, 0.3, 0.7); }, 170);
  } else if (name === 'REST BETWEEN CYCLES') {
    // Arpège triumphant E5-G5-C6 : "cycle terminé !"
    beep(659, 0.1, 0.78); setTimeout(function(){ beep(784, 0.1, 0.82); }, 125); setTimeout(function(){ beep(1047, 0.3, 0.88); }, 250);
  } else if (name === 'COOLDOWN') {
    // Descente calme : "récup"
    beep(440, 0.3, 0.72); setTimeout(function(){ beep(349, 0.45, 0.65); }, 360);
  } else if (name === 'DONE!') {
    // Fanfare de victoire
    beep(659, 0.09, 0.8); setTimeout(function(){ beep(784, 0.09, 0.83); }, 130); setTimeout(function(){ beep(988, 0.09, 0.86); }, 260); setTimeout(function(){ beep(1319, 0.4, 0.9); }, 390);
  } else if (name === 'CHRONO') {
    // Double bip de départ
    beep(660, 0.08, 0.75); setTimeout(function(){ beep(880, 0.16, 0.82); }, 105);
  } else {
    beep(660, 0.1, 0.78);
  }
}

// Tick de countdown — onde carrée pour percer la musique
function playCountdownTick(secLeft) {
  if (!audioCtx) return;
  if (secLeft === 1) {
    beep(1100, 0.12, 0.9, 'square'); // dernier tick : aigu, plus long
  } else {
    beep(880, 0.08, 0.8, 'square');  // ticks réguliers perçants
  }
}

// Sonnerie de fin de phase
function playEndChime() {
  if (!audioCtx) return;
  beep(784, 0.07, 0.8); setTimeout(function(){ beep(1047, 0.22, 0.85); }, 85);
}
function vib(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

// COUNTDOWN
var countdownInterval = null;
document.getElementById('start-btn').addEventListener('click', startCountdown);
document.getElementById('stop-countdown-btn').addEventListener('click', stopCountdown);
function validateDate(v) {
  if (!v) return 'Please select a date and time.';
  var d = new Date(v); if (isNaN(d.getTime())) return 'Invalid date.';
  if (d <= new Date()) return 'Target date must be in the future.'; return null;
}
function startCountdown() {
  var err = validateDate(document.getElementById('target-date').value);
  document.getElementById('error-message').textContent = err || ''; if (err) return;
  var target = new Date(document.getElementById('target-date').value);
  document.getElementById('target-display').textContent = target.toLocaleString(undefined, {year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('finished-message').classList.add('hidden');
  document.getElementById('countdown-setup').classList.add('hidden');
  document.getElementById('countdown-running').classList.remove('hidden');
  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) { ['days','hours','minutes','seconds'].forEach(function(id){ document.getElementById(id).textContent='00'; }); document.getElementById('finished-message').classList.remove('hidden'); clearInterval(countdownInterval); playStartChime('DONE!'); return; }
    var total = Math.floor(diff/1000);
    document.getElementById('days').textContent = pad(Math.floor(total/86400));
    document.getElementById('hours').textContent = pad(Math.floor((total%86400)/3600));
    document.getElementById('minutes').textContent = pad(Math.floor((total%3600)/60));
    document.getElementById('seconds').textContent = pad(total%60);
  }
  tick(); countdownInterval = setInterval(tick, 1000);
}
function stopCountdown() {
  clearInterval(countdownInterval);
  document.getElementById('countdown-setup').classList.remove('hidden');
  document.getElementById('countdown-running').classList.add('hidden');
}

// WORKOUT SEQUENCE
var PARAM_KEYS = ['prepare','work','rest','rounds','cycles','restBetweenCycles','cooldown'];
var PARAM_IS_COUNT = {rounds:true,cycles:true};
var PARAM_MIN = {prepare:5,work:5,rest:5,rounds:1,cycles:1,restBetweenCycles:5,cooldown:5};

function buildWorkoutSequence(w) {
  var seq = [];
  seq.push({name:'PREPARE', color:'#eab308', duration:w.prepare, round:0, cycle:0});
  for (var c = 1; c <= w.cycles; c++) {
    var cRounds = (w.cycleRounds && w.cycleRounds[c-1] > 0) ? w.cycleRounds[c-1] : w.rounds;
    seq.push({name:'__CYCLE_START__', cycle:c, duration:0});
    for (var r = 1; r <= cRounds; r++) {
      seq.push({name:'WORK', color:'#22c55e', duration:w.work, round:r, cycle:c});
      seq.push({name:'REST', color:'#ef4444', duration:w.rest, round:r, cycle:c});
    }
    if (c < w.cycles) seq.push({name:'REST BETWEEN CYCLES', color:'#eab308', duration:w.restBetweenCycles, round:0, cycle:c});
  }
  seq.push({name:'COOLDOWN', color:'#3b82f6', duration:w.cooldown, round:0, cycle:0});
  return seq;
}

// WORKOUT RUN STATE
var currentWorkout = null;
var sessionCycleData = [];
var runSeq = [], runIndex = 0, runRemaining = 0, runInterval = null;
var pendingCycleNum = 0;
var currentRepInputVal = 0;
var currentWeightInputVal = 0;
var lastRoundWeight = 0;
var lastWorkSuggest = 0;
var phaseStartTime = 0;
var phaseTotalSecs = 0;
var lastBeepSec = -1;
var isPaused = false;
var pauseStartTime = 0;
var pauseRafId = null;
var pausedForConfirm = false;
var wakeLock = null;
var currentRoundDiff = 0;
var currentCycleDiff = 0;
var celebrationShown = false;
var celebrationActive = false;
var _celStop = null;

function togglePause() { isPaused ? resumeTimer() : pauseTimer(); }

function pauseTimer() {
  if (!runInterval || isPaused) return;
  isPaused = true;
  clearInterval(runInterval); runInterval = null;
  pauseStartTime = Date.now();
  releaseWakeLock();
  var btn = document.getElementById('run-pause-btn');
  if (btn) { btn.textContent = 'Reprendre'; btn.classList.add('btn-paused'); }
  var skipBtn = document.getElementById('run-skip-btn');
  if (skipBtn) skipBtn.disabled = true;
  document.getElementById('run-pause-info').classList.remove('hidden');
  (function tick() {
    if (!isPaused) return;
    var s = Math.floor((Date.now() - pauseStartTime) / 1000);
    document.getElementById('run-pause-chrono').textContent = pad(Math.floor(s/60)) + ':' + pad(s%60);
    pauseRafId = requestAnimationFrame(tick);
  })();
}

function resumeTimer() {
  if (!isPaused) return;
  isPaused = false;
  phaseStartTime = Date.now() - (pauseStartTime - phaseStartTime);
  cancelAnimationFrame(pauseRafId); pauseRafId = null;
  requestWakeLock();
  var btn = document.getElementById('run-pause-btn');
  if (btn) { btn.textContent = 'Pause'; btn.classList.remove('btn-paused'); }
  var skipBtn = document.getElementById('run-skip-btn');
  if (skipBtn) skipBtn.disabled = false;
  document.getElementById('run-pause-info').classList.add('hidden');
  runInterval = setInterval(runTick, 1000);
}

function askStopWorkout() {
  pausedForConfirm = !isPaused;
  if (!isPaused) pauseTimer();
  document.getElementById('overlay-stop-confirm').classList.remove('hidden');
}
function cancelStopWorkout() {
  document.getElementById('overlay-stop-confirm').classList.add('hidden');
  if (pausedForConfirm) { pausedForConfirm = false; resumeTimer(); }
}
function confirmStopWorkout() {
  pausedForConfirm = false; isPaused = false;
  cancelAnimationFrame(pauseRafId); pauseRafId = null;
  document.getElementById('overlay-stop-confirm').classList.add('hidden');
  stopWorkoutRun();
}

function addCycleToRun() {
  var newCycle = currentWorkout.cycles + 1;
  currentWorkout.cycles = newCycle;
  if (!currentWorkout.cycleRounds) currentWorkout.cycleRounds = [];
  var prevRounds = (currentWorkout.cycleRounds[newCycle-2] > 0) ? currentWorkout.cycleRounds[newCycle-2] : currentWorkout.rounds;
  currentWorkout.cycleRounds.push(prevRounds);
  sessionCycleData.push({ name: '', targetReps: 0, roundReps: [], roundWeights: [], roundDiffs: [], cycleDiff: 0 });
  // Find COOLDOWN position and insert before it
  var idx = runSeq.length - 1;
  while (idx >= 0 && runSeq[idx].name !== 'COOLDOWN') idx--;
  if (idx < 0) idx = runSeq.length;
  var insert = [
    {name:'REST BETWEEN CYCLES', color:'#eab308', duration:currentWorkout.restBetweenCycles, round:0, cycle:newCycle-1},
    {name:'__CYCLE_START__', cycle:newCycle, duration:0}
  ];
  for (var r = 1; r <= prevRounds; r++) {
    insert.push({name:'WORK', color:'#22c55e', duration:currentWorkout.work, round:r, cycle:newCycle});
    insert.push({name:'REST', color:'#ef4444', duration:currentWorkout.rest, round:r, cycle:newCycle});
  }
  Array.prototype.splice.apply(runSeq, [idx, 0].concat(insert));
  beep(660, 0.08); setTimeout(function(){ beep(880, 0.12); }, 120);
  updateRunDisplay();
}

function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function(wl) {
    wakeLock = wl;
    wl.addEventListener('release', function() { wakeLock = null; });
  }).catch(function() {});
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(function(){}); wakeLock = null; }
}

function computeSuggest(cycleIdx, roundIdx) {
  var cd = sessionCycleData[cycleIdx];
  if (!cd || !cd.targetReps) return 0;
  var done = cd.roundReps.reduce(function(a,b){return a+b;}, 0);
  var remaining = Math.max(0, cd.targetReps - done);
  var totalRounds = (currentWorkout.cycleRounds && currentWorkout.cycleRounds[cycleIdx] > 0) ? currentWorkout.cycleRounds[cycleIdx] : currentWorkout.rounds;
  var roundsLeft = totalRounds - roundIdx;
  return roundsLeft > 0 ? Math.ceil(remaining / roundsLeft) : 0;
}

function updateRestStats() {
  var phase = runSeq[runIndex];
  if (!phase || phase.name !== 'REST' || !phase.cycle) return;
  var cd = sessionCycleData[phase.cycle - 1];
  var summaryEl = document.getElementById('run-rest-summary');
  if (!cd || !cd.targetReps) { summaryEl.classList.add('hidden'); return; }
  summaryEl.classList.remove('hidden');
  var prev = cd.roundReps.reduce(function(a,b){return a+b;}, 0);
  var total = prev + currentRepInputVal;
  var target = cd.targetReps;
  var pct = Math.round((total / target) * 100);
  var pctCls = pct >= 100 ? 'pct-great' : pct >= 80 ? 'pct-good' : 'pct-low';
  document.getElementById('run-rest-prev').textContent = prev + ' reps';
  document.getElementById('run-rest-progress').textContent = total + ' / ' + target + ' reps';
  var pctEl = document.getElementById('run-rest-pct');
  pctEl.textContent = pct + '%';
  pctEl.className = 'rest-stat-pct ' + pctCls;
}

function changeRepInput(delta) {
  currentRepInputVal = Math.max(0, currentRepInputVal + delta);
  document.getElementById('run-rep-val').textContent = currentRepInputVal;
  updateRestStats();
}

function onWeightChange(el) {
  currentWeightInputVal = parseFloat(el.value) || 0;
}

function startWorkoutRun(workout) {
  currentWorkout = workout;
  sessionCycleData = [];
  for (var i = 0; i < workout.cycles; i++) {
    sessionCycleData.push({
      name: (workout.cycleNames && workout.cycleNames[i]) || '',
      targetReps: (workout.cycleTargetReps && workout.cycleTargetReps[i]) || 0,
      roundReps: [],
      roundWeights: [],
      roundDiffs: [],
      cycleDiff: 0
    });
  }
  currentRoundDiff = 0; currentCycleDiff = 0;
  runSeq = buildWorkoutSequence(workout);
  runIndex = 0; runRemaining = 0;
  currentRepInputVal = 0; currentWeightInputVal = 0; lastRoundWeight = 0; lastWorkSuggest = 0;
  phaseStartTime = 0; phaseTotalSecs = 0; lastBeepSec = -1;
  isPaused = false; pausedForConfirm = false;
  celebrationShown = false; dismissCelebration();
  cancelAnimationFrame(pauseRafId); pauseRafId = null;
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  document.getElementById('overlay-workout-done').classList.add('hidden');
  document.getElementById('run-cycle-name').classList.add('hidden');
  document.getElementById('run-work-panel').classList.add('hidden');
  document.getElementById('run-rest-panel').classList.add('hidden');
  document.getElementById('run-rest-summary').classList.add('hidden');
  document.getElementById('run-between-panel').classList.add('hidden');
  document.getElementById('run-pause-info').classList.add('hidden');
  document.getElementById('overlay-stop-confirm').classList.add('hidden');
  var pb = document.getElementById('run-pause-btn'); if (pb) { pb.textContent = 'Pause'; pb.classList.remove('btn-paused'); }
  var sb = document.getElementById('run-skip-btn'); if (sb) sb.disabled = false;
  document.getElementById('screen-workout-run').style.background = '';
  show('screen-workout-run');
  var first = runSeq[0];
  runRemaining = first.duration;
  phaseStartTime = Date.now();
  phaseTotalSecs = first.duration;
  lastBeepSec = -1;
  updateRunDisplay();
  playStartChime(first.name);
  runInterval = setInterval(runTick, 1000);
  requestWakeLock();
}

function processCurrentPhase() {
  celebrationShown = false;
  if (runIndex >= runSeq.length) { showWorkoutDone(); return false; }
  var phase = runSeq[runIndex];
  if (phase.name === '__CYCLE_START__') { showCycleStartOverlay(phase.cycle); return false; }
  runRemaining = phase.duration;
  phaseStartTime = Date.now();
  phaseTotalSecs = phase.duration;
  lastBeepSec = -1;
  if (phase.name === 'WORK') {
    currentWeightInputVal = lastRoundWeight;
    var wInput = document.getElementById('run-weight-input');
    if (wInput) wInput.value = lastRoundWeight > 0 ? lastRoundWeight : '';
  }
  if (phase.name === 'REST') {
    currentRepInputVal = lastWorkSuggest;
    currentRoundDiff = 0;
    document.querySelectorAll('#run-round-diff .run-diff-btn').forEach(function(btn) { btn.classList.remove('active'); });
  }
  if (phase.name === 'REST BETWEEN CYCLES') {
    currentCycleDiff = 0;
    document.querySelectorAll('#run-cycle-diff .run-diff-btn').forEach(function(btn) { btn.classList.remove('active'); });
  }
  playStartChime(phase.name);
  vib([100, 50, 100]);
  updateRunDisplay();
  return true;
}

function advancePhase() {
  var leaving = runSeq[runIndex];
  if (leaving && leaving.name === 'REST' && leaving.round > 0 && leaving.cycle > 0) {
    var cd = sessionCycleData[leaving.cycle - 1];
    if (cd) {
      cd.roundReps.push(currentRepInputVal);
      cd.roundWeights.push(currentWeightInputVal);
      cd.roundDiffs.push(currentRoundDiff);
      if (currentWeightInputVal > 0) lastRoundWeight = currentWeightInputVal;
    }
  }
  if (leaving && leaving.name === 'REST BETWEEN CYCLES' && leaving.cycle > 0) {
    var cdB = sessionCycleData[leaving.cycle - 1];
    if (cdB) cdB.cycleDiff = currentCycleDiff;
  }
  dismissCelebration();
  runIndex++;
  return processCurrentPhase();
}

function runTick() {
  var elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
  runRemaining = Math.max(0, phaseTotalSecs - elapsed);
  if (runRemaining <= 5 && runRemaining > 0 && runRemaining !== lastBeepSec) {
    lastBeepSec = runRemaining;
    playCountdownTick(runRemaining);
    vib(25);
  }
  if (runRemaining <= 0) {
    clearInterval(runInterval); runInterval = null;
    playEndChime();
    setTimeout(function() {
      var go = advancePhase();
      if (go) runInterval = setInterval(runTick, 1000);
    }, 320);
    return;
  }
  updateRunDisplay();
}

// Resume after background / screen lock
function handleAppResume() {
  if (!currentWorkout || !runInterval || isPaused) return;
  var elapsed = Math.floor((Date.now() - phaseStartTime) / 1000);
  runRemaining = Math.max(0, phaseTotalSecs - elapsed);
  if (runRemaining <= 0) {
    clearInterval(runInterval); runInterval = null;
    fastForwardFromOverrun(elapsed - phaseTotalSecs);
  } else {
    updateRunDisplay();
  }
}

function fastForwardFromOverrun(overrunSecs) {
  // Save reps for the REST phase we're leaving (if any)
  var leaving = runSeq[runIndex];
  if (leaving && leaving.name === 'REST' && leaving.round > 0 && leaving.cycle > 0) {
    var cd0 = sessionCycleData[leaving.cycle - 1];
    if (cd0) {
      cd0.roundReps.push(currentRepInputVal);
      cd0.roundWeights.push(currentWeightInputVal);
      cd0.roundDiffs.push(currentRoundDiff);
      if (currentWeightInputVal > 0) lastRoundWeight = currentWeightInputVal;
    }
  }
  runIndex++;
  while (runIndex < runSeq.length) {
    var phase = runSeq[runIndex];
    if (phase.name === '__CYCLE_START__') { runIndex++; continue; } // skip overlays
    if (phase.duration <= overrunSecs) {
      overrunSecs -= phase.duration;
      runIndex++;
    } else {
      // This phase is currently active
      runRemaining = phase.duration - overrunSecs;
      phaseStartTime = Date.now() - overrunSecs * 1000;
      phaseTotalSecs = phase.duration;
      lastBeepSec = -1;
      if (phase.name === 'WORK') { currentWeightInputVal = lastRoundWeight; }
      if (phase.name === 'REST') { currentRepInputVal = lastWorkSuggest; }
      playStartChime(phase.name);
      updateRunDisplay();
      runInterval = setInterval(runTick, 1000);
      return;
    }
  }
  showWorkoutDone();
}

document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    if (audioCtx) audioCtx.resume().catch(function(){});
    handleAppResume();
    if (currentWorkout && !isPaused) requestWakeLock();
  }
});
window.addEventListener('pageshow', function() {
  if (audioCtx) audioCtx.resume().catch(function(){});
  handleAppResume();
  if (currentWorkout && !isPaused) requestWakeLock();
});

function updateRunDisplay() {
  var phase = runSeq[runIndex];
  if (!phase || phase.name.indexOf('__') === 0) return;

  var badge = document.getElementById('run-phase-badge');
  badge.textContent = phase.name;
  badge.style.background = phase.color || '#64748b';
  document.getElementById('run-timer').textContent = formatMmSs(runRemaining);
  var phaseTotalRounds = (currentWorkout.cycleRounds && currentWorkout.cycleRounds[phase.cycle-1] > 0) ? currentWorkout.cycleRounds[phase.cycle-1] : currentWorkout.rounds;
  document.getElementById('run-progress').textContent = phase.round > 0
    ? 'Round ' + phase.round + ' / ' + phaseTotalRounds + '  ·  Cycle ' + phase.cycle + ' / ' + currentWorkout.cycles : '';
  document.getElementById('screen-workout-run').style.background = (phase.color || '#64748b') + '14';

  var isWork = phase.name === 'WORK';
  var isRest = phase.name === 'REST';
  var isBetween = phase.name === 'REST BETWEEN CYCLES';

  // Cycle name — visible during WORK and REST
  var cycleName = '';
  if ((isWork || isRest) && phase.cycle > 0) {
    var cd0 = sessionCycleData[phase.cycle - 1];
    cycleName = cd0 ? (cd0.name || '') : '';
  }
  var cycleNameEl = document.getElementById('run-cycle-name');
  cycleNameEl.textContent = cycleName;
  cycleNameEl.classList.toggle('hidden', !cycleName);

  // WORK panel: suggestion + remaining to target
  var workPanel = document.getElementById('run-work-panel');
  workPanel.classList.toggle('hidden', !isWork);
  if (isWork && phase.cycle > 0) {
    var cd = sessionCycleData[phase.cycle - 1];
    var suggest = computeSuggest(phase.cycle - 1, phase.round - 1);
    lastWorkSuggest = suggest;
    var done = cd ? cd.roundReps.reduce(function(a,b){return a+b;}, 0) : 0;
    var remaining = (cd && cd.targetReps) ? Math.max(0, cd.targetReps - done) : null;
    document.getElementById('run-suggest').textContent = suggest > 0 ? suggest : '—';
    document.getElementById('run-remaining').textContent = remaining !== null ? remaining : '—';
  }

  // REST panel: stepper + live progress toward cycle goal
  var restPanel = document.getElementById('run-rest-panel');
  restPanel.classList.toggle('hidden', !isRest);
  if (isRest) {
    document.getElementById('run-rep-val').textContent = currentRepInputVal;
    var wRow = document.getElementById('run-weight-this-round');
    if (wRow) {
      if (currentWeightInputVal > 0) {
        var moved = Math.round(currentWeightInputVal * currentRepInputVal * 10) / 10;
        document.getElementById('run-weight-this-val').textContent =
          currentWeightInputVal + ' kg × ' + currentRepInputVal + ' = ' + moved + ' kg';
        wRow.classList.remove('hidden');
      } else {
        wRow.classList.add('hidden');
      }
    }
    updateRestStats();
  }

  // REST BETWEEN CYCLES panel: summary of just-finished cycle
  var betweenPanel = document.getElementById('run-between-panel');
  betweenPanel.classList.toggle('hidden', !isBetween);
  if (isBetween && phase.cycle > 0) {
    var cdB = sessionCycleData[phase.cycle - 1];
    var actual = cdB ? cdB.roundReps.reduce(function(a,b){return a+b;}, 0) : 0;
    var target = cdB ? cdB.targetReps : 0;
    document.getElementById('run-between-label').textContent = 'Cycle ' + phase.cycle + ' terminé';
    var nameEl = document.getElementById('run-between-name');
    nameEl.textContent = cdB ? (cdB.name || '') : '';
    nameEl.classList.toggle('hidden', !cdB || !cdB.name);
    var progEl = document.getElementById('run-between-progress');
    var pctEl = document.getElementById('run-between-pct');
    if (target > 0) {
      var pct = Math.round((actual / target) * 100);
      var pctCls = pct >= 100 ? 'pct-great' : pct >= 80 ? 'pct-good' : 'pct-low';
      progEl.textContent = actual + ' / ' + target + ' reps';
      pctEl.textContent = pct + '%';
      pctEl.className = 'rest-stat-pct ' + pctCls;
      if (pct >= 100 && !celebrationShown) {
        celebrationShown = true;
        var celKg = 0;
        if (cdB && cdB.roundWeights) cdB.roundWeights.forEach(function(w, i) { if (w > 0) celKg += w * (cdB.roundReps[i] || 0); });
        showCelebration(cdB ? (cdB.name || '') : '', actual, target, celKg);
      }
    } else {
      progEl.textContent = actual + ' reps';
      pctEl.textContent = '';
      pctEl.className = 'rest-stat-pct';
    }
    var totalCycleWeight = 0, hasCycleWeight = false;
    if (cdB && cdB.roundWeights) {
      cdB.roundWeights.forEach(function(w, i) {
        if (w > 0) { hasCycleWeight = true; totalCycleWeight += w * (cdB.roundReps[i] || 0); }
      });
    }
    var wCycleRow = document.getElementById('run-between-weight');
    if (wCycleRow) {
      if (hasCycleWeight) {
        document.getElementById('run-between-weight-val').textContent = Math.round(totalCycleWeight * 10) / 10 + ' kg';
        wCycleRow.classList.remove('hidden');
      } else {
        wCycleRow.classList.add('hidden');
      }
    }
    var nextBox = document.getElementById('run-next-cycle-box');
    if (nextBox) {
      var nextCd = sessionCycleData[phase.cycle]; // phase.cycle is 1-based; next cycle is at this index
      var nextName = nextCd ? (nextCd.name || '') : '';
      if (!nextName && currentWorkout.cycleNames) nextName = currentWorkout.cycleNames[phase.cycle] || '';
      if (nextName) {
        document.getElementById('run-next-cycle-name').textContent = nextName;
        nextBox.classList.remove('hidden');
      } else {
        nextBox.classList.add('hidden');
      }
    }
  }
}

function showCycleStartOverlay(cycleNum) {
  pendingCycleNum = cycleNum;
  var cd = sessionCycleData[cycleNum - 1];
  document.getElementById('ovs-meta').textContent = 'Cycle ' + cycleNum + ' / ' + currentWorkout.cycles;
  document.getElementById('ovs-name').textContent = cd.name || ('Cycle ' + cycleNum);
  document.getElementById('ovs-reps').value = cd.targetReps > 0 ? cd.targetReps : '';
  document.getElementById('overlay-cycle-start').classList.remove('hidden');
}

function confirmCycleStart() {
  var reps = parseInt(document.getElementById('ovs-reps').value) || 0;
  sessionCycleData[pendingCycleNum - 1].targetReps = reps;
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  var go = advancePhase();
  if (go) runInterval = setInterval(runTick, 1000);
}

function showWorkoutDone() {
  playStartChime('DONE!');
  vib([200, 100, 200, 100, 400]);
  document.getElementById('done-subtitle').textContent = currentWorkout.name;
  var html = '';
  sessionCycleData.forEach(function(cd, i) {
    var name = cd.name || ('Cycle ' + (i+1));
    var target = cd.targetReps > 0 ? cd.targetReps : null;
    var actual = cd.roundReps.reduce(function(a,b){return a+b;}, 0);
    var pctHtml = '';
    if (target) {
      var pct = Math.round((actual / target) * 100);
      var cls = pct >= 100 ? 'pct-great' : pct >= 80 ? 'pct-good' : 'pct-low';
      pctHtml = '<span class="summary-pct ' + cls + '">' + pct + '%</span>';
    } else {
      pctHtml = '<span class="summary-pct pct-none">—</span>';
    }
    var diffLevel = cd.cycleDiff > 0 ? cd.cycleDiff : (function(){
      var rated = (cd.roundDiffs||[]).filter(function(d){return d>0;});
      return rated.length > 0 ? Math.round(rated.reduce(function(a,b){return a+b;},0)/rated.length) : 0;
    })();
    var diffHtml = diffLevel > 0 ? '<span class="diff-badge diff-badge-'+diffLevel+'" style="margin-top:0.35rem">'+DIFF_LABELS[diffLevel]+'</span>' : '';
    var totalKg = 0, hasKg = false;
    if (cd.roundWeights) {
      cd.roundWeights.forEach(function(w, ri) {
        if (w > 0) { hasKg = true; totalKg += w * (cd.roundReps[ri] || 0); }
      });
    }
    var weightHtml = hasKg ? '<span class="summary-weight">' + (Math.round(totalKg * 10) / 10) + ' kg déplacés</span>' : '';
    html += '<div class="summary-row"><div class="summary-cycle">Cycle ' + (i+1) + '</div>';
    html += '<div class="summary-exercise">' + escHtml(name) + '</div>';
    html += '<div class="summary-stats"><span class="summary-reps">' + actual + (target ? ' / ' + target + ' reps' : ' reps') + '</span>' + pctHtml + '</div>';
    if (weightHtml) html += '<div>' + weightHtml + '</div>';
    if (diffHtml) html += '<div>' + diffHtml + '</div>';
    html += '</div>';
  });
  document.getElementById('done-summary').innerHTML = html;
  document.getElementById('overlay-workout-done').classList.remove('hidden');
  var lastCd = sessionCycleData[sessionCycleData.length - 1];
  if (lastCd && lastCd.targetReps > 0) {
    var lastActual = lastCd.roundReps.reduce(function(a,b){return a+b;}, 0);
    if (lastActual >= lastCd.targetReps) {
      var lastKg = 0;
      if (lastCd.roundWeights) lastCd.roundWeights.forEach(function(w, i) { if (w > 0) lastKg += w * (lastCd.roundReps[i] || 0); });
      showCelebration(lastCd.name || '', lastActual, lastCd.targetReps, lastKg);
    }
  }
}

function finishWorkoutRun() {
  dismissCelebration();
  releaseWakeLock();
  document.getElementById('overlay-workout-done').classList.add('hidden');
  document.getElementById('screen-workout-run').style.background = '';
  renderWorkouts(); show('screen-workouts');
}

function skipRunPhase() {
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  var go = advancePhase();
  if (go) runInterval = setInterval(runTick, 1000);
}

function stopWorkoutRun() {
  dismissCelebration();
  releaseWakeLock();
  isPaused = false;
  cancelAnimationFrame(pauseRafId); pauseRafId = null;
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  document.getElementById('overlay-stop-confirm').classList.add('hidden');
  document.getElementById('overlay-workout-done').classList.add('hidden');
  document.getElementById('screen-workout-run').style.background = '';
  show('screen-workouts');
}

// CHRONO
var chronoStart=0, chronoElapsed=0, chronoRunning=false, chronoRafId=null, chronoLapTimes=[];
function toggleChrono() {
  if (chronoRunning) {
    chronoElapsed += Date.now()-chronoStart; cancelAnimationFrame(chronoRafId); chronoRunning=false;
    releaseWakeLock();
    playEndChime();
    document.getElementById('chrono-start-btn').textContent='Start';
    document.getElementById('chrono-lap-btn').disabled=true;
    document.getElementById('chrono-reset-btn').disabled=false;
  } else {
    unlockAudio(); requestWakeLock(); chronoStart=Date.now(); chronoRunning=true;
    playStartChime('CHRONO');
    document.getElementById('chrono-start-btn').textContent='Pause';
    document.getElementById('chrono-lap-btn').disabled=false;
    document.getElementById('chrono-reset-btn').disabled=true;
    tickChrono();
  }
}
function tickChrono() { document.getElementById('chrono-display').textContent=formatChrono(chronoElapsed+(chronoRunning?Date.now()-chronoStart:0)); chronoRafId=requestAnimationFrame(tickChrono); }
function resetChrono() {
  cancelAnimationFrame(chronoRafId); chronoRunning=false; chronoElapsed=0; chronoLapTimes=[];
  releaseWakeLock();
  document.getElementById('chrono-display').textContent='00:00.00';
  document.getElementById('chrono-laps').innerHTML='';
  document.getElementById('chrono-start-btn').textContent='Start';
  document.getElementById('chrono-reset-btn').disabled=true;
  document.getElementById('chrono-lap-btn').disabled=true;
}
function chronoLap() {
  var ms=chronoElapsed+(Date.now()-chronoStart); chronoLapTimes.push(ms);
  var prev=chronoLapTimes.length>1?chronoLapTimes[chronoLapTimes.length-2]:0;
  var li=document.createElement('li'); li.className='lap-item';
  li.innerHTML='<span>Lap '+chronoLapTimes.length+'</span><span>'+formatChrono(ms-prev)+'</span><span class="lap-total">'+formatChrono(ms)+'</span>';
  document.getElementById('chrono-laps').prepend(li);
}

// DIFFICULTY
var DIFF_LABELS = ['','Facile','Léger','Moyen','Difficile','Extrême'];
function setDifficulty(level) {
  editDifficulty = level;
  document.querySelectorAll('#we-difficulty .diff-dot').forEach(function(btn, i) {
    btn.classList.toggle('active', i + 1 === level);
  });
}
function setRoundDiff(level) {
  currentRoundDiff = level;
  document.querySelectorAll('#run-round-diff .run-diff-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', i + 1 === level);
  });
}
function setCycleDiff(level) {
  currentCycleDiff = level;
  document.querySelectorAll('#run-cycle-diff .run-diff-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', i + 1 === level);
  });
}

// STORAGE
function loadWorkouts() { try { return JSON.parse(localStorage.getItem('workouts')||'[]'); } catch(e) { return []; } }
function saveWorkouts(list) { localStorage.setItem('workouts', JSON.stringify(list)); }
function genId() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function getWorkout(id) { return loadWorkouts().find(function(w){ return w.id===id; })||null; }

// WORKOUT LIST
function showWorkouts() { renderWorkouts(); show('screen-workouts'); }
function renderWorkouts() {
  var list = loadWorkouts();
  var ul = document.getElementById('workouts-list');
  var empty = document.getElementById('workouts-empty');
  ul.innerHTML='';
  if (!list.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  list.forEach(function(w) {
    var dur = formatTotalDuration(calcTotalDuration(w));
    var meta = roundsSummary(w)+' × '+w.cycles+'c';
    var desc = w.description ? '<span class="workout-item-desc">'+escHtml(w.description)+'</span>' : '';
    var diffBadge = w.difficulty ? '<span class="diff-badge diff-badge-'+w.difficulty+'">'+DIFF_LABELS[w.difficulty]+'</span>' : '';
    var li = document.createElement('li'); li.className='workout-item';
    li.innerHTML =
      '<div class="workout-item-main" onclick="openWorkoutPreview(\''+w.id+'\')">' +
        '<span class="workout-item-name">'+escHtml(w.name)+'</span>'+desc+
        '<div class="workout-item-meta"><span>'+meta+'</span>'+(diffBadge||'')+'<span class="meta-duration">'+dur+'</span></div>'+
      '</div>'+
      '<div class="workout-item-actions">'+
        '<button class="icon-btn" onclick="event.stopPropagation();openWorkoutEdit(getWorkout(\''+w.id+'\'),\'screen-workouts\')" aria-label="Edit">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'+
        '</button>'+
        '<button class="icon-btn danger" onclick="event.stopPropagation();deleteWorkout(\''+w.id+'\')" aria-label="Delete">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>'+
        '</button>'+
      '</div>';
    ul.appendChild(li);
  });
}
function deleteWorkout(id) {
  if (!confirm('Delete this workout?')) return;
  saveWorkouts(loadWorkouts().filter(function(w){ return w.id!==id; }));
  renderWorkouts();
}

// WORKOUT PREVIEW
var previewWorkout = null;
function openWorkoutPreview(idOrObj) {
  var w = typeof idOrObj === 'string' ? getWorkout(idOrObj) : idOrObj;
  if (!w) return;
  previewWorkout = w;
  document.getElementById('preview-title').textContent = w.name;
  var dur = formatTotalDuration(calcTotalDuration(w));
  var headerHtml = '<p class="preview-workout-name">'+escHtml(w.name)+'</p>';
  if (w.difficulty) headerHtml += '<div style="margin-bottom:0.5rem"><span class="diff-badge diff-badge-'+w.difficulty+'">'+DIFF_LABELS[w.difficulty]+'</span></div>';
  if (w.description) headerHtml += '<p class="preview-desc">'+escHtml(w.description)+'</p>';
  if (w.objective) headerHtml += '<div class="preview-objective"><span class="preview-obj-label">Objective</span><span class="preview-obj-text">'+escHtml(w.objective)+'</span></div>';
  headerHtml += '<div class="preview-meta"><span>'+w.cycles+' cycle'+(w.cycles>1?'s':'')+' · '+roundsSummary(w)+' rounds · Work '+formatDuration(w.work)+'</span><span>'+dur+'</span></div>';
  document.getElementById('preview-header').innerHTML = headerHtml;
  var cyclesHtml = '<div class="param-section-title">CYCLES</div>';
  for (var i=0; i<w.cycles; i++) {
    var cname = (w.cycleNames && w.cycleNames[i]) || '—';
    var creps = (w.cycleTargetReps && w.cycleTargetReps[i] > 0) ? w.cycleTargetReps[i]+' reps' : '';
    var crounds = (w.cycleRounds && w.cycleRounds[i] > 0) ? w.cycleRounds[i] : w.rounds;
    cyclesHtml += '<div class="preview-cycle-row"><span class="preview-cycle-num">Cycle '+(i+1)+'</span><span class="preview-cycle-name">'+escHtml(cname)+'</span><span class="preview-cycle-rounds">'+crounds+'r</span>'+(creps?'<span class="preview-cycle-reps">'+creps+'</span>':'')+'</div>';
  }
  document.getElementById('preview-cycles').innerHTML = cyclesHtml;
  show('screen-workout-preview');
}
function editCurrentPreviewWorkout() { openWorkoutEdit(previewWorkout, 'screen-workout-preview'); }
function startPreviewWorkout() { unlockAudio(); startWorkoutRun(previewWorkout); }

// WORKOUT EDIT
var editConfig = {prepare:15,work:60,rest:30,rounds:3,cycles:1,restBetweenCycles:120,cooldown:150};
var editCycleNames = [];
var editCycleTargetReps = [];
var editCycleRounds = [];
var editDifficulty = 1;
var editingWorkoutId = null;
var workoutEditOrigin = 'screen-workouts';

function adjustEditParam(key, delta) {
  editConfig[key] = Math.max(PARAM_MIN[key], editConfig[key]+delta);
  document.getElementById('we-val-'+key).textContent = PARAM_IS_COUNT[key] ? editConfig[key] : formatDuration(editConfig[key]);
  if (key === 'cycles') { collectCycleInputs(); regenerateCycleDetails(); }
}

function collectCycleInputs() {
  for (var i=0; i<50; i++) {
    var ne = document.getElementById('we-cn-'+i);
    var re = document.getElementById('we-cr-'+i);
    var rne = document.getElementById('we-crn-'+i);
    if (!ne) break;
    if (editCycleNames.length <= i) editCycleNames.push('');
    if (editCycleTargetReps.length <= i) editCycleTargetReps.push(0);
    if (editCycleRounds.length <= i) editCycleRounds.push(editConfig.rounds);
    editCycleNames[i] = ne.value;
    editCycleTargetReps[i] = parseInt(re ? re.value : 0) || 0;
    editCycleRounds[i] = parseInt(rne ? rne.value : 0) || editConfig.rounds;
  }
}

function regenerateCycleDetails() {
  var n = editConfig.cycles;
  while (editCycleNames.length < n) editCycleNames.push('');
  while (editCycleTargetReps.length < n) editCycleTargetReps.push(0);
  while (editCycleRounds.length < n) editCycleRounds.push(editConfig.rounds);
  var html = '<div class="param-section-title">CYCLE DETAILS</div>';
  for (var i=0; i<n; i++) {
    var upDis = i === 0 ? ' disabled' : '';
    var downDis = i === n-1 ? ' disabled' : '';
    html += '<div class="cycle-edit-row">'+
      '<div class="cycle-edit-header">'+
        '<span class="cycle-edit-label">Cycle '+(i+1)+'</span>'+
        '<div class="cycle-move-btns">'+
          '<button class="cycle-move-btn" onclick="moveCycle('+i+',-1)"'+upDis+'>↑</button>'+
          '<button class="cycle-move-btn" onclick="moveCycle('+i+',1)"'+downDis+'>↓</button>'+
        '</div>'+
      '</div>'+
      '<div class="cycle-edit-fields">'+
        '<input type="text" class="input-name" id="we-cn-'+i+'" placeholder="Exercise name" value="'+escHtml(editCycleNames[i]||'')+'" />'+
        '<input type="number" class="input-reps" id="we-cr-'+i+'" placeholder="Reps" inputmode="numeric" min="0" value="'+(editCycleTargetReps[i]||'')+'" />'+
      '</div>'+
      '<div class="cycle-rounds-row">'+
        '<span class="cycle-rounds-label">Rounds</span>'+
        '<input type="number" class="input-rounds" id="we-crn-'+i+'" inputmode="numeric" min="1" value="'+(editCycleRounds[i]||editConfig.rounds)+'" />'+
      '</div>'+
    '</div>';
  }
  document.getElementById('cycle-details-section').innerHTML = html;
}

function moveCycle(index, direction) {
  collectCycleInputs();
  var target = index + direction;
  if (target < 0 || target >= editConfig.cycles) return;
  var tmpName = editCycleNames[index];
  editCycleNames[index] = editCycleNames[target];
  editCycleNames[target] = tmpName;
  var tmpReps = editCycleTargetReps[index];
  editCycleTargetReps[index] = editCycleTargetReps[target];
  editCycleTargetReps[target] = tmpReps;
  var tmpRounds = editCycleRounds[index];
  editCycleRounds[index] = editCycleRounds[target];
  editCycleRounds[target] = tmpRounds;
  regenerateCycleDetails();
}

function openWorkoutEdit(workout, origin) {
  workoutEditOrigin = origin || 'screen-workouts';
  editingWorkoutId = workout ? workout.id : null;
  document.getElementById('workout-edit-title').textContent = workout ? 'Edit Workout' : 'New Workout';
  document.getElementById('workout-name').value = workout ? workout.name : '';
  document.getElementById('workout-description').value = workout ? (workout.description||'') : '';
  document.getElementById('workout-objective').value = workout ? (workout.objective||'') : '';
  var src = workout || {prepare:15,work:60,rest:30,rounds:3,cycles:1,restBetweenCycles:120,cooldown:150};
  PARAM_KEYS.forEach(function(k){ editConfig[k]=src[k]; });
  PARAM_KEYS.forEach(function(k){ document.getElementById('we-val-'+k).textContent = PARAM_IS_COUNT[k] ? editConfig[k] : formatDuration(editConfig[k]); });
  editCycleNames = workout && workout.cycleNames ? workout.cycleNames.slice() : [];
  editCycleTargetReps = workout && workout.cycleTargetReps ? workout.cycleTargetReps.slice() : [];
  editCycleRounds = workout && workout.cycleRounds ? workout.cycleRounds.slice() : [];
  setDifficulty(workout ? (workout.difficulty || 1) : 1);
  regenerateCycleDetails();
  show('screen-workout-edit');
}

function cancelWorkoutEdit() { show(workoutEditOrigin); }

function saveWorkout() {
  collectCycleInputs();
  var name = document.getElementById('workout-name').value.trim();
  if (!name) { document.getElementById('workout-name').focus(); return; }
  var desc = document.getElementById('workout-description').value.trim();
  var obj = document.getElementById('workout-objective').value.trim();
  var n = editConfig.cycles;
  var cnames = editCycleNames.slice(0, n);
  var creps = editCycleTargetReps.slice(0, n);
  var crounds = editCycleRounds.slice(0, n);
  var list = loadWorkouts();
  var newId = editingWorkoutId || genId();
  var entry = Object.assign({id:newId, name:name, description:desc, objective:obj, difficulty:editDifficulty, cycleNames:cnames, cycleTargetReps:creps, cycleRounds:crounds}, editConfig);
  if (editingWorkoutId) {
    list = list.map(function(w){ return w.id===editingWorkoutId ? entry : w; });
  } else {
    list.push(entry);
  }
  saveWorkouts(list);
  if (workoutEditOrigin === 'screen-workout-preview') {
    openWorkoutPreview(entry);
  } else {
    renderWorkouts(); show('screen-workouts');
  }
}

// ── CELEBRATION ANIMATIONS ────────────────────────────────────────────────────

function _rnd(a,b){return a+Math.random()*(b-a);}
function _rndInt(a,b){return Math.floor(_rnd(a,b+1));}
function _lerp(a,b,t){return a+(b-a)*t;}
function _crCanvas(canvas){
  var W=canvas.parentElement.offsetWidth||window.innerWidth;
  var H=canvas.parentElement.offsetHeight||window.innerHeight;
  canvas.width=W; canvas.height=H;
  return {ctx:canvas.getContext('2d'),W:W,H:H};
}

function celConfetti(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  var COLS=['#22c55e','#f59e0b','#ef4444','#3b82f6','#a855f7','#ec4899','#14b8a6','#f97316','#84cc16'];
  var pieces=Array.from({length:90},function(){return{x:_rnd(0,W),y:_rnd(-30,-5),w:_rnd(6,12),h:_rnd(3,7),rot:_rnd(0,Math.PI*2),rv:_rnd(-.18,.18),vx:_rnd(-2,2),vy:_rnd(1.5,4),col:COLS[_rndInt(0,COLS.length-1)],op:1};});
  var raf,t=0;
  function draw(){ctx.clearRect(0,0,W,H);pieces.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=0.06;p.rot+=p.rv;if(t>90)p.op=Math.max(0,p.op-0.016);ctx.save();ctx.globalAlpha=p.op;ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.col;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();});t++;if(t<160)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celFireworks(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  var COLS=['#22c55e','#f59e0b','#ef4444','#a855f7','#3b82f6','#ec4899','#ffffff'];
  var particles=[],raf,t=0;
  function burst(cx,cy,col){for(var i=0;i<55;i++){var a=Math.PI*2*i/55+_rnd(-.15,.15),sp=_rnd(1.5,4.5);particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,col:col,op:1,trail:[]});}}
  var bursts=[{t:5,x:W*.35,y:H*.35},{t:35,x:W*.65,y:H*.5},{t:60,x:W*.5,y:H*.25},{t:85,x:W*.25,y:H*.55}];
  function draw(){
    ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(0,0,W,H);
    bursts.forEach(function(b){if(t===b.t)burst(b.x,b.y,COLS[_rndInt(0,COLS.length-1)]);});
    particles.forEach(function(p){p.trail.push({x:p.x,y:p.y});if(p.trail.length>6)p.trail.shift();p.x+=p.vx;p.y+=p.vy;p.vy+=0.06;p.vx*=.98;p.vy*=.98;p.op=Math.max(0,p.op-.013);p.trail.forEach(function(tp,i){ctx.globalAlpha=p.op*(i/p.trail.length)*.6;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(tp.x,tp.y,1.5*(i/p.trail.length),0,Math.PI*2);ctx.fill();});ctx.globalAlpha=p.op;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.fill();});
    ctx.globalAlpha=1;particles=particles.filter(function(p){return p.op>0;});t++;if(t<160)raf=requestAnimationFrame(draw);
  }
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celStarRain(canvas,stage){
  stage.innerHTML='';
  var emojis=['⭐','🌟','✨','💫'];
  for(var i=0;i<22;i++){var el=document.createElement('span');el.textContent=emojis[i%emojis.length];el.style.cssText='position:absolute;font-size:'+_rnd(14,26)+'px;left:'+_rnd(2,95)+'%;top:-28px;animation:cel-fall '+_rnd(1.2,2.8)+'s '+_rnd(0,.8)+'s ease-in both;';stage.appendChild(el);}
  var tm=setTimeout(function(){stage.innerHTML='';},4000);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celTrophy(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  stage.innerHTML='';var raf,t=0;
  function draw(){ctx.clearRect(0,0,W,H);if(t>20){var n=14,cx=W/2,cy=H/2-10,prog=Math.min(1,(t-20)/30);ctx.globalAlpha=prog*.5;for(var i=0;i<n;i++){var a=Math.PI*2*i/n+t*.012,len=_rnd(25,55);ctx.save();ctx.translate(cx,cy);ctx.rotate(a);ctx.strokeStyle='#f59e0b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(30,0);ctx.lineTo(30+len,0);ctx.stroke();ctx.restore();}}ctx.globalAlpha=1;t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  var trophy=document.createElement('div');trophy.style.cssText='position:absolute;top:calc(50% - 32px);left:0;right:0;text-align:center;font-size:64px;animation:cel-pop-in .6s .1s forwards;';trophy.textContent='🏆';
  var label=document.createElement('div');label.style.cssText='position:absolute;bottom:28px;left:0;right:0;text-align:center;font-size:.82rem;font-weight:800;letter-spacing:.12em;color:#f59e0b;opacity:0;animation:cel-float-fade 2s 1.2s forwards;';label.textContent='OBJECTIF 100% !';
  stage.appendChild(trophy);stage.appendChild(label);
  var tm=setTimeout(function(){stage.innerHTML='';},4500);
  return function(){cancelAnimationFrame(raf);clearTimeout(tm);ctx.clearRect(0,0,W,H);stage.innerHTML='';};
}

function celNova(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  var cx=W/2,cy=H/2,pts=[],raf,t=0;
  var COLS=['#22c55e','#f59e0b','#3b82f6','#a855f7','#ef4444','#ec4899','#ffffff'];
  for(var i=0;i<70;i++){var a=Math.PI*2*Math.random(),sp=_rnd(.5,3.5);pts.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:_rnd(2,5),col:COLS[_rndInt(0,COLS.length-1)],op:1,twinkle:Math.random()});}
  function draw(){ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,0,W,H);pts.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.vy*=.99;if(t>30)p.op=Math.max(0,p.op-.014);var tw=Math.sin(t*.2+p.twinkle*6)*.3+.7;ctx.globalAlpha=p.op*tw;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;if(t<8){ctx.globalAlpha=(8-t)/8*.7;var g=ctx.createRadialGradient(cx,cy,0,cx,cy,60);g.addColorStop(0,'#ffffff');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,60,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}t++;if(t<150)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celSparkle(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  var sparks=[],raf,t=0;
  function cross(ctx2,x,y,r2,op,col){ctx2.save();ctx2.globalAlpha=op;ctx2.strokeStyle=col;ctx2.lineWidth=2;ctx2.beginPath();ctx2.moveTo(x-r2,y);ctx2.lineTo(x+r2,y);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(x,y-r2);ctx2.lineTo(x,y+r2);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(x-r2*.7,y-r2*.7);ctx2.lineTo(x+r2*.7,y+r2*.7);ctx2.stroke();ctx2.beginPath();ctx2.moveTo(x+r2*.7,y-r2*.7);ctx2.lineTo(x-r2*.7,y+r2*.7);ctx2.stroke();ctx2.restore();}
  for(var i=0;i<18;i++){sparks.push({x:_rnd(10,W-10),y:_rnd(10,H-10),r:_rnd(3,10),op:0,phase:0,col:['#ffffff','#f59e0b','#22c55e','#a855f7'][_rndInt(0,3)]});}
  function draw(){ctx.clearRect(0,0,W,H);sparks.forEach(function(s){s.phase+=0.07+Math.random()*.02;s.op=Math.max(0,Math.sin(s.phase));if(s.phase>Math.PI){s.phase=0;s.x=_rnd(10,W-10);s.y=_rnd(10,H-10);}cross(ctx,s.x,s.y,s.r*s.op,s.op,s.col);ctx.globalAlpha=s.op*.4;ctx.fillStyle=s.col;ctx.beginPath();ctx.arc(s.x,s.y,s.r*.25,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celRainbow(canvas,stage){
  var r=_crCanvas(canvas),ctx=r.ctx,W=r.W,H=r.H;
  var COLS=['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'],raf,t=0;
  function draw(){ctx.clearRect(0,0,W,H);var bw=W/COLS.length,phase=t*.04;COLS.forEach(function(c,i){var wave=Math.sin(phase+i*.5)*18,op=Math.sin(t*.03-.5)*.3+.55;ctx.globalAlpha=Math.max(0,op);var g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,c+'00');g.addColorStop(.5,c);g.addColorStop(1,c+'00');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(i*bw,0);ctx.lineTo((i+1)*bw,0);ctx.lineTo((i+1)*bw+wave,H);ctx.lineTo(i*bw+wave,H);ctx.closePath();ctx.fill();});ctx.globalAlpha=1;t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celRipple(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  var cx=W/2,cy=H/2,COLS=['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444'],rings=[],raf,t=0;
  function addRing(){rings.push({r:0,op:1,col:COLS[rings.length%COLS.length]});}
  addRing();
  function draw(){ctx.clearRect(0,0,W,H);if(t%22===0&&rings.length<6)addRing();rings.forEach(function(rr){rr.r+=2.2;rr.op=Math.max(0,1-rr.r/Math.max(W,H)*.9);ctx.strokeStyle=rr.col;ctx.lineWidth=3;ctx.globalAlpha=rr.op*.8;ctx.beginPath();ctx.arc(cx,cy,rr.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=rr.op*.12;ctx.fillStyle=rr.col;ctx.beginPath();ctx.arc(cx,cy,rr.r,0,Math.PI*2);ctx.fill();});rings=rings.filter(function(rr){return rr.op>0;});ctx.globalAlpha=1;ctx.fillStyle='#22c55e';ctx.beginPath();ctx.arc(cx,cy,5,0,Math.PI*2);ctx.fill();t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celSpiral(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  var cx=W/2,cy=H/2,pts=[],raf,t=0;
  var COLS=['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899'];
  for(var i=0;i<60;i++){pts.push({angle:Math.PI*2*i/60,r:0,speed:_rnd(1.2,3),col:COLS[i%COLS.length],op:1});}
  function draw(){ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,0,W,H);pts.forEach(function(p){p.angle+=.025;p.r=Math.min(p.r+p.speed,(W/2)*.9);if(t>100)p.op=Math.max(0,p.op-.02);ctx.globalAlpha=p.op*.8;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(cx+Math.cos(p.angle)*p.r,cy+Math.sin(p.angle)*p.r,3,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;t++;if(t<160)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celMagicDust(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  var dust=[],raf,t=0;
  for(var i=0;i<60;i++){dust.push({x:_rnd(5,W-5),y:_rnd(5,H-5),phase:Math.random()*Math.PI*2,r:_rnd(1.5,4),col:['#fff','#f59e0b','#a855f7','#22c55e'][_rndInt(0,3)],vx:_rnd(-.3,.3),vy:_rnd(-.5,-.1)});}
  function draw(){ctx.clearRect(0,0,W,H);dust.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.phase+=.07;if(p.y<-10)p.y=H+10;var op=Math.max(0,(Math.sin(p.phase)+1)*.5);ctx.globalAlpha=op*.9;ctx.fillStyle=p.col;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.phase*.3);ctx.beginPath();ctx.moveTo(0,-p.r*1.6);ctx.lineTo(p.r,0);ctx.lineTo(0,p.r*1.6);ctx.lineTo(-p.r,0);ctx.closePath();ctx.fill();ctx.restore();ctx.globalAlpha=op*.3;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r*2.5,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celMuscle(canvas,stage){
  stage.innerHTML='';
  for(var i=0;i<14;i++){var el=document.createElement('span');el.textContent='💪';var sz=_rnd(20,44);el.style.cssText='position:absolute;font-size:'+sz+'px;left:'+_rnd(3,88)+'%;top:'+_rnd(5,78)+'%;animation:cel-bounce-up '+_rnd(.6,1.2)+'s '+_rnd(0,.7)+'s ease both, cel-float-fade 1.2s '+(_rnd(0,.5)+1.5)+'s forwards;';stage.appendChild(el);}
  var tm=setTimeout(function(){stage.innerHTML='';},4500);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celRocket(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  stage.innerHTML='';var raf,t=0,trail=[];
  var rocket=document.createElement('span');rocket.textContent='🚀';rocket.style.cssText='position:absolute;font-size:48px;left:calc(50% - 24px);bottom:30px;animation:cel-fly-up 1.4s .3s ease-in forwards;';
  stage.appendChild(rocket);
  var FCOLS=['#f97316','#ef4444','#fbbf24'];
  function draw(){ctx.clearRect(0,0,W,H);if(t>18&&t<80){var y2=H-30-(t-18)*3.2;trail.push({x:W/2+_rnd(-8,8),y:y2+_rnd(0,16),op:1,r:_rnd(3,8),col:FCOLS[_rndInt(0,2)]});}trail.forEach(function(p){p.y+=1.5;p.op=Math.max(0,p.op-.03);ctx.globalAlpha=p.op;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});trail=trail.filter(function(p){return p.op>0;});ctx.globalAlpha=1;t++;if(t<180)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  var tm=setTimeout(function(){stage.innerHTML='';},3000);
  return function(){cancelAnimationFrame(raf);clearTimeout(tm);ctx.clearRect(0,0,W,H);stage.innerHTML='';};
}

function celFire(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  var pts=[],raf,t=0;
  for(var i=0;i<80;i++){pts.push({x:_rnd(W*.2,W*.8),y:_rnd(H*.7,H),vx:_rnd(-1,1),vy:_rnd(-2.5,-1),life:_rnd(40,90),age:0,r:_rnd(4,14)});}
  function heat(lf){var st=[{t:0,c:[239,68,68]},{t:.3,c:[249,115,22]},{t:.6,c:[251,191,36]},{t:.85,c:[255,255,180]},{t:1,c:[255,255,255]}];for(var i=1;i<st.length;i++){if(lf<st[i].t){var f=(lf-st[i-1].t)/(st[i].t-st[i-1].t);return st[i-1].c.map(function(v,j){return Math.round(_lerp(v,st[i].c[j],f));});}}return [255,255,255];}
  function draw(){ctx.clearRect(0,0,W,H);pts.forEach(function(p){if(p.age>=p.life){p.x=_rnd(W*.2,W*.8);p.y=_rnd(H*.7,H);p.vx=_rnd(-1,1);p.vy=_rnd(-2.5,-1);p.life=_rnd(40,90);p.age=0;}p.x+=p.vx+(Math.sin(t*.05+p.y*.1)*.5);p.y+=p.vy;p.vx*=.99;p.vy*=.99;p.age++;var lf=1-p.age/p.life,hc=heat(lf);ctx.globalAlpha=lf*.75;ctx.fillStyle='rgb('+hc[0]+','+hc[1]+','+hc[2]+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r*lf,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;t++;if(t<200)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  return function(){cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);};
}

function celCrown(canvas,stage){
  stage.innerHTML='';
  var crown=document.createElement('div');crown.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);text-align:center;';
  var c=document.createElement('span');c.textContent='👑';c.style.cssText='font-size:72px;display:block;animation:cel-crown .8s .1s ease both;';
  crown.appendChild(c);
  ['✨','💫','⭐','✨'].forEach(function(e,i){var s=document.createElement('span');s.textContent=e;var a=Math.PI*2*i/4,dist=65;s.style.cssText='position:absolute;font-size:20px;top:50%;left:50%;margin-top:-10px;margin-left:-10px;transform:translate('+Math.cos(a)*dist+'px,'+Math.sin(a)*dist+'px);opacity:0;animation:cel-float-fade 1.5s '+(.6+i*.12)+'s forwards;';crown.appendChild(s);});
  stage.appendChild(crown);
  var tm=setTimeout(function(){stage.innerHTML='';},4000);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celMoney(canvas,stage){
  stage.innerHTML='';
  var emojis=['💰','🪙','💵','💎','🤑'];
  for(var i=0;i<18;i++){var el=document.createElement('span');el.textContent=emojis[i%emojis.length];el.style.cssText='position:absolute;font-size:'+_rnd(16,32)+'px;left:'+_rnd(3,92)+'%;top:-30px;animation:cel-fall-spin '+_rnd(1.2,2.5)+'s '+_rnd(0,.9)+'s ease-in both;';stage.appendChild(el);}
  var jackpot=document.createElement('div');jackpot.textContent='JACKPOT !';jackpot.style.cssText='position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:1.1rem;font-weight:900;letter-spacing:.12em;color:#f59e0b;text-shadow:0 0 18px #f59e0baa;animation:cel-float-fade 2s 1.8s forwards;';
  stage.appendChild(jackpot);
  var tm=setTimeout(function(){stage.innerHTML='';},4500);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celParty(canvas,stage){
  stage.innerHTML='';
  var emojis=['🎉','🎊','🥳','🎈','🎁','🎆','🎇'];
  for(var i=0;i<16;i++){
    (function(idx){
      var el=document.createElement('span');el.textContent=emojis[idx%emojis.length];
      var a=Math.PI*2*idx/16,dist=_rnd(40,90);
      el.style.cssText='position:absolute;font-size:'+_rnd(18,34)+'px;top:50%;left:50%;margin:-16px;opacity:0;transition:none;';
      stage.appendChild(el);
      setTimeout(function(){
        el.style.transition='all .5s ease '+(idx*.04)+'s';
        el.style.transform='translate('+Math.cos(a)*dist+'px,'+Math.sin(a)*dist+'px) rotate('+_rnd(-40,40)+'deg)';
        el.style.opacity='1';
        setTimeout(function(){el.style.transform='translate('+Math.cos(a)*dist*1.6+'px,'+Math.sin(a)*dist*1.6+'px) rotate('+_rnd(-80,80)+'deg)';el.style.opacity='0';},700);
      },50+idx*30);
    })(i);
  }
  var tm=setTimeout(function(){stage.innerHTML='';},4000);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celBoom(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  stage.innerHTML='';var raf,t=0,rings=[];
  var boom=document.createElement('div');boom.textContent='💥 BOOM !';boom.style.cssText='position:absolute;top:calc(50% - 1rem);left:0;right:0;text-align:center;font-size:1.4rem;font-weight:900;color:#ef4444;letter-spacing:.08em;text-shadow:0 0 20px #ef4444;opacity:0;animation:cel-pop-in .4s .1s forwards;';stage.appendChild(boom);
  rings.push({r:0,op:1,col:'#ffffff'},{r:0,op:.7,col:'#ef4444'});
  function draw(){ctx.clearRect(0,0,W,H);if(t===0){ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(0,0,W,H);}if(t<3){ctx.fillStyle='rgba(255,255,255,'+(.3-t*.1)+')';ctx.fillRect(0,0,W,H);}if(t%18===0&&rings.length<8)rings.push({r:0,op:1,col:['#ef4444','#f97316','#ffffff'][_rndInt(0,2)]});rings.forEach(function(rr){rr.r+=3.5;rr.op=Math.max(0,1-rr.r/180);ctx.strokeStyle=rr.col;ctx.lineWidth=3;ctx.globalAlpha=rr.op;ctx.beginPath();ctx.arc(W/2,H/2,rr.r,0,Math.PI*2);ctx.stroke();});rings=rings.filter(function(rr){return rr.op>0;});ctx.globalAlpha=1;t++;if(t<180)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  var tm=setTimeout(function(){stage.innerHTML='';},4000);
  return function(){cancelAnimationFrame(raf);clearTimeout(tm);ctx.clearRect(0,0,W,H);stage.innerHTML='';};
}

function celStarEyes(canvas,stage){
  stage.innerHTML='';
  var c=document.createElement('span');c.textContent='🤩';c.style.cssText='position:absolute;font-size:68px;top:calc(50% - 44px);left:calc(50% - 34px);animation:cel-pulse 1s .1s ease infinite;';stage.appendChild(c);
  ['⭐','🌟','💫','✨'].forEach(function(e,i){var s=document.createElement('span');s.textContent=e;s.style.cssText='position:absolute;font-size:22px;top:50%;left:50%;margin:-11px;animation:cel-orbit '+(1.4+i*.2)+'s '+(i%2?'reverse ':'')+'linear infinite;transform-origin:0 0;';stage.appendChild(s);});
  var tm=setTimeout(function(){stage.innerHTML='';},4500);
  return function(){clearTimeout(tm);stage.innerHTML='';};
}

function celUnicorn(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  stage.innerHTML='';var raf,t=0,trail=[];
  var unicorn=document.createElement('span');unicorn.textContent='🦄';unicorn.style.cssText='position:absolute;font-size:48px;top:38%;margin-top:-24px;animation:cel-unicorn 2.5s .1s linear forwards;';stage.appendChild(unicorn);
  var RB=['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
  function draw(){ctx.clearRect(0,0,W,H);var prog=Math.max(0,Math.min(1,(t-6)/100)),ux=-60+prog*(W+120)-8,uy=H*.38;if(t>6&&t<110)trail.push({x:ux,y:uy,col:RB[t%RB.length],op:1,r:_rnd(4,10)});trail.forEach(function(p){p.op=Math.max(0,p.op-.018);ctx.globalAlpha=p.op;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y+_rnd(-8,8),p.r,0,Math.PI*2);ctx.fill();});trail=trail.filter(function(p){return p.op>0;});ctx.globalAlpha=1;t++;if(t<180)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  var tm=setTimeout(function(){stage.innerHTML='';},4000);
  return function(){cancelAnimationFrame(raf);clearTimeout(tm);ctx.clearRect(0,0,W,H);stage.innerHTML='';};
}

function celDragon(canvas,stage){
  var d=_crCanvas(canvas),ctx=d.ctx,W=d.W,H=d.H;
  stage.innerHTML='';var raf,t=0,fire=[];
  var dr=document.createElement('span');dr.textContent='🐉';dr.style.cssText='position:absolute;font-size:52px;top:50%;left:28px;margin-top:-26px;animation:cel-bounce-up 1s .2s ease infinite;';stage.appendChild(dr);
  var txt=document.createElement('div');txt.textContent='VICTOIRE !';txt.style.cssText='position:absolute;top:40%;left:35%;font-size:1.35rem;font-weight:900;letter-spacing:.1em;opacity:0;background:linear-gradient(90deg,#ef4444,#f97316,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:cel-pop-in .5s .5s forwards;';stage.appendChild(txt);
  function draw(){ctx.clearRect(0,0,W,H);if(t>15&&t<80){for(var i=0;i<3;i++)fire.push({x:130+_rnd(-8,8),y:H*.45+_rnd(-10,10),vx:_rnd(1.5,4),vy:_rnd(-1,1),op:1,r:_rnd(3,9),col:['#ef4444','#f97316','#fbbf24'][_rndInt(0,2)]});}fire.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.op=Math.max(0,p.op-.04);ctx.globalAlpha=p.op;ctx.fillStyle=p.col;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();});fire=fire.filter(function(p){return p.op>0;});ctx.globalAlpha=1;t++;if(t<180)raf=requestAnimationFrame(draw);}
  raf=requestAnimationFrame(draw);
  var tm=setTimeout(function(){stage.innerHTML='';},4500);
  return function(){cancelAnimationFrame(raf);clearTimeout(tm);ctx.clearRect(0,0,W,H);stage.innerHTML='';};
}

var CEL_POOL = [
  celConfetti, celFireworks, celStarRain, celTrophy, celNova,
  celSparkle, celRainbow, celRipple, celSpiral, celMagicDust,
  celMuscle, celRocket, celFire, celCrown, celMoney,
  celParty, celBoom, celStarEyes, celUnicorn, celDragon
];

function showCelebration(cycleName, actual, target, totalWeight) {
  celebrationActive = true;
  var pct = target > 0 ? Math.round((actual / target) * 100) : 100;
  document.getElementById('cel-pct').textContent = pct + '%';
  var nameEl = document.getElementById('cel-name');
  nameEl.textContent = cycleName || '';
  nameEl.style.display = cycleName ? '' : 'none';
  document.getElementById('cel-stats').textContent = actual + ' / ' + target + ' reps';
  var wEl = document.getElementById('cel-weight');
  if (wEl) {
    if (totalWeight > 0) {
      wEl.textContent = (Math.round(totalWeight * 10) / 10) + ' kg déplacés';
      wEl.classList.remove('hidden');
    } else {
      wEl.classList.add('hidden');
    }
  }
  var overlay = document.getElementById('overlay-celebration');
  overlay.classList.remove('hidden');
  var canvas = document.getElementById('cel-canvas');
  var stage = document.getElementById('cel-stage');
  stage.innerHTML = '';
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  if (_celStop) { _celStop(); _celStop = null; }
  var idx = Math.floor(Math.random() * CEL_POOL.length);
  _celStop = CEL_POOL[idx](canvas, stage);
  vib([100, 50, 100, 50, 200]);
}

function dismissCelebration() {
  if (!celebrationActive) return;
  celebrationActive = false;
  if (_celStop) { _celStop(); _celStop = null; }
  var overlay = document.getElementById('overlay-celebration');
  if (overlay) overlay.classList.add('hidden');
  var stage = document.getElementById('cel-stage');
  if (stage) stage.innerHTML = '';
}
