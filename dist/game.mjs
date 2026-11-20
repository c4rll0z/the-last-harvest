import { createGhost } from './ghost-ui.mjs';
import { icon } from './icons.mjs';
import { CROPS, BALANCE, WORLD, QUESTS, MARKET, BAKERY, clamp, createGame, update, interact, clap, nearestPlot, atMarket, atBakery, cropCondition, isFlooded, level, ownedPlots, plotPrice, inventoryValue, questProgress } from './engine.mjs';
import { createRenderer } from './scene.mjs';
import { createMenus } from './menus.mjs';
import { HARDWARE_PROFILES, decodeHardwareMessage, applyHardwareState, KIT_SOUNDS, planTeamOutput } from './hardware.mjs';
const $ = id => document.getElementById(id);
const canvas = $('farm');
const renderer = createRenderer(canvas, document.querySelector('.farm-dock'));
let game = createGame();
const keys = new Set();
const ghost = createGhost(()=>game);
let lastFrame=performance.now(),lastUi=0,toastUntil=0;
let soundEnabled=false,audioContext,lastWarningBeep=-10,fanOscillator=null,fanGain=null;
let port=null,reader=null,writer=null,serialConnected=false,serialBusy=false,lastSerialOutput='',lastSerialSend=0;
let raw=null,lastSampleTime=0,kitSuspended=false,hardwareProfile='team',connectionPending=false,disconnecting=false;
let serialWriteQueue=Promise.resolve(),hardwareReturn='settings',clapFlash=0,settingsWasPaused=false;
let teamOutput = null, kitTest = null;
// Opening USB resets the Mega. Sending anything into its bootloader can keep
// the sketch from starting. Read immediately, but do not transmit until a fresh
// sensor message arrives after the quiet startup window.
const STARTUP_QUIET_MS = 3000, STARTUP_TIMEOUT_MS = 10000;
let serialReady = false, serialOpenedAt = 0;
let serialStats = { bytes: 0, lines: 0, recognized: 0, invalid: 0, errors: 0 };
let serialDevice = '';
const calibration={bright:800,dark:100,dry:0,wet:600},calibrationCaptured=new Set();
const menus=createMenus(()=>game,opener=>{if(opener?.isConnected)opener.focus();else canvas.focus();});
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); toastUntil = performance.now() + 3800; }
function playTone(frequency = 420, duration = .1) {
  if (!soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.05, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Visual cues remain available when audio is unavailable. */ }
}
function updateStormAudio() {
  const active = soundEnabled && game.running && !game.paused && game.stormActive;
  if (active && !fanOscillator) {
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      fanOscillator = audioContext.createOscillator(); fanGain = audioContext.createGain();
      fanOscillator.type = 'triangle'; fanOscillator.frequency.value = 65;
      fanGain.gain.value = .025; fanOscillator.connect(fanGain); fanGain.connect(audioContext.destination); fanOscillator.start();
    } catch { fanOscillator = null; }
  } else if (!active && fanOscillator) { fanOscillator.stop(); fanOscillator = null; fanGain = null; }
}
function editable(event) { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName); }
function playable() { return game.running && !game.paused && !game.finished; }
function setTemperature(delta) {
  if (playable() && !(serialConnected && hardwareProfile === 'team')) {
    game.temperature = clamp(game.temperature + delta, 6, 42);
  }
}
function doClap() {
  if (!playable()) return;
  const scared = clap(game);
  clapFlash = performance.now() + 450;
  playTone(scared ? 680 : 360, .07);
}
function chooseCrop(crop) {
  game.selected = crop;
  document.querySelectorAll('[data-crop]').forEach(button => {
    const selected = button.dataset.crop === crop;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
  });
}
function pauseGame(paused) {
  if (!game.running) return;
  game.paused = paused; keys.clear();
  if (!paused && serialConnected && raw) applyHardwareState(game, raw, calibration);
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
  updateStormAudio(); sendOutputs(true);
}
function start() {
  $('intro').classList.add('hidden'); $('ending').classList.add('hidden');
  game.running = true; game.paused = false;
  if (serialConnected && raw) applyHardwareState(game, raw, calibration);
  game.effects.push('start');
  sendOutputs(true);
  $('pause').disabled = false; $('pause').textContent = 'Pause';
  canvas.focus(); playTone(520, .13);
  toast('Four minutes to grow your farm. Harvest the ripe lettuce, then claim your first quest!');
}
function reset() {
  stopKitTest();
  menus.close(); $('settings').classList.add('hidden'); $('hardware-modal').classList.add('hidden');
  game = createGame(); ghost.reset(); keys.clear(); lastWarningBeep = -10; chooseCrop('lettuce');
  $('rain').value = 0; $('intro').classList.remove('hidden'); $('ending').classList.add('hidden');
  $('pause').disabled = true; $('pause').textContent = 'Pause';
  $('toast').classList.remove('visible'); toastUntil = 0;
  updateStormAudio(); sendOutputs(true); $('start').focus();
}

$('seeds').innerHTML=Object.entries(CROPS).map(([key,c],i)=>`<button class="seed ${i===0?'selected':''}" data-crop="${key}" aria-pressed="${i===0}" title="${i+1}: ${c.name} · ${c.min}–${c.max}°C"><span class="seed-icon" aria-hidden="true">${icon(c.icon)}</span><span><b>${c.name}</b><small data-seed-count="${key}"></small></span></button>`).join('');
document.querySelectorAll('[data-crop]').forEach(b=>b.onclick=()=>chooseCrop(b.dataset.crop));
$('fullscreen').hidden=!document.fullscreenEnabled;
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable here. Expand the browser window instead.');}};
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');});
$('start').onclick=start;$('play-again').onclick=reset;
$('restart').onclick=()=>{reset();};
$('pause').onclick=()=>pauseGame(!game.paused);
$('sound-toggle').onclick=()=>{soundEnabled=!soundEnabled;$('sound-toggle').textContent=soundEnabled?'Sound on':'Sound off';$('sound-toggle').setAttribute('aria-pressed',soundEnabled);playTone();updateStormAudio();};
$('temp-down').onclick=()=>setTemperature(-2);$('temp-up').onclick=()=>setTemperature(2);
$('night-toggle').onclick=()=>{if(playable()&&!serialConnected)game.night=!game.night;};
$('rain').oninput=e=>{if(playable()&&!serialConnected)game.rain=Number(e.target.value)/100;};
$('clap').onclick=doClap;
$('world-hint').onclick=()=>interact(game);
$('market-walk').onclick=()=>{if(playable()){game.target={...MARKET};canvas.focus();toast('Walk to the market, then press E to choose what to sell.');}};
function toggleWeather(open){$('weather-controls').classList.toggle('hidden',!open);$('weather-toggle').setAttribute('aria-expanded',String(open));}
$('weather-toggle').onclick=()=>toggleWeather($('weather-controls').classList.contains('hidden'));
$('weather-close').onclick=()=>toggleWeather(false);
document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{keys.clear();game.target=null;menus.open(b.dataset.open);});
function settingsOpen(){
  settingsWasPaused=game.paused;pauseGame(true);keys.clear();$('intro').classList.add('hidden');$('settings').classList.remove('hidden');
  for(const input of $('balance-form').querySelectorAll('input')){input.value=BALANCE[input.name];input.disabled=game.running||game.finished;}
  $('balance-save').disabled=game.running||game.finished;
  $('settings-help').textContent=game.running||game.finished?'Restart the demo to change these values. The timer stays at four minutes.':'Set these before starting a new farm. The timer stays at four minutes.';
  $('settings-feedback').textContent='';$('settings-close').focus();
}
function settingsClose(){ $('settings').classList.add('hidden');const atStart=!game.running&&!game.finished;if(atStart)$('intro').classList.remove('hidden');if(!settingsWasPaused)pauseGame(false);(atStart?$('intro-settings'):canvas).focus(); }
$('settings-open').onclick=settingsOpen;$('intro-settings').onclick=settingsOpen;$('settings-close').onclick=settingsClose;
$('balance-form').onsubmit=e=>{e.preventDefault();if(game.running||game.finished)return;for(const input of $('balance-form').querySelectorAll('input')){const v=Number(input.value);if(!Number.isInteger(v)||v<Number(input.min)||v>Number(input.max))return;}for(const input of $('balance-form').querySelectorAll('input'))BALANCE[input.name]=Number(input.value);game=createGame();$('settings-feedback').textContent='Demo balance updated. Close settings and start growing.';};
function modalOpen(){return !!document.querySelector('.overlay:not(.hidden)');}
document.addEventListener('keydown',event=>{
  if(editable(event)||modalOpen())return;
  if(event.key.toLowerCase()==='p'&&game.running){pauseGame(!game.paused);return;}
  if(!playable())return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key))event.preventDefault();
  keys.add(event.key);if(event.repeat)return;const key=event.key.toLowerCase();
  if(key==='e'||key===' '){interact(game);playTone(480,.045);}
  if(key==='n'&&!serialConnected)game.night=!game.night;
  if(key==='r'&&!serialConnected)game.rain=game.rain<.1?.35:game.rain<.6?1:0;
  if(key==='c')doClap();if(key==='-'||key==='_')setTemperature(-2);if(key==='+'||key==='=')setTemperature(2);
  if(['1','2','3','4','5'].includes(key))chooseCrop(Object.keys(CROPS)[Number(key)-1]);
});
document.addEventListener('keyup',event=>keys.delete(event.key));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopKitTest();if(playable())pauseGame(true);}});
canvas.addEventListener('pointerdown',event=>{if(!playable()||modalOpen())return;const {x,y}=renderer.point(event.clientX,event.clientY);game.target={x:clamp(x,WORLD.minX,WORLD.maxX),y:clamp(y,WORLD.minY,WORLD.maxY)};canvas.focus();});
const markers=[];
function marker(x,y,label,classes,action){const b=document.createElement('button');b.className=`world-action ${classes}`;b.innerHTML=label;b.onclick=action;$('world-actions').append(b);const item={x,y,b};markers.push(item);return b;}
const plotMarkers=game.plots.map((p,i)=>marker(p.x,p.y,'','',()=>{if(!playable())return;keys.clear();if(!game.plots[i].owned){game.target=null;menus.open('shop',i);}else{game.target={x:p.x,y:p.y};canvas.focus();}}));
marker(329,685,'Market<small>Open · sell crops</small>','open',()=>{if(playable()){if(atMarket(game))menus.open('market');else{game.target={...MARKET};toast('Walk to the market, then press E.');}}});
const bakeryMarker=marker(1430,685,'Bakery<small>Buy to open</small>','',()=>{if(!playable())return;if(!game.bakery)menus.showBuildings();else if(atBakery(game))menus.open('bakery');else{game.target={...BAKERY};toast('Walk to the bakery, then press E.');}});
marker(373,389,`${icon('lock')} Locked`,'locked',()=>toast('A future store. Locked throughout this demo.'));
marker(1402,389,`${icon('lock')} Locked`,'locked',()=>toast('A future store. Locked throughout this demo.'));
marker(100,330,`${icon('lock')} Boat<small>Unlock at level 30</small>`,'future',()=>toast('Boat transport unlocks at level 30 in the future full game. Preview only.'));
marker(1600,480,`${icon('lock')} More land<small>Unlock at level 60</small>`,'future',()=>toast('More land unlocks at level 60 in the future full game. Preview only.'));
marker(863,183,`${icon('settings')} Settings`,'',settingsOpen);
const millMarkers=[marker(411,290,'Market power<small>Windmill 1</small>','open',()=>toast('Windmill 1 powers your market.')),marker(540,290,'Build windmill','',()=>menus.showBuildings()),marker(665,290,'Build windmill','',()=>menus.showBuildings())];
function markerLabel(button,html){if(button.dataset.markup!==html){button.innerHTML=html;button.dataset.markup=html;}}
function refreshMarkers(){
  const price=plotPrice(game);
  plotMarkers.forEach((b,i)=>{
    const p=game.plots[i];
    b.className=`world-action ${p.owned?'plot-owned':'plot-buy'}`;
    const emptyLabel=game.stormActive?'Wait for calm':isFlooded(p)?'Flooded':p.protected?'Sheltered · Plant +':'Plant +';
    const label=p.owned?(!p.crop?emptyLabel:p.stormSafe&&game.stormActive?'Storm-safe':p.protected?'Sheltered':p.growth>=1?'Harvest ✓':cropCondition(game,p)==='Growing well'?'':cropCondition(game,p)):`${icon('coin')} ${price}`;
    markerLabel(b,p.owned?`<span class="plot-tag">${label}</span>`:label);
    const description=p.crop?CROPS[p.crop].name+', '+Math.floor(p.growth*100)+'% grown':game.stormActive?'empty, wait for the hurricane to pass':isFlooded(p)?'flooded, wait for the soil to drain before planting':'empty, walk here to plant';
    b.setAttribute('aria-label',p.owned?`Plot ${i+1}: ${description}`:`Buy plot ${i+1} for ${price} coins`);
  });
  markerLabel(bakeryMarker,game.bakery?'Bakery<small>Open · make bread</small>':'Bakery<small>Buy to open</small>');bakeryMarker.classList.toggle('open',game.bakery);
  millMarkers.forEach((b,i)=>{markerLabel(b,i<game.windmills?`${i===0?'Market power':i===1&&game.bakery?'Bakery power':'Power available'}<small>Windmill ${i+1}</small>`:`Build windmill<small>${BALANCE.windmillPrice} coins</small>`);b.classList.toggle('open',i<game.windmills);});
  markers.forEach(({x,y,b})=>{const p=renderer.position(x,y);b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;b.style.transform=b.classList.contains('plot-owned')||b.classList.contains('plot-buy')?'':`scale(${Math.min(1,Math.max(.45,p.scale*1.5))})`;const owned=b.classList.contains('plot-owned');b.style.width=owned?`${92*p.scale}px`:'';b.style.height=owned?`${60*p.scale}px`:'';});
}
function ui(now){
  const remaining=Math.max(0,Math.ceil(game.duration-game.elapsed));
  $('timer').textContent=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  $('coins').textContent=game.coins;$('level-label').textContent=`Level ${level(game)}`;$('xp-label').textContent=`${game.xp%50} / 50 XP`;$('xp-meter').value=game.xp%50;
  $('storm-meter').value=game.pressure;document.body.classList.toggle('storm-warning',game.warning||game.stormActive);
  $('storm-value').textContent=game.stormActive?`${Math.ceil(BALANCE.stormDuration-game.stormElapsed)}s`:game.stormFinished?'Passed':`${Math.floor(game.pressure)}%`;
  $('storm-label').textContent=game.stormActive?'Hurricane overhead':game.warning?'Hurricane warning':'Hurricane approach';
  markerLabel($('day-label'),`${icon(game.night?'moon':'sun')} ${game.night?'Nightfall':'Daylight'}`);const weather=game.stormActive?['hurricane','Hurricane']:game.rain>.7?['downpour','Downpour']:game.rain>.1?['drizzle','Drizzle']:['sun','Clear skies'];markerLabel($('weather-label'),`${icon(weather[0])} ${weather[1]}`);markerLabel($('temperature-label'),`${icon('thermometer')} ${game.temperature}°C`);
  const owned=game.plots.filter(p=>p.owned);$('soil-label').textContent=`Soil ${Math.round(owned.reduce((sum,p)=>sum+p.moisture,0)/owned.length)}%`;
  $('temp-value').textContent=`${game.temperature}°C`;$('night-toggle').setAttribute('aria-pressed',game.night);markerLabel($('night-toggle'),`${icon(game.night?'sun':'moon')} ${game.night?'Return to daylight':'Fast night'}`);
  $('time-help').textContent=game.night?(game.warning||game.stormActive?'Night · normal speed in storm':'Night · growth ×4 · risk rising'):'Daylight · growth ×1';
  $('rain').value=Math.round(game.rain*100);$('rain-help').textContent=game.rain>.7?'Deep probe · flood risk':game.rain>.1?'Shallow probe · gentle rain':'Dry probe · no rain';
  const total=Object.values(game.inventory).reduce((a,b)=>a+b,0);$('basket-value').textContent=`${total} crops · ${inventoryValue(game)} coins`;
  $('farm-size').textContent=`${owned.length} / 24 plots`;
  document.querySelectorAll('[data-seed-count]').forEach(el=>{const k=el.dataset.seedCount;el.textContent=`${game.seeds[k]} seeds`;el.closest('button').setAttribute('aria-label',`${CROPS[k].name}, ${game.seeds[k]} seeds`);el.closest('button').classList.toggle('empty',game.seeds[k]===0);});
  const team=serialConnected&&hardwareProfile==='team';const crowAlert=game.crows?`Plot ${game.crows.target+1} · ${game.crows.elapsed<BALANCE.crowGraceSeconds?Math.ceil(BALANCE.crowGraceSeconds-game.crows.elapsed)+'s to clap!':'Crows are eating! Clap now!'}`:'';$('crow-help').textContent=crowAlert||(team?'Microphone waits for crows.':'The fields are quiet.');
  $('fan-state').textContent=team?(raw?.fan?'Board fan running':'Board fan idle'):game.stormActive?'Fan running':'Fan idle';$('buzzer-state').textContent=team?'D50 · game sounds':game.warning?'Warning beeps':'Buzzer quiet';
  const ready=QUESTS.filter(q=>!game.questsClaimed.has(q.id)&&questProgress(game,q)>=q.target);$('quest-badge').hidden=!ready.length;$('quest-badge').textContent=ready.length;
  const next=QUESTS.find(q=>!game.questsClaimed.has(q.id));$('next-step').textContent=game.stormActive?'Hurricane overhead. Replant after the storm.':game.warning?`Shelter crops before impact! ${game.shelters} shelters ready · Shop → Shelters.`:game.crows?`${crowAlert} Press C or clap.`:ready.length?`Claim: ${ready[0].title}`:next?.description||'Keep growing your farm.';
  let hint='Arrow keys to walk · E to interact';const index=nearestPlot(game);
  if(atMarket(game))hint='E · Open market · choose crops to sell';else if(atBakery(game))hint=game.bakery?'E · Open bakery':'E · Bakery requirements';else if(index>=0){const p=game.plots[index];hint=!p.owned?`E · Buy plot · ${plotPrice(game)} coins`:!p.crop?(game.stormActive?'Wait for the hurricane to pass before planting.':isFlooded(p)?'Flooded · reduce rain and wait for the soil to drain':`E · Plant ${CROPS[game.selected].name.toLowerCase()} · ${game.seeds[game.selected]} seeds`):p.growth>=1?`E · Harvest ${CROPS[p.crop].name.toLowerCase()}`:!game.stormActive&&!p.protected?`E · Place shelter · ${game.shelters} ready · buy in Shop → Shelters`:`${CROPS[p.crop].name} · ${Math.floor(p.growth*100)}% · ${cropCondition(game,p)}`;}
  $('world-hint').textContent=game.paused?'Paused · press Resume to continue':hint;
  if(game.menuRequest){keys.clear();game.target=null;const [name,id]=game.menuRequest.split(':');game.menuRequest=null;if(name==='plot')menus.open('shop',Number(id));else if(name==='shop')menus.showBuildings();else menus.open(name);}
  if(now>toastUntil)$('toast').classList.remove('visible');if(game.events.length){toast(game.events.at(-1));game.events.length=0;}
  ghost.tick();refreshMarkers();menus.render();
  const dockTop=document.querySelector('.farm-dock').getBoundingClientRect().top;$('world-hint').style.bottom=`${innerHeight-dockTop+9}px`;
  if(game.finished&&$('ending').classList.contains('hidden')){
    menus.close();$('settings').classList.add('hidden');$('ending').classList.remove('hidden');
    $('ending-copy').textContent=`Your four-minute demo is complete. You earned ${game.earned} coins from sales, expanded to ${owned.length} plots, and ${game.bakery?'opened a powered bakery':'started building your farm'}. Boat transport and distant land are future adventures.`;
    $('ending-stats').innerHTML=`<div><strong>${game.coins}</strong><small>coins saved</small></div><div><strong>${owned.length} / 24</strong><small>plots owned</small></div><div><strong>${game.bakery?2:1}</strong><small>stores open</small></div><div><strong>${game.questsClaimed.size}</strong><small>quests completed</small></div>`;
    $('pause').disabled=true;$('play-again').focus();sendOutputs(true);
  }
}
function hardwareMessage(message) { $('hardware-message').textContent = message; }

function refreshConnection() {
  const team = hardwareProfile === 'team';
  const profile = HARDWARE_PROFILES[hardwareProfile];
  $('hardware-status').textContent = serialConnected ? `● ${profile.name} ${serialReady ? 'connected' : 'starting…'}` : '● Keyboard rehearsal';
  $('control-mode').textContent = serialConnected ? 'Weather follows your physical sensors.' : 'Rehearsal controls mirror the kit.';
  $('intro-connect').querySelector('span').textContent = serialConnected ? 'Kit settings' : 'Connect kit';
  $('intro-kit-state').textContent = serialConnected ? (serialReady ? `${profile.name} connected. Your farm is ready to grow!` : 'Kit connected. Waiting for the controller to start…') : 'Play with your keyboard or connect your ELEGOO kit.';
  $('connect').disabled = serialConnected || connectionPending;
  $('disconnect').disabled = !serialConnected || connectionPending;
  $('hardware-profile').disabled = serialConnected || connectionPending;
  const canTest = serialConnected && serialReady && team && raw?.version === 4 && !connectionPending && !kitTest;
  document.querySelectorAll('[data-kit-test]').forEach(button => button.disabled = !canTest);
  $('test-bell').disabled = !canTest;
  $('test-sound').disabled = !canTest;
  $('stop-kit-test').disabled = !serialConnected || !team;
  $('night-toggle').disabled = serialConnected;
  $('rain').disabled = serialConnected;
  $('temp-down').disabled = serialConnected && team;
  $('temp-up').disabled = serialConnected && team;
  document.querySelector('[data-calibrate="bright"]').disabled = team;
  document.querySelector('[data-calibrate="dark"]').disabled = team;
  $('profile-description').textContent = team
    ? 'Team V4: D22/D23 temperature, A0 light, A1 water, D48 clap sensor, D44–D46 fan, D50 speaker, and D30–D35 LCD.'
    : 'The original bridge uses D2/D3 buttons, A0 light, A1 water, A2 sound, D8 buzzer, and D5/D6/D7 motor controls.';
  $('light-calibration-help').textContent = team
    ? 'V4 switches to night below 450 and day above 550. Adjust these thresholds in the sketch if needed. Capture the two water endpoints below.'
    : 'Capture the uncovered/covered light and dry/deep water endpoints below.';
}

function writeToKit(message) {
  const destination = writer;
  if (!destination || !serialReady) return Promise.resolve(false);
  serialWriteQueue = serialWriteQueue.then(async () => {
    if (writer !== destination) return false;
    try {
      await destination.write(new TextEncoder().encode(message + '\n'));
      return true;
    } catch {
      hardwareMessage('USB write failed. Check the cable and reconnect.');
      return false;
    }
  });
  return serialWriteQueue;
}

async function sendOutputs(force = false) {
  if (!writer || disconnecting || !serialReady) { game.effects.length = 0; return; }
  if (serialBusy) return;
  const now = performance.now();
  if (kitTest) {
    game.effects.length = 0;
    if (now >= kitTest.until) { const kind = kitTest.kind; stopKitTest(kind === 'mic' ? 'No clap received. Check D48, the sensor sensitivity knob, and its quiet startup level; then try again.' : 'Test finished. Verify the hardware behaved as expected.'); return; }
    if (now - lastSerialSend >= 750) {
      lastSerialSend = now;
      await writeToKit('PING');
    }
    return;
  }
  const effects = game.effects.splice(0);
  const team = hardwareProfile === 'team';
  const refresh = force || now - lastSerialSend >= 750;
  let message, planned;
  if (team) {
    planned = planTeamOutput(game, teamOutput, effects, refresh);
    if (!planned.commands.length) return;
    message = planned.commands.join('\n');
  } else {
    const enabled = playable();
    const buzzer = enabled && game.warning && game.elapsed % 1.2 < .14;
    message = JSON.stringify({ fan: enabled && game.stormActive ? 180 : 0, buzzer });
    if (!force && message === lastSerialOutput && now - lastSerialSend < 300) return;
  }
  serialBusy = true;
  try {
    if (await writeToKit(message)) {
      if (planned) teamOutput = planned.state;
      lastSerialOutput = message;
      lastSerialSend = performance.now();
    }
  } finally {
    serialBusy = false;
  }
}

function stopKitTest(message) {
  if (!kitTest) return;
  kitTest = null;
  teamOutput = null;
  writeToKit('STOP_ALL');
  refreshConnection();
  if (message) hardwareMessage(message);
}

async function runKitTest(kind) {
  if (!serialConnected || !serialReady || hardwareProfile !== 'team' || raw?.version !== 4) return;
  stopKitTest();
  const sounds = KIT_SOUNDS[$('test-sound').value];
  const command = kind === 'sound' ? sounds?.[0] : { fan: 'TEST_FAN', mic: 'TEST_MIC', lcd: 'TEST_LCD' }[kind];
  if (!command) return;
  // The siren preview plays its sound without running the fan.
  const output = command === 'HURRICANE_ON' ? 'TEST_SIREN' : command;
  const seconds = kind === 'fan' ? 3 : kind === 'sound' ? 4 : 10;
  kitTest = { kind, until: performance.now() + seconds * 1000 };
  refreshConnection();
  const instructions = { fan: 'Fan test: running for 3 seconds, then stopping.',
    mic: 'Clap once now. Listening for 10 seconds; the game stays paused.',
    lcd: 'LCD test: title, weather, storm countdown, and game over over 10 seconds.',
    sound: `Speaker test: ${sounds?.[1]}.` };
  hardwareMessage(instructions[kind]);
  if (!await writeToKit('STOP_ALL\n' + output)) stopKitTest('Test could not be sent. Reconnect the kit.');
}

function processSample(sample) {
  const decoded = decodeHardwareMessage(sample, hardwareProfile);
  if (!decoded) return false;
  serialStats.recognized++;
  raw = { ...raw, ...decoded.state };
  const sensorReading = ['temperature', 'dayNight', 'water'].includes(sample.type) || hardwareProfile === 'original';
  if (sensorReading) {
    lastSampleTime = performance.now();
    if (!serialReady && lastSampleTime - serialOpenedAt >= STARTUP_QUIET_MS) {
      serialReady = true;
      kitSuspended = false;
      refreshConnection();
      hardwareMessage('Controller is sending live readings. Calibrate water, then try the hardware tests.');
      // Now the sketch is running; ask it to repeat its version and output state.
      if (hardwareProfile === 'team') void writeToKit('SYNC');
    }
  }
  if (sample.type === 'ready' && serialReady) { teamOutput = null; refreshConnection(); hardwareMessage('Team V4 ready. Calibrate water and try each hardware test below.'); }
  const readings = [];
  if (Number.isFinite(raw.temperature)) readings.push(`Temperature ${raw.temperature}°C`);
  if (typeof raw.night === 'boolean') readings.push(raw.night ? 'Night' : 'Day');
  if (Number.isFinite(raw.light)) readings.push(`Light ${raw.light}`);
  if (Number.isFinite(raw.water)) readings.push(`Water ${raw.water}`);
  if (Number.isFinite(raw.sound)) readings.push(`Sound ${raw.sound}`);
  if (typeof raw.fan === 'boolean') readings.push(raw.fan ? 'Fan on' : 'Fan off');
  if (typeof raw.mic === 'boolean') readings.push(raw.mic ? 'Clap listening' : 'Clap idle');
  $('raw-values').textContent = readings.join(' · ');
  if (kitSuspended && serialReady && sensorReading) {
    kitSuspended = false;
    hardwareMessage('Sensor readings restored. Press Resume when ready.');
  }
  if (decoded.clap && kitTest?.kind === 'mic') { stopKitTest('Clap detected! The microphone test passed.'); return; }
  if (!serialReady || !playable()) return true;
  applyHardwareState(game, raw, calibration);
  if (decoded.temperatureDelta) setTemperature(decoded.temperatureDelta);
  if (decoded.clap && game.crows && !game.warning && !game.stormActive) doClap();
  return true;
}

async function disconnect() {
  if (disconnecting) return;
  disconnecting = true;
  stopKitTest();
  serialConnected = false;
  connectionPending = true;
  refreshConnection();
  await writeToKit(HARDWARE_PROFILES[hardwareProfile].stopCommand);
  if (reader) {
    try { await reader.cancel(); } catch { /* The port may already be gone. */ }
  }
  await serialWriteQueue;
  if (writer) {
    try { writer.releaseLock(); } catch { /* Disconnected port. */ }
    writer = null;
  }
  if (port) {
    try { await port.close(); } catch { /* Already closed or unplugged. */ }
    port = null;
  }
  reader = null;
  raw = null;
  serialReady = false;
  kitSuspended = false;
  game.night = false;
  game.rain = 0;
  connectionPending = false;
  disconnecting = false;
  $('raw-values').textContent = 'Waiting for sensor readings.';
  refreshConnection();
}

async function connect() {
  if (!('serial' in navigator)) {
    hardwareMessage('Web Serial is unavailable here. Open this page in desktop Chrome or Edge to connect the kit.');
    return;
  }
  if (serialConnected || connectionPending) return;
  connectionPending = true;
  refreshConnection();
  let connectionError = null;
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: HARDWARE_PROFILES[hardwareProfile].baudRate, bufferSize: 4096, flowControl: 'none' });
    // Establish the normal Arduino serial control signal once, then allow the
    // resulting reset to finish without sending SYNC or output heartbeats.
    try { await port.setSignals({ dataTerminalReady: true }); }
    catch { /* Some serial drivers do not expose control signals. */ }
    serialOpenedAt = performance.now();
    serialReady = false;
    serialStats = { bytes: 0, lines: 0, recognized: 0, invalid: 0, errors: 0 };
    const info = port.getInfo();
    serialDevice = info.usbVendorId === undefined ? 'Selected serial port' : `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${info.usbProductId.toString(16).padStart(4, '0')}`;
    writer = port.writable.getWriter();
    reader = port.readable.getReader();
    serialConnected = true;
    connectionPending = false;
    lastSampleTime = performance.now();
    lastSerialOutput = '';
    teamOutput = null;
    game.effects.length = 0;
    raw = null;
    refreshConnection();
    hardwareMessage('USB opened. Waiting quietly for the controller to restart and send sensor readings…');
    const decoder = new TextDecoder();
    let buffer = '';
    let droppingLongLine = false;
    while (serialConnected) {
      const { value, done } = await reader.read();
      if (done) break;
      serialStats.bytes += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const message = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        serialStats.lines++;
        if (!droppingLongLine && message.length <= 4096) {
          let sample;
          try { sample = JSON.parse(message); }
          catch { serialStats.invalid++; }
          if (sample !== undefined) {
            try { processSample(sample); }
            catch (error) {
              serialStats.errors++;
              console.error('Controller message handling failed', error);
              hardwareMessage('The game could not process a controller message. Reconnect, or check Connection details below.');
            }
          }
        } else serialStats.invalid++;
        droppingLongLine = false;
      }
      if (buffer.length > 4096) {
        buffer = '';
        droppingLongLine = true;
      }
    }
  } catch (error) {
    connectionError = error.name === 'NotFoundError'
      ? 'No port selected. Keyboard rehearsal is ready.'
      : `Connection failed: ${error.message}`;
  } finally {
    if (reader) {
      try { reader.releaseLock(); } catch { /* Already released. */ }
      reader = null;
    }
    if (!disconnecting && (serialConnected || connectionPending)) {
      const wasConnected = serialConnected;
      await disconnect();
      if (wasConnected) {
        pauseGame(true);
        toast('Kit disconnected. Rehearsal controls are ready. Press Resume to continue.');
      }
    }
    if (connectionError) hardwareMessage(connectionError);
  }
}

$('connect').onclick = connect;
$('disconnect').onclick = async () => {
  await disconnect();
  hardwareMessage('Disconnected. Keyboard rehearsal controls are active.');
};
$('hardware-profile').onchange = event => {
  hardwareProfile = event.target.value;
  calibrationCaptured.clear();
  refreshConnection();
};
$('test-sound').innerHTML = Object.entries(KIT_SOUNDS).map(([key, [, label]]) => `<option value="${key}">${label}</option>`).join('');
$('test-bell').onclick = () => runKitTest('sound');
document.querySelectorAll('[data-kit-test]').forEach(button => button.onclick = () => runKitTest(button.dataset.kitTest));
$('stop-kit-test').onclick = () => {
  stopKitTest();
  writeToKit('STOP_ALL'); teamOutput = null;
  hardwareMessage('Hardware tests stopped.');
};
function openHardware(from) {
  hardwareReturn = from;
  $('intro').classList.add('hidden');
  $('settings').classList.add('hidden');
  keys.clear();
  pauseGame(true);
  $('hardware-modal').classList.remove('hidden');
  $('hardware-close').focus();
}
$('hardware-open').onclick = () => openHardware('settings');
$('intro-connect').onclick = () => openHardware('intro');
$('hardware-close').onclick = () => {
  stopKitTest();
  $('hardware-modal').classList.add('hidden');
  if (hardwareReturn === 'intro') {
    $('intro').classList.remove('hidden');
    $('intro-connect').focus();
  } else {
    $('settings').classList.remove('hidden');
    $('hardware-open').focus();
  }
};

document.querySelectorAll('[data-calibrate]').forEach(button => button.onclick = () => {
  const key = button.dataset.calibrate;
  const value = key === 'bright' || key === 'dark' ? raw?.light : raw?.water;
  if (!Number.isFinite(value)) {
    hardwareMessage('Wait for the matching sensor reading from the connected kit first.');
    return;
  }
  calibration[key] = value;
  calibrationCaptured.add(key);
  const team = hardwareProfile === 'team';
  const expected = team ? 2 : 4;
  $('calibration-status').textContent = `Captured ${calibrationCaptured.size}/${expected} endpoints. Water ${calibration.dry}–${calibration.wet}.${team ? '' : ` Light ${calibration.dark}–${calibration.bright}.`}`;
  if (calibrationCaptured.size === expected && (Math.abs(calibration.wet - calibration.dry) < 40 || (!team && Math.abs(calibration.bright - calibration.dark) < 40))) {
    hardwareMessage('Endpoint readings are too close. Adjust the sensor position and recapture.');
  }
});

document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('.overlay:not(.hidden)');if(!dialog)return;
  if(event.key==='Escape'){if(dialog.id==='farm-menu')menus.close();if(dialog.id==='settings')settingsClose();if(dialog.id==='hardware-modal')$('hardware-close').click();return;}
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],summary,input:not(:disabled),select:not(:disabled)')].filter(el=>el.getClientRects().length);
  const first=controls[0],last=controls.at(-1);if(!first)return;
  if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
});
function checkSerialHealth(now) {
  const details = $('connection-details');
  if (!serialConnected) { details.textContent = 'No controller connected.'; return; }
  const age = lastSampleTime ? Math.max(0, (now - lastSampleTime) / 1000).toFixed(1) : '—';
  details.textContent = `${serialDevice} · ${HARDWARE_PROFILES[hardwareProfile].baudRate} baud · ${serialReady ? 'receiving' : 'starting'} · ${serialStats.bytes} bytes · ${serialStats.recognized} recognized messages · ${serialStats.invalid} unreadable lines · ${serialStats.errors} processing errors${serialReady ? ` · last sensor ${age}s ago` : ''}${raw?.version ? ` · firmware V${raw.version}` : ''}`;
  if (kitSuspended) return;
  const stalled = serialReady ? now - lastSampleTime > 2500 : now - serialOpenedAt > STARTUP_TIMEOUT_MS;
  if (!stalled) return;
  kitSuspended = true;
  stopKitTest();
  pauseGame(true);
  const message = serialReady ? 'Sensor readings stopped after connecting. Check the controller power and USB cable, then reconnect.'
    : serialStats.bytes === 0 ? 'The USB port opened but sent no data. Choose the Mega USB port and make sure the sketch is running.'
    : serialStats.recognized === 0 ? 'The port is sending data, but it does not match this sketch. Check Team V4 / 9600 baud and the uploaded sketch.'
    : 'The controller sent startup data but is not sending live sensor readings. Reconnect to restart the USB connection.';
  hardwareMessage(message);
  toast('Controller connection needs attention. The demo is paused.');
}
window.addEventListener('pagehide',()=>{game.paused=true;stopKitTest();writeToKit(HARDWARE_PROFILES[hardwareProfile].stopCommand);});
function frame(now){
  const dt=(now-lastFrame)/1000;lastFrame=now;
  update(game,dt,{x:Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')),y:Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'))});
  renderer.render(game,now/1000,clapFlash);
  if(now-lastUi>100){
    ui(now);lastUi=now;updateStormAudio();sendOutputs();
    checkSerialHealth(now);
    if(playable()&&game.warning&&game.elapsed-lastWarningBeep>1.2){playTone(740,.11);lastWarningBeep=game.elapsed;}
  }
  requestAnimationFrame(frame);
}
refreshConnection();$('start').focus();requestAnimationFrame(frame);
