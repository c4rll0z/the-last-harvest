import { icon } from './icons.mjs';
import { BALANCE, CROPS, QUESTS, ownedPlots, plotPrice, questProgress, refillAvailable, buySeeds, buyShelter, shelterPlot, buyPlot, buyWindmill, buyBakery, bake, sell, claimQuest, refillSeeds, atMarket } from './engine.mjs';
const $ = id => document.getElementById(id);
const coin = n => `${n} coins`;
const cropLabel = key => key === 'bread' ? 'Bread' : CROPS[key].name;
const cropIcon = key => key === 'bread' ? 'bread' : CROPS[key].icon;
export function createMenus(getGame, returnFocus) {
  let active = null, shopTab = 'seeds', selectedPlot = null, lastState = '', opener;
  function close() { active = null; $('farm-menu').classList.add('hidden'); returnFocus(opener); }
  function open(name, plot = null) {
    const g = getGame(); if (!g.running || g.finished) return;
    g.target = null; active = name; $('farm-menu').dataset.menu = name; $('menu-content').scrollTop = 0; selectedPlot = plot; opener = document.activeElement;
    if (plot !== null) shopTab = 'land';
    $('farm-menu').classList.remove('hidden'); $('menu-feedback').textContent = ''; lastState = ''; render(); $('menu-close').focus();
  }
  const button = (action, title, disabled = false, extra = '') => `<button class="primary" data-action="${action}" ${disabled?'disabled':''} ${extra}>${title}</button>`;
  const card = (symbol, title, content, action = '') => `<article class="item-card"><div class="item-top"><span class="item-icon" aria-hidden="true">${icon(symbol)}</span><h3>${title}</h3></div>${content}${action}</article>`;
  function render(force = false) {
    if (!active) return;
    const g = getGame();
    const signature = JSON.stringify([active,shopTab,selectedPlot,g.coins,g.inventory,g.seeds,g.shelters,g.plots.map(p=>[p.owned,p.crop,p.protected,p.stormSafe]),g.stormActive,g.windmills,g.bakery,g.stats,g.harvested,[...g.questsClaimed],g.baking?Math.ceil(g.baking.remaining):null,g.paused,refillAvailable(g)]);
    $('menu-balance').textContent = `${coin(g.coins)} · ${ownedPlots(g)} / 24 plots`;
    $('menu-clock').textContent = g.paused ? 'Paused · resume to trade' : `${Math.ceil(g.duration-g.elapsed)}s left · timer keeps running`;
    if (!force && signature === lastState) return; lastState = signature;
    const can = !g.paused;
    const focusAction = document.activeElement?.dataset.action;
    const scrollTop = $('menu-content').scrollTop;
    const titles = {shop:'The farm shop',inventory:'Your inventory',quests:'Little steps. Bigger farm.',market:'The market',bakery:'The bakery'};
    $('menu-title').textContent = titles[active];
    $('menu-kicker').textContent = active === 'quests' ? 'SOMETHING TO GROW TOWARD' : 'GROWN HERE, BUILT BY YOU';
    const notes = {
      shop:'Invest your harvest. Every plot is bought individually; each store needs its own windmill.',
      inventory:'Harvested crops and seeds are separate. Every third harvest of a crop returns one seed. Crop health affects harvest quantity.',
      quests:'Claim rewards when you complete a quest. The first few are designed for this four-minute demo.',
      market:'Sell what you choose. Keep wheat for opening your bakery and making bread. Listed prices are per crop.',
      bakery:`Powered by windmill 2. Turn ${BALANCE.recipeWheat} wheat into ${BALANCE.recipeBread} bread in ${BALANCE.bakeSeconds} seconds. Bread sells for ${BALANCE.breadValue} coins at the market.`,
    }; $('menu-note').textContent = notes[active];
    let html = '';
    if (active === 'shop') {
      html = `<div class="shop-tabs" role="tablist" aria-label="Shop categories">${[['seeds','Seeds'],['land','Land'],['shelters','Shelters'],['buildings','Power & stores']].map(([key,label])=>`<button role="tab" aria-selected="${shopTab===key}" data-action="tab:${key}">${label}</button>`).join('')}</div>`;
      if (shopTab === 'seeds') html += `<div class="menu-grid">${Object.entries(CROPS).map(([key,c])=>card(c.icon,c.name,`<p>${c.min}–${c.max}°C · ${c.duration}s base growth<br>Up to ${c.yield} crops · ${c.value} coins each<br><b>${g.seeds[key]} seeds in your inventory</b></p>`,button(`seed:${key}:1`,`1 seed · ${coin(c.seedPrice)}`,!can||g.coins<c.seedPrice)+button(`seed:${key}:5`,`5 seeds · ${coin(c.seedPrice*5)}`,!can||g.coins<c.seedPrice*5))).join('')}</div><h3>A helping hand</h3><p>No seeds, no crops growing or stored, and too few coins for a seed? Pick up 3 lettuce and 3 wheat seeds for free.</p>${button('refill','Claim basic seed refill',!can||!refillAvailable(g))}`;
      if (shopTab === 'shelters') {
        html += card('shelter','Crop shelter',`<p><b>${g.shelters} ready to place · ${coin(BALANCE.shelterPrice)} each</b></p><p>Protects one plot through the entire hurricane, including storm rain and temperature damage. The shelter is destroyed at impact; its crops remain safe until the storm ends.</p><p>Place it before the hurricane. Press E beside a growing crop, or choose a plot below. Installed shelters stay on the plot when you harvest and replant. They do not stop crows.</p>`,button('shelter-buy',`Buy 1 · ${coin(BALANCE.shelterPrice)}`,!can||g.coins<BALANCE.shelterPrice));
        html += '<h3>Protect your plots</h3><div class="menu-grid">'+g.plots.map((p,i)=>({p,i})).filter(({p})=>p.owned&&(p.crop||p.protected)).map(({p,i})=>card('shelter',`Plot ${i+1}`,`<p>${p.crop?cropLabel(p.crop):'Empty plot'} · ${p.protected?'Shelter installed':p.stormSafe&&g.stormActive?'Safe for this hurricane':'Uncovered'}</p>`,button(`shelter-place:${i}`,p.protected?'Already sheltered':p.stormSafe&&g.stormActive?'Storm-safe':'Place 1 shelter',!can||!p.crop||p.protected||g.stormActive||g.shelters<1))).join('')+'</div>';
      }
      if (shopTab === 'land') {
        const candidates = g.plots.map((p,i)=>({...p,index:i})).filter(p=>!p.owned);
        if(selectedPlot!==null) candidates.sort((a,b)=>(b.index===selectedPlot)-(a.index===selectedPlot));
        html += `<p>${ownedPlots(g)} of 24 plots owned. The next plot costs ${coin(plotPrice(g))}; each later purchase adds ${BALANCE.plotPriceStep} coins.</p><div class="menu-grid">${candidates.map(p=>card('plot',`Plot ${p.index+1}${p.index===selectedPlot?' · selected':''}`,`<p>${p.index<12?'Left':'Right'} field · row ${Math.floor(p.index%12/3)+1}, column ${p.index%3+1}</p>`,button(`plot:${p.index}`,`Buy · ${coin(plotPrice(g))}`,!can||g.coins<plotPrice(g)))).join('')||'<p>You own every plot!</p>'}</div>`;
      }
      if (shopTab === 'buildings') html += `<div class="menu-grid">${card('windmill','Windmill',`<p>${g.windmills} owned · ${g.bakery?2:1} assigned · ${g.windmills-(g.bakery?2:1)} available<br>One powers the market. A second is required for the bakery.</p>`,button('windmill',g.windmills>=BALANCE.maxWindmills?'All windmills owned':`Build · ${coin(BALANCE.windmillPrice)}`,!can||g.windmills>=BALANCE.maxWindmills||g.coins<BALANCE.windmillPrice))}${card('bakery','Bakery',`<p>Use wheat to build a new business. Opening consumes the listed coins and wheat; the windmill remains assigned.</p><div class="requirements"><span class="${g.coins>=BALANCE.bakeryPrice?'met':''}">${BALANCE.bakeryPrice} coins</span><span class="${g.inventory.wheat>=BALANCE.bakeryWheat?'met':''}">${g.inventory.wheat} / ${BALANCE.bakeryWheat} wheat</span><span class="${g.windmills>=2?'met':''}">Second windmill ${g.windmills>=2?'✓':'needed'}</span></div>`,button(g.bakery?'open-bakery':'bakery',g.bakery?'Visit bakery':'Open bakery',!can||(!g.bakery&&(g.coins<BALANCE.bakeryPrice||g.inventory.wheat<BALANCE.bakeryWheat||g.windmills<2))))}${card('lock','Future store',`<p>Locked in this demo. Future stores will give more crops a purpose.</p>`)}${card('lock','Future store','<p>Locked in this demo. Grow your farm to discover what comes next.</p>')}</div><p>${icon('boat')} Boat · level 30 &nbsp; | &nbsp; ${icon('land')} More land · level 60<br>Both are future expansion previews and cannot be purchased in this demo.</p>`;
    }
    if (active === 'inventory') html = `<h3>Harvested crops & products</h3><div class="menu-grid">${Object.entries(g.inventory).map(([key,n])=>card(cropIcon(key),cropLabel(key),`<p class="quantity">${n}</p><p>${key==='bread'?BALANCE.breadValue:CROPS[key].value} coins each at the market</p>`)).join('')}</div><h3>Seeds to plant</h3><div class="menu-grid">${Object.entries(CROPS).map(([key,c])=>card(c.icon,`${c.name} seeds`,`<p><b>${g.seeds[key]}</b> remaining · one per planting<br>${c.min}–${c.max}°C · moisture ≥ ${c.moisture}% for full speed</p>`)).join('')}</div>`;
    if (active === 'inventory') html += `<h3>Farm supplies</h3>${card('shelter','Shelters',`<p><b>${g.shelters} ready to place · ${g.plots.filter(p=>p.protected).length} installed</b></p><p>Buy in Shop → Shelters. One shelter protects one plot for one hurricane.</p>`)}`;
    if (active === 'quests') html = QUESTS.map(q=>{const n=Math.min(q.target,questProgress(g,q)),claimed=g.questsClaimed.has(q.id);return `<article class="quest-row ${claimed?'claimed':''}"><div><h3>${q.title}</h3><p>${q.description}</p><small>${n} / ${q.target} · ${q.coins} coins + ${q.xp} XP</small><progress max="${q.target}" value="${n}" aria-label="${q.title}"></progress></div>${button(`quest:${q.id}`,claimed?'Claimed ✓':'Claim reward',!can||claimed||n<q.target)}</article>`;}).join('');
    if (active === 'market') html = `<div class="menu-grid">${Object.entries(g.inventory).map(([key,n])=>card(cropIcon(key),cropLabel(key),`<p><b>${n} available</b> · ${key==='bread'?BALANCE.breadValue:CROPS[key].value} coins each</p><div class="sales-actions">${button(`sell:${key}:1`,'Sell 1',!can||n<1||!atMarket(g))}${button(`sell:${key}:${n}`,`Sell all ${n}`,!can||n<1||!atMarket(g))}</div>`)).join('')}</div>`;
    if (active === 'bakery') html = card('bread','A fresh batch',`<p>${g.inventory.wheat} wheat available · ${g.inventory.bread} bread ready to sell</p><p>${g.baking?`In the oven: ${Math.ceil(g.baking.remaining)}s remaining.`:'The oven is ready.'}</p>`,button('bake',g.baking?'Baking…':`Bake · ${BALANCE.recipeWheat} wheat`,!can||!g.bakery||!!g.baking||g.inventory.wheat<BALANCE.recipeWheat));
    $('menu-content').innerHTML = html;
    $('menu-content').scrollTop = scrollTop;
    if(focusAction) [...$('menu-content').querySelectorAll('button')].find(b=>b.dataset.action===focusAction&&!b.disabled)?.focus({preventScroll:true});
  }
  $('menu-close').onclick = close;
  $('menu-content').onclick = event => {
    const b=event.target.closest('[data-action]');if(!b||b.disabled)return;
    const [action,key,n]=b.dataset.action.split(':'),g=getGame();
    if(action==='tab'){shopTab=key;$('menu-content').scrollTop=0;lastState='';render();return;}
    const before=g.events.length;
    if(action==='shelter-buy')buyShelter(g);
    if(action==='shelter-place')shelterPlot(g,Number(key));
    if(action==='seed')buySeeds(g,key,Number(n));
    if(action==='plot')buyPlot(g,Number(key));
    if(action==='windmill')buyWindmill(g);
    if(action==='bakery')buyBakery(g);
    if(action==='bake')bake(g);
    if(action==='sell')sell(g,key,Number(n));
    if(action==='quest')claimQuest(g,key);
    if(action==='refill')refillSeeds(g);
    if(action==='open-bakery'){close();g.target={x:1430,y:700};return;}
    if(g.events.length>before)$('menu-feedback').textContent=g.events.at(-1);
    render(true);
  };
  return {open,close,render,isOpen:()=>active!==null,showBuildings(){shopTab='buildings';open('shop');}};
}
