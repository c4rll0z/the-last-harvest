import { BALANCE, CROPS, QUESTS, level, plotPrice, questProgress, refillAvailable, isFlooded } from './engine.mjs';

// Only game data leaves the browser: no screenshots, keyboard events or identity.
export function farmSnapshot(g) {
  return {
    secondsLeft: Math.ceil(g.duration-g.elapsed), coins:g.coins, level:level(g),
    temperature:g.temperature, rain:g.rain, night:g.night, warning:g.warning,
    storm:g.stormActive, stormFinished:g.stormFinished, shelters:g.shelters,
    windmills:g.windmills, bakery:g.bakery, baking:!!g.baking,
    seeds:{...g.seeds}, inventory:{...g.inventory},
    plots:g.plots.flatMap((p,i)=>p.owned?[{number:i+1,crop:p.crop,growth:Math.round(p.growth*100),
      moisture:p.moisture,health:Math.round(p.health),sheltered:p.protected,stormSafe:p.stormSafe}]:[]),
    crowPlot:g.crows?g.crows.target+1:0,
    readyQuests:QUESTS.filter(q=>!g.questsClaimed.has(q.id)&&questProgress(g,q)>=q.target).map(q=>q.id),
    refill:refillAvailable(g), prices:{plot:plotPrice(g),shelter:BALANCE.shelterPrice,windmill:BALANCE.windmillPrice,bakery:BALANCE.bakeryPrice,bakeryWheat:BALANCE.bakeryWheat},
  };
}

export function chooseAdvice(s, {intro=false, joke=false, variant=0}={}) {
  const tip=(id,text,urgent=false)=>({id,text,urgent});
  if(s.crowPlot) return tip('crows',`Don't let the crows eat our harvest! Plot ${s.crowPlot}—clap or press C now!`,true);
  if(s.storm) return tip('storm','That wind I remember. Sheltered crops are safe for this storm. Wait for calm before planting again.',true);
  if(s.warning) {
    const exposed=s.plots.filter(p=>p.crop&&!p.sheltered).length;
    return tip('warning',exposed?`Hurricane coming! ${exposed} crop plot${exposed===1?' needs':'s need'} shelter. ${s.shelters?'Place your shelters now in Shop → Shelters.':`Buy shelters for ${s.prices.shelter} coins each in Shop → Shelters.`}`:'Hurricane coming! Your planted crops are sheltered. I wish I had been this prepared.',true);
  }
  const growing=s.plots.filter(p=>p.crop);
  const dry=growing.find(p=>p.moisture<25);
  if(dry) return tip('dry',`Make it rain! Plot ${dry.number} is drying out. A little drizzle, dear—not a swimming pool.`,true);
  const wet=s.plots.find(isFlooded);
  if(wet) return tip('wet',wet.crop?`Ease off the rain! Plot ${wet.number} is flooding. We grow crops here, not catfish.`:`Plot ${wet.number} is flooded! Ease off the rain and let it drain before planting. Seeds aren't little boats, dear.`,true);
  const hot=growing.find(p=>s.temperature>CROPS[p.crop].max);
  if(hot) return tip('hot',`${CROPS[hot.crop].name} on plot ${hot.number} needs cooler weather. Aim for ${CROPS[hot.crop].min}–${CROPS[hot.crop].max}°C.`);
  const cold=growing.find(p=>s.temperature<CROPS[p.crop].min);
  if(cold) return tip('cold',`Warm things up for the ${CROPS[cold.crop].name.toLowerCase()} on plot ${cold.number}: ${CROPS[cold.crop].min}–${CROPS[cold.crop].max}°C. Even I'm getting chills.`);
  if(intro) return tip('intro',"I'm Farmer Caren. A hurricane took me, but not my love of this farm. Harvest that ripe lettuce; I'll keep an eye on things.");
  if(s.refill) return tip('refill',"Down to nothing? Shop → Seeds has a free basic-seed refill. Nobody gives up on my watch.");
  if(joke) return tip('joke',[
    'Wish I were still alive so I could show you some real farming. These ghost hands are dreadful with a hoe.',
    'Curse that hurricane! …Wait. That is just a windmill. Carry on, dear.',
    'I used to work this land from dawn to dusk. Now I work from dusk to slightly spookier dusk.',
    'The crows never respected me alive, either. At least you can still clap.',
  ][variant%4]);
  if(s.readyQuests.length) return tip('quest','There is a quest reward waiting! Open Quests and claim your coins. Even ghosts appreciate a payday.');
  const ripe=growing.find(p=>p.growth>=100);
  if(ripe) return tip('harvest',`Plot ${ripe.number} is ripe! Walk over and press E to harvest. I can supervise, but I can't hold the basket.`);
  if(s.bakery&&!s.baking&&s.inventory.wheat>=BALANCE.recipeWheat) return tip('bake',`Your bakery is ready for ${BALANCE.recipeWheat} wheat. Let's put some life into that oven.`);
  if(s.inventory.bread||Object.entries(s.inventory).some(([k,n])=>k!=='wheat'&&n>0)) return tip('sell','Take your harvest to the market and choose what to sell. Keep wheat if you are working toward the bakery.');
  if(!s.bakery&&s.windmills>=2&&s.coins>=s.prices.bakery&&s.inventory.wheat>=s.prices.bakeryWheat) return tip('bakery','You have what the bakery needs! Open Shop → Buildings and give this farm the smell of fresh bread.');
  if(s.plots.some(p=>!p.crop&&!isFlooded(p))&&Object.values(s.seeds).some(n=>n>0)) return tip('plant','An empty plot is waiting. Choose a seed, walk over, and press E. I still find growing things rather moving.');
  if(!s.stormFinished&&s.shelters===0&&growing.some(p=>!p.sheltered)&&s.coins>=s.prices.shelter) return tip('shelter',`Set aside ${s.prices.shelter} coins for each shelter. Install them before the hurricane—I learned that lesson the hard way.`);
  if(s.night) return tip('night','Night speeds farming up fourfold, but brings the hurricane sooner. It does not give you more presentation time.');
  if(!s.bakery) return tip('progress',`The bakery needs a second windmill, ${s.prices.bakery} coins, and ${s.prices.bakeryWheat} wheat. Save a little wheat for our future loaves.`);
  return tip('quiet','Looking good, dear. Watch the soil, harvest ripe crops, and leave the haunting to me.');
}
