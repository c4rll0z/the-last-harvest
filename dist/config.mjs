// Demo balance: edit these values to tune the four-minute presentation.
export const BALANCE = {
  duration: 240, startingCoins: 20, startingSeeds: 8,
  plotPrice: 30, plotPriceStep: 10, windmillPrice: 55, maxWindmills: 3,
  bakeryPrice: 70, bakeryWheat: 6, recipeWheat: 2, recipeBread: 1,
  bakeSeconds: 8, breadValue: 18, seedReturnEvery: 3,
  starterRefill: 3, starterRefillCooldown: 20, shelterPrice: 10,
  stormArrival: 185, stormDuration: 22, nightSpeed: 4,
  crowFirstVisit: 25, crowVisitInterval: 30, crowGraceSeconds: 5, crowBiteInterval: 2,
};
export const CROPS = {
  lettuce: { name: 'Lettuce', icon: 'lettuce', duration: 22, value: 4, yield: 3, seedPrice: 2, min: 14, max: 24, tolerance: 8, moisture: 32 },
  wheat: { name: 'Wheat', icon: 'wheat', duration: 30, value: 5, yield: 3, seedPrice: 2, min: 16, max: 29, tolerance: 12, moisture: 24 },
  berries: { name: 'Strawberries', icon: 'berries', duration: 36, value: 8, yield: 3, seedPrice: 5, min: 22, max: 30, tolerance: 6, moisture: 42 },
  corn: { name: 'Corn', icon: 'corn', duration: 32, value: 7, yield: 3, seedPrice: 4, min: 23, max: 32, tolerance: 9, moisture: 34 },
  tomatoes: { name: 'Tomatoes', icon: 'tomatoes', duration: 28, value: 6, yield: 3, seedPrice: 3, min: 19, max: 27, tolerance: 7, moisture: 38 },
};
export const WORLD = { width: 1672, height: 941, minX: 270, maxX: 1460, minY: 350, maxY: 800 };
export const MARKET = { x: 330, y: 700 };
export const BAKERY = { x: 1430, y: 700 };
export const QUESTS = [
  { id: 'firstHarvest', title: 'Your first harvest', description: 'Harvest one ripe plot.', target: 1, stat: 'harvested', coins: 15, xp: 10 },
  { id: 'firstSale', title: 'Open for business', description: 'Sell your first crop at the market.', target: 1, stat: 'sales', coins: 15, xp: 10 },
  { id: 'firstPlot', title: 'Room to grow', description: 'Buy one new plot.', target: 1, stat: 'plotsBought', coins: 20, xp: 15 },
  { id: 'firstStore', title: 'Fresh from the oven', description: 'Buy and power the bakery.', target: 1, stat: 'storesBought', coins: 30, xp: 30 },
  { id: 'crowPatrol', title: 'Crow patrol', description: 'Scare away three crow groups.', target: 3, stat: 'crowsScared', coins: 25, xp: 20 },
  { id: 'berryHarvest', title: 'Berry beginnings', description: 'Harvest six strawberries.', target: 6, stat: 'berriesHarvested', coins: 20, xp: 15 },
  { id: 'berryCentury', title: 'A field of strawberries', description: 'Long-term goal: harvest 100 strawberries.', target: 100, stat: 'berriesHarvested', coins: 100, xp: 100 },
];
