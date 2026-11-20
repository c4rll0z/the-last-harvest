import { clamp, BALANCE, level } from './engine.mjs';

export const HARDWARE_PROFILES = {
  team: { baudRate: 9600, name: 'Team V4', stopCommand: 'STOP_ALL' },
  original: { baudRate: 115200, name: 'Original bridge', stopCommand: '{"fan":0,"buzzer":false}' },
};

function analogValue(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1023;
}

// Return durable sensor state separately from one-shot events.
export function decodeHardwareMessage(message, profile) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (profile === 'team') {
    switch (message.type) {
      case 'temperature':
        if (!Number.isFinite(message.value)) return null;
        return { state: { temperature: clamp(message.value, 5, 40) } };
      case 'dayNight':
        if (message.value !== 'day' && message.value !== 'night') return null;
        return { state: { night: message.value === 'night' } };
      case 'water':
        if (!analogValue(message.value)) return null;
        return { state: { water: message.value } };
      case 'clap':
        return message.value === true ? { state: {}, clap: true } : null;
      case 'fan':
        return ['on', 'off'].includes(message.value) ? { state: { fan: message.value === 'on' } } : null;
      case 'mic':
        return ['on', 'off'].includes(message.value) ? { state: { mic: message.value === 'on' } } : null;
      case 'ready':
        return message.version === 4 ? { state: { version: 4 } } : null;
      default:
        return null;
    }
  }
  if (profile !== 'original' || !analogValue(message.light) || !analogValue(message.water)) return null;
  const state = { light: message.light, water: message.water };
  if (analogValue(message.sound)) state.sound = message.sound;
  return {
    state,
    temperatureDelta: Number.isFinite(message.tempDelta) ? clamp(message.tempDelta, -2, 2) : 0,
    clap: message.clap === true,
  };
}

export const KIT_SOUNDS = {
  start: ['CUSTOMER_ARRIVED', 'Market opening'], plant: ['SEED_PLANTED', 'Plant a seed'],
  harvest: ['CROP_HARVESTED', 'Harvest'], sell: ['ITEM_SOLD', 'Sale'],
  purchase: ['PURCHASE', 'Purchase'], bake: ['BAKE_START', 'Start baking'],
  bread: ['BREAD_READY', 'Bread ready'], quest: ['QUEST_COMPLETE', 'Quest reward'],
  level: ['LEVEL_UP', 'Level up'], crows: ['CROWS_ARRIVED', 'Crows arrive'],
  clap: ['CROWS_SCARED', 'Crows scatter'], warning: ['HURRICANE_WARNING', 'Storm warning'],
  storm: ['HURRICANE_ON', 'Hurricane siren'], calm: ['STORM_PASSED', 'Storm passed'],
  over: ['GAME_OVER', 'Game over'],
};

// Estimate arrival if the current day/night setting stays unchanged. This is
// the same pressure/charge rule as the engine, including the charge bounds.
export function hurricaneSeconds(game) {
  if (game.stormFinished) return -1;
  if (game.stormActive) return Math.max(0, Math.ceil(BALANCE.stormDuration - game.stormElapsed));
  const baseRate = 100 / BALANCE.stormArrival;
  const rate = game.night ? .23 : -.12;
  const boundary = game.night ? 65 : 0;
  const timeToBound = Math.max(0, (boundary - game.stormCharge) / rate);
  let seconds = (100 - game.elapsed * baseRate - game.stormCharge) / (baseRate + rate);
  if (seconds > timeToBound) seconds = (100 - boundary) / baseRate - game.elapsed;
  return Math.max(0, Math.ceil(seconds));
}

// Stateful only in the caller: easy to exercise a whole demo without USB.
export function planTeamOutput(game, previous = null, effects = [], refresh = false) {
  const active = game.running && !game.paused && !game.finished;
  const phase = game.finished ? 'over' : !game.running ? 'title' : game.paused ? 'paused' : 'playing';
  const state = { phase, fan: active && (game.warning || game.stormActive),
    mic: active && Boolean(game.crows) && !game.warning && !game.stormActive,
    walking: active && game.player.moving, level: level(game) };
  const commands = [];
  if (!previous || previous.phase !== phase) commands.push('STOP_ALL');
  const changed = key => refresh || !previous || previous[key] !== state[key] || previous.phase !== phase;
  if (changed('fan')) commands.push(state.fan ? 'FAN_ON' : 'FAN_OFF');
  if (changed('mic')) commands.push(state.mic ? 'MIC_ON' : 'MIC_OFF');
  if (changed('walking')) commands.push(state.walking ? 'WALK_START' : 'WALK_STOP');
  const alert = !active ? 'Z' : game.stormActive ? 'H' : game.warning ? 'W' : game.crows ? 'C' : '-';
  const status = phase === 'title' ? 'TITLE' : phase === 'over' ? `OVER,${Math.min(999999, game.coins)}`
    : `STAT,${Math.min(999999, game.coins)},${Math.ceil(game.duration - game.elapsed)},${Math.round(game.temperature)},${Math.round(game.rain * 100)},${game.night ? 'N' : 'D'},${alert},${hurricaneSeconds(game)}`;
  state.status = status;
  if (refresh || status !== previous?.status) commands.push(status);
  // One speaker: the most consequential event wins when actions coincide.
  const pending = active ? [...effects] : [];
  if (active && previous && state.level > previous.level) pending.push('level');
  if (phase === 'over' && previous && previous.phase !== 'over') pending.push('over');
  const priorities = Object.keys(KIT_SOUNDS);
  const effect = pending.filter(key => KIT_SOUNDS[key]).sort((a, b) => priorities.indexOf(a) - priorities.indexOf(b)).at(-1);
  if (effect) commands.push(KIT_SOUNDS[effect][0]);
  return { commands, state };
}

// Reapply cached absolute state after start/resume, including events received while paused.
export function applyHardwareState(game, state, calibration) {
  if (Number.isFinite(state.temperature)) game.temperature = state.temperature;
  if (typeof state.night === 'boolean') game.night = state.night;
  if (Number.isFinite(state.light)) {
    const range = calibration.bright - calibration.dark;
    if (Math.abs(range) >= 40) {
      const light = (state.light - calibration.dark) / range;
      if (light < .3) game.night = true;
      if (light > .5) game.night = false;
    }
  }
  if (Number.isFinite(state.water)) {
    const range = calibration.wet - calibration.dry;
    if (Math.abs(range) >= 40) game.rain = clamp((state.water - calibration.dry) / range, 0, 1);
  }
}
