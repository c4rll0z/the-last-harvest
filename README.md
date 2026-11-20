# The Last Harvest

A four-minute farm expansion demo for the KSU AI Club Hackathon. Grow crops, sell them, purchase land and windmills, and open a bakery. The timer limits presentation length; there is no ferry story, sales quota, or win/loss threshold.

## Run

Double-click `Play The Last Harvest.command`, or run `python3 launch.py`. Keep the server’s Terminal window open while playing. Alternatively, run `python3 -m http.server 8765 --bind 127.0.0.1 --directory dist` and visit http://127.0.0.1:8765. Modules require HTTP/HTTPS rather than opening index.html directly.

## Farmer Caren: AI and offline play

Caren is the ghost of the former farmer, who died in a hurricane. Her original SVG portrait, written dialogue, automatic farm reactions, occasional jokes, and **Any advice?** button are included in this repository. No audio or Arduino firmware changes are needed.

**No credentials required:** clone/download the project and run `python3 launch.py` with Python 3.9 or newer. No packages need installing. The entire game works, and Caren uses contextual built-in tips. A plain static web server also supports built-in tips.

**Optional live AI:** copy `.env.example` to `.env.local`, replace its placeholder with your own OpenAI API key, and run `python3 launch.py` again. The default model is GPT-6 Luna (`gpt-6-luna`). Set `OPENAI_MODEL` server-side to change it; a replacement must support the request options in `server/advice.py`. A working OpenAI API account with credits is needed. Never commit `.env.local`, put a key in browser code, or share a personal key with teammates. Each teammate can use their own project key. The local server only serves the `dist` folder and binds to `127.0.0.1`.

Caren reads a limited game-state snapshot: crops, soil, weather, coins, seeds, inventory, shelters and progress. She does not take screenshots or read personal data. Requests go to the local/hosted server and then OpenAI; the browser never receives the key. API requests use `store: false`. AI replies are labeled **AI dialogue · GPT-6 Luna**; predefined dialogue is labeled **Built-in tip** or **Farm alert · built-in**. AI can still make mistakes; it cannot alter the farm or issue actions.

Crows, hurricane warnings, dry soil and flooding produce immediate built-in alerts without waiting for a model. Ordinary tips and jokes may be rewritten by AI. The game discards late replies when a newer warning arrives, the player dismisses the bubble, the game pauses or restarts, or the relevant tip changes. Settings can turn off ordinary automatic tips and jokes while keeping urgent alerts.

Requests are capped at ten per game, separated by at least 15 active seconds. Each server process/Worker instance applies an additional 15-real-second interval and 60 requests/hour, with a 5.5-second upstream timeout and built-in fallback. Hosted in-memory limits are best effort and can reset or differ across Worker instances; they are not a billing cap. Keep hosted access private. Do not make this endpoint public without durable quotas and appropriate authorization.

**Hosted play:** `node scripts/build-hosted.mjs` builds a Worker containing the game assets and `/api/advice`. Configure `OPENAI_API_KEY` as a secret in the hosting provider's environment settings; this is separate from your local `.env.local`. An optional `OPENAI_MODEL` setting selects the model. Preserve the private Site's access policy. Cloned copies always call their own same-origin server, never this project's hosted endpoint. GitHub Pages alone is static hosting and therefore supports built-in tips only; live AI requires the Python launcher or a compatible server deployment. Cloners should remove the original `.openai/hosting.json` Site identity before setting up their own hosting.

If AI stops working, check key expiration, API credits and connectivity, then restart the local server after changing the key. An expired or missing key does not stop gameplay or built-in tips. Set your recording key's expiration to cover the demo; the original setup used a seven-day key.

## Farm and economy

- 24 plots, arranged in two fields of 3 columns × 4 rows. Four plots in the left field are initially owned. A ripe lettuce and partially grown wheat help introduce harvesting.
- Start with 20 coins, 8 lettuce seeds, and 8 wheat seeds. Planting uses one seed. Wheat, lettuce, strawberry, corn, and tomato seeds can be purchased individually or in packs of five.
- A healthy plot yields 3 crops. Damage reduces quantity, with a minimum of 1 for a surviving crop. Every third harvest **of the same crop** returns one seed of that crop.
- The inventory tracks each crop, bread, and seed quantity separately. At the market, sell one or all of an individual crop, allowing wheat to be reserved for the bakery.
- Each new plot costs 30 coins initially, increasing by 10 after each purchase. Choose the exact plot in the scene or shop.
- One windmill initially powers the market. New windmills cost 55 coins. A maximum of three can be owned; unused capacity is visibly available for future stores.
- The bakery consumes 70 coins and 6 wheat to open, and requires a second windmill. That windmill is automatically assigned to it. Bake 2 wheat into 1 bread in 8 active seconds; bread sells for 18 coins at the market.
- Two unnamed stores remain chained and locked. Boat transport (level 30) and distant land (level 60) are future expansion previews, not functional demo unlocks.
- Earn XP from harvesting, sales, construction, and claimed quests. Every 50 XP advances a level. Starter quests reward a first harvest, sale, plot, and bakery. Other quests cover crows and strawberries, including a clearly labeled long-term 100-strawberry goal.
- A free refill supplies 3 lettuce and 3 wheat seeds if there are no seeds, harvested crops, growing crops, or baking bread, and fewer coins than the cheapest seed. Refills have a 20-active-second cooldown.
- Progress is per demo run. Refreshing or restarting resets it; persistent saves are outside this demo.

## Controls and menus

| Input | Action |
| --- | --- |
| Arrow keys / click the field | Walk |
| E or Space | Plant, harvest, place a purchased shelter on a growing crop before the hurricane, or open a nearby store |
| 1–5 | Select lettuce, wheat, strawberries, corn, tomatoes |
| N | Toggle fast night in keyboard rehearsal |
| R | Cycle no rain / drizzle / downpour in keyboard rehearsal |
| − / + | Adjust temperature by 2°C |
| C | Scare crows |
| P or Pause / Resume | Pause or resume |
| Shop / unowned plot | Purchase seeds, individual land plots, windmills, bakery |
| Inventory | Inspect crops and seeds |
| Quests | View progress and claim rewards |
| Weather | Expand sensor/rehearsal controls |
| Settings | Sound, hardware connection, restart, pre-run demo balance |

Menus for shop, inventory, quests, market, and bakery **keep the timer and farming running**. Settings, the kit connection dialog, manual pause, and a hidden browser tab pause the game. Pause/finish guards prevent trading while paused or after the demo ends. The ending summarizes coins saved, sales earnings, plots, stores, and claimed quests.

## Weather and strategy

Night accelerates crop growth, evaporation, rainfall accumulation, and environmental damage by 4×. It does not accelerate the four-minute clock. Darkness also brings the guaranteed hurricane sooner. Warnings and storms remove the night speed bonus so players have time to react.

The normal warning arrives near 2:28, and the hurricane near 3:05. Sustained darkness can move the hurricane to about 2:10. The storm lasts 22 seconds and includes a moving wind front, wind streaks, debris, rain, and darkened scenery. Reduced-motion preferences suppress moving effects.

Rain changes stored soil moisture. Empty plots above 89% soil moisture are flooded and cannot be planted, even if a shelter is installed. Rejected attempts consume no seeds. Reduce rain and wait for moisture to fall to 89% or lower; the plot marker and interaction hint show when planting is blocked. Ripe crops can still be harvested from flooded plots. Insufficient moisture slows growth; severe dryness and flooding damage crops. Temperature outside the preferred range slows growth and can cause damage. Lettuce prefers cooler conditions, strawberries and corn prefer warmth, and tomatoes and wheat have intermediate ranges. See inventory and shop cards for exact ranges.

Buy shelters in Shop → Shelters for 10 coins each (adjustable in demo settings). Place one with E on a growing crop, or use the shop’s per-plot placement buttons, which also work for ripe crops. Install shelters before impact. Uncovered crops are destroyed instantly when the hurricane arrives; installed shelters are consumed and their crops remain safe from wind, temperature, and flooding damage for the entire 22-second storm. Normal environmental damage resumes afterward. Unused supplies stay in inventory. Installed shelters remain on their plot across harvesting, replanting, or crow losses until the hurricane uses them up. Crows are not blocked. Planting and shelter placement are blocked during the hurricane, so seeds and supplies cannot be wasted.

Crows first attempt to visit at 25 seconds, then approximately every 30 seconds outside warnings/storms while crops are available. Empty fields are checked again after five seconds. They select developed crops and remember successful feeding spots. Each visit gives five seconds to react, then steals one unit of the targeted plot's harvest every two seconds; a healthy three-unit crop is completely eaten after about nine seconds. Partial losses persist after clapping, reduce the visible plants and harvested quantity, and reset when replanting. C, the on-screen clap button, or the connected microphone scares them away. Pausing freezes the grace period; storm warnings send crows away. This is a small rule-based game AI, not an external model/API.

## Demo balance and suggested presentation

Before starting, use **Tune demo settings** to adjust starting coins, basic seed quantities, the first plot price, windmill price, bakery price, and bakery wheat requirement. These settings last until the page is refreshed and also apply to subsequent restarts in the same page. The clock remains four minutes. All balance defaults, crop values, quest rewards, seed returns, and timing live in `dist/config.mjs`.

Suggested route: harvest the starter crops, claim starter quest rewards, buy a new plot, plant wheat, demonstrate a short fast-night interval and gentle rain, sell crops while saving 6 wheat, buy a windmill and bakery, bake bread, show crow protection and the hurricane, then inspect the ending summary. The automated route proves this is feasible; human menu and explanation time will determine presentation pacing.

## Hardware

The Team V4 integration runs at 9600 baud with D22/D23 temperature buttons, A0 light, A1 water, D48 digital clap input, D44/D45/D46 fan-driver control, a D50 passive speaker, and a parallel LCD1602 on D30–D35. The fan runs automatically during hurricane warnings and the storm; the microphone listens during crow visits. The LCD shows the title, coins, game timer, weather, an estimated hurricane countdown, alerts, and Game Over. All fifteen supplied event sounds and movement footsteps are connected to gameplay.

**Settings → Connect kit** includes individual fan, clap, LCD, and speaker tests. Upload the updated sketch before testing. See `dist/hardware/README.md` for wiring and the full test sequence. The original 115200-baud bridge remains selectable. Physical kit testing is still required; the Mega compile and computer simulations do not verify wiring or acoustics. Use desktop Chrome/Edge for direct USB; other browsers support keyboard play.

## Artwork and structure

The full-window scene is built from individual code-drawn objects, using the reference only for layout, bright colors, and low-angle composition. Buildings, raised plots, crops, trees, windmills, the dock, and the farmer share the same outlines, shading, and dimensional geometry. No reference or generated background image is loaded. HTML controls follow the same world coordinates. This is a 2D game with illustrated depth, not a 3D engine. The full farm is most legible in a wide desktop window; narrow windows fit the complete farm into the available area.

- `dist/config.mjs`: economy, crops, quests, world coordinates, demo timing.
- `dist/engine.mjs`: farming, inventory, transactions, quest progression, weather, movement, timer.
- `dist/menus.mjs`: shop, inventory, quest, market, bakery menus.
- `dist/game.mjs`: input, UI, settings, audio, and USB connection.
- `dist/art.mjs`: reusable game objects, crops, buildings, farmer, and shared drawing style.
- `dist/landscape.mjs`: mountains, river, paths, walls, and foliage.
- `dist/scene.mjs`: scene composition, depth sorting, animation, and weather.
- `dist/viewport.mjs`: scene sizing and click mapping.
- `ARTWORK.md`: art direction and rendering structure.
- `dist/hardware.mjs` and `dist/hardware/`: Team V4 status, events, tests, and integrated controller sketch; original bridge retained.

## Verification

Run `node tests.mjs`, `node hardware-tests.mjs`, `node viewport-tests.mjs`, `node firmware-tests.mjs`, and `node browser-hardware-tests.mjs`. These cover transactions and double-purchase guards, seed consumption/returns, safety-net refill, crop inventory and selective selling, quests, bakery dependencies/production, storm and crow behavior, pause/finish guards, a full four-minute expansion route, both USB protocols, calibration, and scene coordinate mapping at five window sizes.

Ghost checks: `node ghost-tests.mjs`, `node ghost-ui-tests.mjs`, and `python3 -m unittest server.test_advice`. Hosted build: `node scripts/build-hosted.mjs`.
