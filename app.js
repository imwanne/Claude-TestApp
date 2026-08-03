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
  var nWork = w.cycles * w.rounds;
  var nRest = nWork; // REST after every WORK
  var nBetween = Math.max(0, w.cycles - 1);
  return w.prepare + nWork * w.work + nRest * w.rest + nBetween * w.restBetweenCycles + w.cooldown;
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
function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, vol) {
  if (!audioCtx) return;
  vol = vol || 0.4;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'sine'; osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.start(); osc.stop(audioCtx.currentTime + dur);
}
function playPhaseSound(name) {
  if (name === 'WORK') { beep(880,0.12); setTimeout(function(){ beep(1100,0.2); },130); }
  else if (name === 'REST') { beep(440,0.3); }
  else if (name === 'REST BETWEEN CYCLES') { beep(440,0.2); setTimeout(function(){ beep(330,0.3); },250); }
  else if (name === 'COOLDOWN') { beep(660,0.25); }
  else if (name === 'DONE!') { beep(660,0.12); setTimeout(function(){ beep(880,0.12); },150); setTimeout(function(){ beep(1100,0.35); },300); }
  else { beep(660,0.1); }
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
    if (diff <= 0) { ['days','hours','minutes','seconds'].forEach(function(id){ document.getElementById(id).textContent='00'; }); document.getElementById('finished-message').classList.remove('hidden'); clearInterval(countdownInterval); return; }
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
    seq.push({name:'__CYCLE_START__', cycle:c, duration:0});
    for (var r = 1; r <= w.rounds; r++) {
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
var lastWorkSuggest = 0;

function computeSuggest(cycleIdx, roundIdx) {
  var cd = sessionCycleData[cycleIdx];
  if (!cd || !cd.targetReps) return 0;
  var done = cd.roundReps.reduce(function(a,b){return a+b;}, 0);
  var remaining = Math.max(0, cd.targetReps - done);
  var roundsLeft = currentWorkout.rounds - roundIdx;
  return roundsLeft > 0 ? Math.ceil(remaining / roundsLeft) : 0;
}

function changeRepInput(delta) {
  currentRepInputVal = Math.max(0, currentRepInputVal + delta);
  document.getElementById('run-rep-val').textContent = currentRepInputVal;
}

function startWorkoutRun(workout) {
  currentWorkout = workout;
  sessionCycleData = [];
  for (var i = 0; i < workout.cycles; i++) {
    sessionCycleData.push({
      name: (workout.cycleNames && workout.cycleNames[i]) || '',
      targetReps: (workout.cycleTargetReps && workout.cycleTargetReps[i]) || 0,
      roundReps: []
    });
  }
  runSeq = buildWorkoutSequence(workout);
  runIndex = 0; runRemaining = 0;
  currentRepInputVal = 0; lastWorkSuggest = 0;
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  document.getElementById('overlay-workout-done').classList.add('hidden');
  document.getElementById('run-cycle-name').classList.add('hidden');
  document.getElementById('run-work-panel').classList.add('hidden');
  document.getElementById('run-rest-panel').classList.add('hidden');
  document.getElementById('screen-workout-run').style.background = '';
  show('screen-workout-run');
  var first = runSeq[0];
  runRemaining = first.duration;
  updateRunDisplay();
  playPhaseSound(first.name);
  runInterval = setInterval(runTick, 1000);
}

function processCurrentPhase() {
  if (runIndex >= runSeq.length) { showWorkoutDone(); return false; }
  var phase = runSeq[runIndex];
  if (phase.name === '__CYCLE_START__') { showCycleStartOverlay(phase.cycle); return false; }
  runRemaining = phase.duration;
  if (phase.name === 'REST') {
    currentRepInputVal = lastWorkSuggest;
  }
  playPhaseSound(phase.name);
  vib([100, 50, 100]);
  updateRunDisplay();
  return true;
}

function advancePhase() {
  var leaving = runSeq[runIndex];
  if (leaving && leaving.name === 'REST' && leaving.round > 0 && leaving.cycle > 0) {
    var cd = sessionCycleData[leaving.cycle - 1];
    if (cd) cd.roundReps.push(currentRepInputVal);
  }
  runIndex++;
  return processCurrentPhase();
}

function runTick() {
  runRemaining--;
  if (runRemaining <= 3 && runRemaining > 0) { beep(440,0.06,0.25); vib(30); }
  if (runRemaining <= 0) {
    clearInterval(runInterval); runInterval = null;
    var go = advancePhase();
    if (go) runInterval = setInterval(runTick, 1000);
    return;
  }
  updateRunDisplay();
}

function updateRunDisplay() {
  var phase = runSeq[runIndex];
  if (!phase || phase.name.indexOf('__') === 0) return;

  var badge = document.getElementById('run-phase-badge');
  badge.textContent = phase.name;
  badge.style.background = phase.color || '#64748b';
  document.getElementById('run-timer').textContent = formatMmSs(runRemaining);
  document.getElementById('run-progress').textContent = phase.round > 0
    ? 'Round ' + phase.round + ' / ' + currentWorkout.rounds + '  ·  Cycle ' + phase.cycle + ' / ' + currentWorkout.cycles : '';
  document.getElementById('screen-workout-run').style.background = (phase.color || '#64748b') + '14';

  var isWork = phase.name === 'WORK';
  var isRest = phase.name === 'REST';

  // Cycle name (visible during WORK and REST)
  var cycleName = '';
  if ((isWork || isRest) && phase.cycle > 0) {
    var cd0 = sessionCycleData[phase.cycle - 1];
    cycleName = cd0 ? (cd0.name || '') : '';
  }
  var cycleNameEl = document.getElementById('run-cycle-name');
  cycleNameEl.textContent = cycleName;
  cycleNameEl.classList.toggle('hidden', !cycleName);

  // WORK panel: reps suggestion + remaining
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

  // REST panel: rep stepper
  var restPanel = document.getElementById('run-rest-panel');
  restPanel.classList.toggle('hidden', !isRest);
  if (isRest) {
    document.getElementById('run-rep-val').textContent = currentRepInputVal;
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
  playPhaseSound('DONE!');
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
    html += '<div class="summary-row"><div class="summary-cycle">Cycle ' + (i+1) + '</div>';
    html += '<div class="summary-exercise">' + escHtml(name) + '</div>';
    html += '<div class="summary-stats"><span class="summary-reps">' + actual + (target ? ' / ' + target + ' reps' : ' reps') + '</span>' + pctHtml + '</div></div>';
  });
  document.getElementById('done-summary').innerHTML = html;
  document.getElementById('overlay-workout-done').classList.remove('hidden');
}

function finishWorkoutRun() {
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
  if (runInterval) { clearInterval(runInterval); runInterval = null; }
  document.getElementById('overlay-cycle-start').classList.add('hidden');
  document.getElementById('overlay-workout-done').classList.add('hidden');
  document.getElementById('screen-workout-run').style.background = '';
  show('screen-workouts');
}

// CHRONO
var chronoStart=0, chronoElapsed=0, chronoRunning=false, chronoRafId=null, chronoLapTimes=[];
function toggleChrono() {
  if (chronoRunning) {
    chronoElapsed += Date.now()-chronoStart; cancelAnimationFrame(chronoRafId); chronoRunning=false;
    document.getElementById('chrono-start-btn').textContent='Start';
    document.getElementById('chrono-lap-btn').disabled=true;
    document.getElementById('chrono-reset-btn').disabled=false;
  } else {
    unlockAudio(); chronoStart=Date.now(); chronoRunning=true;
    document.getElementById('chrono-start-btn').textContent='Pause';
    document.getElementById('chrono-lap-btn').disabled=false;
    document.getElementById('chrono-reset-btn').disabled=true;
    tickChrono();
  }
}
function tickChrono() { document.getElementById('chrono-display').textContent=formatChrono(chronoElapsed+(chronoRunning?Date.now()-chronoStart:0)); chronoRafId=requestAnimationFrame(tickChrono); }
function resetChrono() {
  cancelAnimationFrame(chronoRafId); chronoRunning=false; chronoElapsed=0; chronoLapTimes=[];
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
    var meta = w.rounds+'r × '+w.cycles+'c';
    var desc = w.description ? '<span class="workout-item-desc">'+escHtml(w.description)+'</span>' : '';
    var li = document.createElement('li'); li.className='workout-item';
    li.innerHTML =
      '<div class="workout-item-main" onclick="openWorkoutPreview(\''+w.id+'\')">' +
        '<span class="workout-item-name">'+escHtml(w.name)+'</span>'+desc+
        '<div class="workout-item-meta"><span>'+meta+'</span><span class="meta-duration">'+dur+'</span></div>'+
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
  if (w.description) headerHtml += '<p class="preview-desc">'+escHtml(w.description)+'</p>';
  if (w.objective) headerHtml += '<div class="preview-objective"><span class="preview-obj-label">Objective</span><span class="preview-obj-text">'+escHtml(w.objective)+'</span></div>';
  headerHtml += '<div class="preview-meta"><span>'+w.cycles+' cycle'+(w.cycles>1?'s':'')+' · '+w.rounds+' rounds · Work '+formatDuration(w.work)+'</span><span>'+dur+'</span></div>';
  document.getElementById('preview-header').innerHTML = headerHtml;
  var cyclesHtml = '<div class="param-section-title">CYCLES</div>';
  for (var i=0; i<w.cycles; i++) {
    var cname = (w.cycleNames && w.cycleNames[i]) || '—';
    var creps = (w.cycleTargetReps && w.cycleTargetReps[i] > 0) ? w.cycleTargetReps[i]+' reps' : '';
    cyclesHtml += '<div class="preview-cycle-row"><span class="preview-cycle-num">Cycle '+(i+1)+'</span><span class="preview-cycle-name">'+escHtml(cname)+'</span>'+(creps?'<span class="preview-cycle-reps">'+creps+'</span>':'')+'</div>';
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
    if (!ne) break;
    if (editCycleNames.length <= i) editCycleNames.push('');
    if (editCycleTargetReps.length <= i) editCycleTargetReps.push(0);
    editCycleNames[i] = ne.value;
    editCycleTargetReps[i] = parseInt(re ? re.value : 0) || 0;
  }
}

function regenerateCycleDetails() {
  var n = editConfig.cycles;
  while (editCycleNames.length < n) editCycleNames.push('');
  while (editCycleTargetReps.length < n) editCycleTargetReps.push(0);
  var html = '<div class="param-section-title">CYCLE DETAILS</div>';
  for (var i=0; i<n; i++) {
    html += '<div class="cycle-edit-row">'+
      '<div class="cycle-edit-label">Cycle '+(i+1)+'</div>'+
      '<div class="cycle-edit-fields">'+
        '<input type="text" class="input-name" id="we-cn-'+i+'" placeholder="Exercise name" value="'+escHtml(editCycleNames[i]||'')+'" />'+
        '<input type="number" class="input-reps" id="we-cr-'+i+'" placeholder="Reps" inputmode="numeric" min="0" value="'+(editCycleTargetReps[i]||'')+'" />'+
      '</div>'+
    '</div>';
  }
  document.getElementById('cycle-details-section').innerHTML = html;
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
  var list = loadWorkouts();
  var newId = editingWorkoutId || genId();
  var entry = Object.assign({id:newId, name:name, description:desc, objective:obj, cycleNames:cnames, cycleTargetReps:creps}, editConfig);
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
