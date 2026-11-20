import { BALANCE, CROPS, WORLD, MARKET, BAKERY, QUESTS } from './config.mjs';
export { BALANCE, CROPS, WORLD, MARKET, BAKERY, QUESTS };
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function createGame() {
  const plots = [];
  for (let side = 0; side < 2; side++) for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const x = side === 0 ? [550, 666, 782][col] - row * 8 : [976, 1092, 1208][col] + row * 7;
    plots.push({ x, y: [433, 515, 601, 700][row], owned: side === 0 && row < 2 && col < 2,
      crop: null, growth: 0, health: 100, moisture: 62, protected: false, stormSafe: false, crowLoss: 0 });
  }
  plots[0].crop = 'lettuce'; plots[0].growth = 1;
  plots[1].crop = 'wheat'; plots[1].growth = .65;
  const counts = value => Object.fromEntries(Object.keys(CROPS).map(k => [k, value]));
  return { elapsed: 0, duration: BALANCE.duration, running: false, paused: false, finished: false,
    player: { x: 601, y: 470, facing: 1, moving: false }, target: null, selected: 'lettuce', plots,
    temperature: 22, rain: 0, night: false, stormCharge: 0, pressure: 0, stormStarted: false,
    stormActive: false, stormElapsed: 0, stormFinished: false, warning: false,
    coins: BALANCE.startingCoins, earned: 0, xp: 0, harvested: 0, cropsLost: 0,
    seeds: { ...counts(0), lettuce: BALANCE.startingSeeds, wheat: BALANCE.startingSeeds },
    inventory: { ...counts(0), bread: 0 }, cropHarvests: counts(0),
    shelters: 0, windmills: 1, bakery: false, baking: null, lastRefill: -BALANCE.starterRefillCooldown,
    stats: { sales: 0, plotsBought: 0, storesBought: 0, crowsScared: 0, berriesHarvested: 0 },
    questsClaimed: new Set(), menuRequest: null,
    crows: null, crowVisits: 0, nextCrows: BALANCE.crowFirstVisit, crowMemory: Array(24).fill(0), clapCooldown: 0,
    milestones: new Set(), events: [], effects: [],
  };
}

export function emit(game, text, effect) { game.events.push(text); if (effect) game.effects.push(effect); }
export function nearestPlot(game) {
  let nearest = -1, distance = 68;
  game.plots.forEach((plot, i) => {
    const d = Math.hypot(game.player.x - plot.x, game.player.y - plot.y);
    if (d < distance) { nearest = i; distance = d; }
  });
  return nearest;
}
export function atMarket(game) { return Math.hypot(game.player.x - MARKET.x, game.player.y - MARKET.y) < 85; }
export function cropQuantity(plot) {
  return plot.crop ? Math.max(0, Math.max(1, Math.floor(CROPS[plot.crop].yield * plot.health / 100)) - plot.crowLoss) : 0;
}
export const isFlooded = plot => plot.moisture > 89;
export function interact(game) {
  if (!game.running || game.paused || game.finished) return;
  if (atMarket(game)) { game.menuRequest = 'market'; return; }
  if (atBakery(game)) { game.menuRequest = game.bakery ? 'bakery' : 'shop'; return; }
  const index = nearestPlot(game);
  if (index < 0) { emit(game, 'Walk closer to a plot or the market.'); return; }
  const plot = game.plots[index];
  if (!plot.owned) { game.menuRequest = `plot:${index}`; return; }
  if (!plot.crop) {
    if (game.stormActive) { emit(game, 'Wait for the hurricane to pass before planting.'); return; }
    if (isFlooded(plot)) { emit(game, 'This plot is flooded. Reduce the rain and let the soil drain before planting. No seed used.'); return; }
    if (game.seeds[game.selected] <= 0) { emit(game, 'No seeds left for this crop. Visit the shop.'); return; }
    game.seeds[game.selected]--;
    plot.crop = game.selected; plot.growth = 0; plot.health = 100; plot.stormSafe = false; plot.crowLoss = 0;
    game.milestones.add('Planted'); emit(game, `${CROPS[plot.crop].name} planted. One seed used.`, 'plant');
  } else if (plot.growth >= 1) {
    const crop = plot.crop;
    const quantity = cropQuantity(plot);
    game.inventory[crop] += quantity; game.harvested++; game.cropHarvests[crop]++;
    game.xp += 5; game.milestones.add('Harvested');
    if (crop === 'berries') game.stats.berriesHarvested += quantity;
    const returned = game.cropHarvests[crop] % BALANCE.seedReturnEvery === 0;
    if (returned) game.seeds[crop]++;
    emit(game, `Harvested ${quantity} ${CROPS[crop].name.toLowerCase()}.${returned ? ' Saved one seed for replanting!' : ''}`, 'harvest');
    plot.crop = null; plot.growth = 0; plot.stormSafe = false; plot.crowLoss = 0;
    if (game.crows?.target === index) game.crows = null;
  } else if (!plot.protected && !plot.stormSafe) shelterPlot(game, index);
  else emit(game, `${CROPS[plot.crop].name} is ${Math.round(plot.growth * 100)}% grown. ${cropCondition(game, plot)}.`);
}
export function clap(game) {
  if (!game.running || game.paused || game.finished || game.clapCooldown > 0) return false;
  game.clapCooldown = 1;
  if (game.crows) {
    game.crows = null; game.stats.crowsScared++; game.milestones.add('Scared crows');
    emit(game, 'The crows scatter! The remaining crops are safe.', 'clap'); return true;
  }
  emit(game, 'Clap! No crows in the field right now.'); return false;
}
export function cropCondition(game, plot) {
  if (!plot.crop) return isFlooded(plot) ? 'Flooded' : 'Ready to plant';
  if (plot.stormSafe && game.stormActive) return 'Storm-safe';
  if (plot.protected) return 'Sheltered';
  if (isFlooded(plot)) return 'Flooding';
  if (plot.moisture < 18) return 'Too dry';
  const crop = CROPS[plot.crop];
  if (game.temperature < crop.min) return 'Too cold';
  if (game.temperature > crop.max) return 'Too hot';
  if (plot.growth >= 1) return 'Ready to harvest';
  return 'Growing well';
}
export function update(game, seconds, movement = { x: 0, y: 0 }) {
  if (!game.running || game.paused || game.finished) return;
  const dt = Math.min(Math.max(seconds, 0), .1);
  game.elapsed = Math.min(game.duration, game.elapsed + dt);
  game.clapCooldown = Math.max(0, game.clapCooldown - dt);
  let dx = movement.x, dy = movement.y;
  if (dx || dy) game.target = null;
  if (game.target) {
    const tx = game.target.x - game.player.x, ty = game.target.y - game.player.y;
    const distance = Math.hypot(tx, ty);
    if (distance < 5) game.target = null;
    else { dx = tx / distance; dy = ty / distance; }
  }
  const length = Math.hypot(dx, dy);
  game.player.moving = length > 0;
  if (length) {
    game.player.x = clamp(game.player.x + dx / length * 240 * dt, WORLD.minX, WORLD.maxX);
    game.player.y = clamp(game.player.y + dy / length * 240 * dt, WORLD.minY, WORLD.maxY);
    if (dx) game.player.facing = dx > 0 ? 1 : -1;
  }
  if (game.night) game.milestones.add('Fast night');
  if (game.rain > .15) game.milestones.add('Made rain');
  if (game.temperature !== 22) game.milestones.add('Set temperature');
  if (!game.stormStarted) {
    game.stormCharge = clamp(game.stormCharge + (game.night ? .23 : -.12) * dt, 0, 65);
    game.pressure = clamp(game.elapsed / BALANCE.stormArrival * 100 + game.stormCharge, 0, 100);
    if (game.pressure >= 80 && !game.warning) {
      game.warning = true; emit(game, 'Storm warning! Uncovered crops will be destroyed. Buy shelters in the shop and place them before impact.', 'warning');
    }
    if (game.pressure >= 100) {
      game.stormActive = true; game.stormStarted = true; game.warning = false;
      game.crows = null; emit(game, 'The hurricane has arrived! Shelters take the hit; uncovered crops are destroyed.', 'storm');
    }
  }
  if (game.stormActive) {
    game.stormElapsed += dt;
    if (game.stormElapsed >= BALANCE.stormDuration) {
      game.stormActive = false; game.stormFinished = true; game.pressure = 0;
      game.plots.forEach(plot => { plot.stormSafe = false; });
      game.milestones.add('Survived storm'); emit(game, 'The storm has passed. Gather what remains and sell it or save wheat for your bakery.', 'calm');
    }
  }
  if (game.stormActive) {
    let lost = 0, saved = 0, broken = 0;
    for (const plot of game.plots) {
      if (!plot.owned) continue;
      if (plot.protected) { plot.protected = false; plot.stormSafe = Boolean(plot.crop); broken++; if (plot.crop) saved++; }
      if (plot.crop && !plot.stormSafe) {
        plot.crop = null; plot.growth = 0; plot.crowLoss = 0; game.cropsLost++; lost++;
      }
    }
    if (lost || broken) emit(game, `Hurricane impact: ${lost} plots lost · ${saved} saved · ${broken} shelter${broken === 1 ? '' : 's'} destroyed.`);
  }
  const farmDt = dt * (game.night && !game.stormActive && !game.warning ? BALANCE.nightSpeed : 1);
  for (const plot of game.plots) {
    if (!plot.owned) continue;
    const rainfall = game.stormActive ? Math.max(game.rain, .72) : game.rain;
    const evaporation = .4 + Math.max(0, game.temperature - 18) * .035;
    plot.moisture = clamp(plot.moisture + (rainfall * 2.3 - evaporation) * farmDt, 0, 100);
    if (!plot.crop) continue;
    const crop = CROPS[plot.crop];
    const temperatureDistance = Math.max(crop.min - game.temperature, game.temperature - crop.max, 0);
    const temperatureFactor = clamp(1 - temperatureDistance / crop.tolerance, 0, 1);
    const moistureFactor = plot.moisture < crop.moisture ? clamp(plot.moisture / crop.moisture, 0, 1) : isFlooded(plot) ? .2 : 1;
    plot.growth = clamp(plot.growth + farmDt / crop.duration * temperatureFactor * moistureFactor, 0, 1);
    let damage = 0;
    if (temperatureDistance > crop.tolerance * .65) damage += 1.7;
    if (plot.moisture < 15 || plot.moisture > 94) damage += 1.1;
    if (!(game.stormActive && plot.stormSafe)) plot.health = clamp(plot.health - damage * farmDt, 0, 100);
    if (plot.health <= 0 || cropQuantity(plot) === 0) { plot.crop = null; plot.growth = 0; plot.stormSafe = false; plot.crowLoss = 0; game.cropsLost++; }
  }
  if (game.warning || game.stormActive) game.crows = null;
  let crowsArrived = false;
  if (game.elapsed >= game.nextCrows && !game.stormActive && !game.warning && !game.crows && game.elapsed < game.duration - BALANCE.crowGraceSeconds) {
    // A small adaptive forager remembers plots where it successfully found food.
    let target = -1, best = -Infinity;
    game.plots.forEach((plot, i) => {
      if (!plot.owned || !plot.crop) return;
      const score = plot.growth * 3 + game.crowMemory[i] * .6;
      if (score > best) { best = score; target = i; }
    });
    if (target >= 0) {
      game.crows = { target, elapsed: 0, bites: 0 }; game.crowVisits++; crowsArrived = true;
      emit(game, `Crows on plot ${target + 1}! Clap or press C within ${BALANCE.crowGraceSeconds} seconds to save your crops.`, 'crows');
    }
    game.nextCrows = game.elapsed + (target >= 0 ? BALANCE.crowVisitInterval : 5);
  }
  if (game.crows && !crowsArrived) {
    game.crows.elapsed += dt;
    const plot = game.plots[game.crows.target];
    const bites = game.crows.bites || 0;
    if (game.crows.elapsed >= BALANCE.crowGraceSeconds + bites * BALANCE.crowBiteInterval && plot.crop) {
      plot.crowLoss++; game.crows.bites = bites + 1;
      game.crowMemory[game.crows.target] += 1;
      const remaining = cropQuantity(plot), number = game.crows.target + 1;
      if (remaining === 0) {
        plot.crop = null; plot.growth = 0; plot.stormSafe = false; plot.crowLoss = 0; game.cropsLost++;
        emit(game, `Crows ate all the crops on plot ${number}. Plant new seeds to try again.`);
      } else emit(game, `Crows stole 1 crop from plot ${number}! ${remaining} left — clap or press C now!`);
    }
    if (!plot.crop) game.crows = null;
  }
  if (game.baking) {
    game.baking.remaining = Math.max(0, game.baking.remaining - dt);
    if (game.baking.remaining <= 0) {
      game.inventory.bread += BALANCE.recipeBread; game.baking = null;
      emit(game, 'Fresh bread is ready. Sell it at the market!', 'bread');
    }
  }
  if (game.elapsed >= game.duration) {
    game.finished = true; game.running = false; game.menuRequest = null;
    game.stormActive = false; game.warning = false; game.crows = null;
  }
}

export function atBakery(game) { return Math.hypot(game.player.x - BAKERY.x, game.player.y - BAKERY.y) < 85; }
export function level(game) { return 1 + Math.floor(game.xp / 50); }
export function ownedPlots(game) { return game.plots.filter(p => p.owned).length; }
export function plotPrice(game) { return BALANCE.plotPrice + game.stats.plotsBought * BALANCE.plotPriceStep; }
export function inventoryValue(game) { return Object.entries(game.inventory).reduce((sum, [key, n]) => sum + n * (key === 'bread' ? BALANCE.breadValue : CROPS[key].value), 0); }
function canAct(game) { return game.running && !game.paused && !game.finished; }
function fail(game, message) { emit(game, message); return false; }
export function buyShelter(game) {
  if (!canAct(game)) return false;
  if (game.coins < BALANCE.shelterPrice) return fail(game, `A shelter costs ${BALANCE.shelterPrice} coins.`);
  game.coins -= BALANCE.shelterPrice; game.shelters++;
  emit(game, 'Bought one shelter. Place it on a crop plot before the hurricane hits.', 'purchase'); return true;
}
export function shelterPlot(game, index) {
  const plot = game.plots[index];
  if (!canAct(game) || !plot?.owned || !plot.crop) return false;
  if (game.stormActive) return fail(game, 'Too late to place shelters. Wait for the hurricane to pass.');
  if (plot.protected) return fail(game, 'This plot already has a shelter.');
  if (game.shelters < 1) return fail(game, `No shelters left. Buy one in Shop → Shelters for ${BALANCE.shelterPrice} coins.`);
  game.shelters--; plot.protected = true; game.milestones.add('Sheltered crops');
  emit(game, `Shelter placed on plot ${index + 1}. It will be destroyed by the hurricane, keeping this plot's crops safe.`); return true;
}
export function buySeeds(game, crop, quantity = 5) {
  if (!canAct(game) || !CROPS[crop] || !Number.isInteger(quantity) || quantity < 1) return false;
  const price = CROPS[crop].seedPrice * quantity;
  if (game.coins < price) return fail(game, 'Not enough coins. Sell crops or claim a quest reward.');
  game.coins -= price; game.seeds[crop] += quantity; emit(game, `Bought ${quantity} ${CROPS[crop].name.toLowerCase()} seeds.`, 'purchase'); return true;
}
export function buyPlot(game, index) {
  if (!canAct(game) || !game.plots[index] || game.plots[index].owned) return false;
  const price = plotPrice(game);
  if (game.coins < price) return fail(game, `This plot costs ${price} coins.`);
  game.coins -= price; game.plots[index].owned = true; game.stats.plotsBought++; game.xp += 10;
  emit(game, 'A new plot is yours. Choose a seed and start planting!', 'purchase'); return true;
}
export function buyWindmill(game) {
  if (!canAct(game) || game.windmills >= BALANCE.maxWindmills) return false;
  if (game.coins < BALANCE.windmillPrice) return fail(game, `A windmill costs ${BALANCE.windmillPrice} coins.`);
  game.coins -= BALANCE.windmillPrice; game.windmills++; game.xp += 10;
  emit(game, 'Windmill built! One windmill powers one store.', 'purchase'); return true;
}
export function buyBakery(game) {
  if (!canAct(game) || game.bakery) return false;
  if (game.windmills < 2) return fail(game, 'Buy a second windmill to power the bakery.');
  if (game.inventory.wheat < BALANCE.bakeryWheat) return fail(game, `Save ${BALANCE.bakeryWheat} wheat to open the bakery.`);
  if (game.coins < BALANCE.bakeryPrice) return fail(game, `The bakery also costs ${BALANCE.bakeryPrice} coins.`);
  game.coins -= BALANCE.bakeryPrice; game.inventory.wheat -= BALANCE.bakeryWheat;
  game.bakery = true; game.stats.storesBought++; game.xp += 20;
  emit(game, 'Bakery open! Your second windmill is now assigned to it.', 'purchase'); return true;
}
export function bake(game) {
  if (!canAct(game) || !game.bakery || game.baking) return false;
  if (game.inventory.wheat < BALANCE.recipeWheat) return fail(game, `Each loaf needs ${BALANCE.recipeWheat} wheat.`);
  game.inventory.wheat -= BALANCE.recipeWheat; game.baking = { remaining: BALANCE.bakeSeconds };
  emit(game, `Baking bread. Ready in ${BALANCE.bakeSeconds} seconds.`, 'bake'); return true;
}
export function sell(game, crop, quantity) {
  if (!canAct(game) || !atMarket(game) || !(crop in game.inventory) || !Number.isInteger(quantity) || quantity < 1 || quantity > game.inventory[crop]) return false;
  const value = quantity * (crop === 'bread' ? BALANCE.breadValue : CROPS[crop].value);
  game.inventory[crop] -= quantity; game.coins += value; game.earned += value; game.stats.sales += quantity;
  game.xp += quantity; emit(game, `Sold ${quantity} ${crop === 'bread' ? 'bread' : CROPS[crop].name.toLowerCase()} for ${value} coins.`, 'sell'); return true;
}
export function questProgress(game, quest) { return quest.stat === 'harvested' ? game.harvested : game.stats[quest.stat]; }
export function claimQuest(game, id) {
  const q = QUESTS.find(q => q.id === id);
  if (!canAct(game) || !q || game.questsClaimed.has(id) || questProgress(game, q) < q.target) return false;
  game.questsClaimed.add(id); game.coins += q.coins; game.xp += q.xp;
  emit(game, `Quest complete: ${q.title}! +${q.coins} coins and ${q.xp} XP.`, 'quest'); return true;
}
export function refillAvailable(game) {
  return game.coins < Math.min(...Object.values(CROPS).map(c => c.seedPrice)) &&
    Object.values(game.seeds).every(n => n === 0) && Object.values(game.inventory).every(n => n === 0) &&
    !game.plots.some(p => p.crop) && !game.baking && game.elapsed - game.lastRefill >= BALANCE.starterRefillCooldown;
}
export function refillSeeds(game) {
  if (!canAct(game) || !refillAvailable(game)) return false;
  game.seeds.lettuce += BALANCE.starterRefill; game.seeds.wheat += BALANCE.starterRefill; game.lastRefill = game.elapsed;
  emit(game, 'A helping hand: three lettuce seeds and three wheat seeds.'); return true;
}
