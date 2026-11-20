# The Last Harvest Team V4 · 9600 baud

Use `The_Last_Harvest/The_Last_Harvest.ino` with **Arduino Mega or Mega 2560 / ATmega2560**. This version integrates your supplied V4 wiring and all fifteen event melodies with the farm game. The source as supplied and the previous V3 sketch are preserved in the project's `backups/hardware-v4/` folder.

## Your existing connections

| Component | Mega connection | Behavior |
| --- | --- | --- |
| Heat / cool buttons | D22 / D23 to GND, internal pull-ups | Start at 25°C; each press changes 1°C, bounded to 5–40°C |
| Light | A0 | Night below 450, day above 550; startup threshold 500 |
| Water | A1 | Raw readings every 500 ms; calibrate dry/wet in the game |
| Microphone | Digital output DO → D48 | Clap detection enabled only during crow visits or the explicit microphone test |
| Fan driver | Enable/PWM D44; direction D45 / D46 | Speed 220/255; automatic during warning and hurricane |
| Passive speaker/buzzer | D50 | Fifteen event sounds plus footsteps |
| Parallel LCD1602 | RS D30, E D31, LCD D4–D7 → Mega D32–D35 | 16 columns × 2 rows; Arduino LiquidCrystal library |

These pin assignments match the supplied V4 sketch. This is a **parallel LCD**, not an I²C screen. Keep the existing motor driver and motor supply: D44–D46 control the driver, not a motor connected directly to the Mega. LCD R/W should be grounded for this constructor; see the [official LiquidCrystal reference](https://github.com/arduino-libraries/LiquidCrystal/blob/master/docs/api.md).

## Upload, run, and test

1. Open `The_Last_Harvest.ino` from this game's hardware folder. Select Arduino Mega or Mega 2560 and its USB port. Upload. If LiquidCrystal is missing, install **LiquidCrystal by Arduino** in Library Manager.
2. Keep the microphone quiet at reset: the sketch reads its idle digital level at startup. Close Serial Monitor and Serial Plotter before connecting in Chrome.
3. Launch the **updated local game** with `Play The Last Harvest.command` or `python3 launch.py`. Use Chrome or Edge. Updating local files does not update the hosted demo.
4. Open **Tune demo settings → Connect kit** (or **Settings → Connect kit** during play). Select **Team V4 · 9600 baud**, then **Choose USB port**. Allow about 3–4 seconds for the board to restart, then wait for “Team V4 ready.”
5. Test heat/cool buttons, cover/uncover the light sensor, and watch the live readings. Capture dry and immersed sensing-area water values. Keep the probe connector and other electronics dry.
6. **Test fan · 3s:** the fan should run and stop by itself. **Stop tests** ends it early.
7. **Test clap · 10s:** clap once after a short quiet moment. The panel should say “Clap detected!” This does not change quests or dismiss real game crows. If it fails, check D48 and adjust the sensor's sensitivity knob. Reset in quiet conditions if its idle level was captured during noise.
8. **Test LCD · 10s:** check the title, weather/timer, hurricane warning/countdown, and Game Over screens. Adjust the LCD contrast potentiometer if the backlight is on but letters are missing.
9. Choose a **Speaker sound** and press **Play selected sound**. All fifteen event melodies are available. The hurricane siren preview does not start the fan.
10. Close the panel/settings and start growing. At the first crow visit (around 25 seconds when crops are present), clap to dismiss the crows. Leave a crop in the field for this test. Observe the automatic fan at the hurricane warning and its shutdown after the storm.

Tests pause the farm. Fan and microphone tests have independent time limits on the board; closing the panel, pausing, ending, restarting, hiding the page, or disconnecting stops outputs. If communication stops, the board stops the fan, microphone processing, footsteps, and event audio after four seconds. The browser pauses play after 2.5 seconds without sensor readings.

## LCD and game sounds

- Before play: **The Last Harvest** / **START GAME**.
- During play: coins and demo time on the first row; weather (day/night, temperature, rain %) alternates with **Hurricane ~mm:ss** on the second.
- The hurricane arrival time is an **estimate assuming the current day/night setting continues**. It updates as light changes. During the hurricane it becomes a storm time-remaining countdown, then “Storm passed.” Rain % is the calibrated sensor rainfall setting shown in the game.
- Crows: **CROWS! CLAP NOW** alternates with weather. Paused: **PAUSED**. At the end: **GAME OVER** and remaining coins.
- Planting, harvesting, selling, purchases, baking, bread ready, quests, levels, crows, storm stages, start, and finish trigger the supplied melodies. The speaker plays one effect at a time; when events coincide, storm/crow/end alerts take priority. Browser “Sound on/off” controls browser audio; the physical speaker remains active while connected.
- Footsteps follow player movement, but pause while the microphone listens. Event sounds and a 150 ms echo interval suppress clap detection; a fresh quiet interval is required before arming again. The microphone stays electrically powered; the game enables/disables its clap processing.

## USB protocol

Newline-delimited JSON from the board at 9600 baud:

```json
{"type":"ready","version":4}
{"type":"temperature","value":25}
{"type":"dayNight","value":"night"}
{"type":"water","value":300}
{"type":"clap","value":true}
{"type":"fan","value":"on"}
{"type":"mic","value":"off"}
```

The browser sends newline-delimited commands:

| Command | Purpose |
| --- | --- |
| `SYNC`, `PING` | Read state / maintain connection |
| `TITLE` | Start screen |
| `STAT,coins,secondsLeft,temp,rain,D-or-N,alert,stormSeconds` | Playing/paused LCD snapshot; alert `-`, `Z`, `W`, `H`, or `C`; stormSeconds is -1 after the storm |
| `OVER,coins` | End screen |
| `FAN_ON`, `FAN_OFF` | Fan state; reasserted without replaying sound |
| `MIC_ON`, `MIC_OFF` | Crow listening state |
| `WALK_START`, `WALK_STOP` | Footsteps |
| `STOP_ALL` | Stop tests, motor, microphone processing, and all audio |
| `STOP_BUZZER` | Stop event audio and footsteps |
| `TEST_FAN`, `TEST_MIC`, `TEST_LCD`, `TEST_SIREN` | Bounded component tests; siren preview is sound only |

Sound commands: `CUSTOMER_ARRIVED`, `SEED_PLANTED`, `CROP_HARVESTED`, `ITEM_SOLD`, `PURCHASE`, `BAKE_START`, `BREAD_READY`, `QUEST_COMPLETE`, `LEVEL_UP`, `CROWS_ARRIVED`, `CROWS_SCARED`, `HURRICANE_WARNING`, `HURRICANE_ON`, `STORM_PASSED`, `GAME_OVER`. `HURRICANE_ON` also starts the fan. `HURRICANE_OFF` is retained for manual storm shutdown.

On USB open, the game establishes DTR and reads immediately but stays silent for at least three seconds and until a fresh sensor reading arrives. Sending commands while the Mega bootloader is active can prevent the sketch from starting. After that handshake, the game sends heartbeats about every 750 ms while idle/paused, and frequent state updates during play. Initial startup has a separate ten-second timeout; the normal 2.5-second sensor timeout starts after live readings are established. The Connection details panel distinguishes no data, unreadable data, and processing errors. Melodies are sent on events, never on heartbeats. The board rejects oversized lines and invalid status fields. Old V3 sensors remain readable, but the new component tests require this updated V4 sketch's ready message.

## Verification

Run `node tests.mjs`, `node hardware-tests.mjs`, `node viewport-tests.mjs`, and `node firmware-tests.mjs` from the project root. Firmware simulation requires a C++ compiler (`clang++`, or set `CXX`). `node browser-hardware-tests.mjs` uses installed Chrome with a simulated serial port, never the physical board (`CHROME` can override the executable path).

The integrated sketch compiles for `arduino:avr:mega` with LiquidCrystal. Computer simulations cover display rows, crow gating, speaker echo, motor timeout, bounded tests, parsing, and the game's USB lifecycle. Actual wiring, acoustic sensitivity, motor operation, and LCD contrast must still be verified with the kit.

---

# Original bridge · 115200 baud

This starter sketch assumes an ELEGOO Mega 2560, the kit's analog water and sound modules, a photoresistor divider, two buttons, a passive buzzer, and an L293D motor driver. The actual kit and wiring have not been tested. Verify module labels and the manufacturer's circuit before applying power.

## Inputs

| Component | Wiring |
| --- | --- |
| Light sensor | Photoresistor between 5V and A0, 10 kΩ resistor between A0 and GND |
| Water module | S to A1, + to 5V, − to GND |
| Sound module | AO to A2, + to 5V, G to GND. Leave DO unused. Verify labels on your module. |
| Cooler button | D2 to GND when pressed, internal pull-up enabled |
| Warmer button | D3 to GND when pressed, internal pull-up enabled |

## Outputs

For the passive buzzer, connect + to D8 and − to GND. A different buzzer module may require its own driver and wiring.

For the kit's L293D, use the manufacturer's motor circuit with these control assignments. L293D pin numbers below refer to the IC, with its notch used to establish orientation.

| Connection | Assignment |
| --- | --- |
| L293D pin 1, enable | Mega D5 |
| L293D pin 2, input 1 | Mega D6 |
| L293D pin 7, input 2 | Mega D7 |
| L293D pins 3 and 6 | Motor terminals |
| L293D pin 16 | 5V logic supply |
| L293D pin 8 | Suitable regulated motor supply for the kit motor, following ELEGOO's lesson |
| L293D pins 4, 5, 12, 13 | Ground shared with Mega and motor supply |
| Unused L293D enable pin 9 and inputs 10, 15 | GND |

Keep the fan blade clear. Use the driver and motor supply instead of powering the motor through a GPIO pin. Keep water in a stable cup away from the breadboard, and immerse only the sensing traces. Disconnect power before changing wiring.

Manufacturer references

- [Mega kit tutorial download](https://www.elegoo.com/blogs/arduino-projects/elegoo-mega-2560-the-most-complete-starter-kit-tutorial)
- [ELEGOO motor lesson](https://www.manualslib.com/manual/1353374/Elegoo-Mega2560.html?page=191)
- [Texas Instruments L293D pinout and electrical specifications](https://www.ti.com/lit/ds/symlink/l293.pdf)

## Connect and calibrate

1. Open `last_harvest/last_harvest.ino` in Arduino IDE. Select Arduino Mega or Mega 2560 and the correct port, then upload.
2. Close Arduino Serial Monitor so the game can open the port.
3. Open the game over HTTPS or localhost in desktop Chrome or Edge. Choose **Connect kit**, then **Choose USB port**.
4. Capture uncovered and covered light readings. Capture dry and deeply immersed sensing-area water readings. Keep the connector dry. Each pair should have a useful separation.
5. Check the live sound amplitude when quiet and when clapping. Adjust `CLAP_THRESHOLD` in the sketch if required, upload again, and reconnect.
6. Close the panel and resume. Light and rainfall now follow physical sensors. Keyboard movement and E interaction remain active. Rehearsal buttons for temperature and clapping remain available.

The sketch sends newline-delimited JSON at 115200 baud every 50 ms. `tempDelta` and `clap` are one-shot events in each sample. Light and water are raw 0–1023 analog readings. The game sends `fan` (0–255) and `buzzer` (boolean) in newline-delimited JSON. The sketch turns off both outputs if no valid command arrives for 1.5 seconds. The browser pauses the game if sensor samples stop for 2.5 seconds.

The buzzer temporarily suppresses microphone events to reduce false claps. Fan noise and event-room noise still need live calibration. The game has no direct browser microphone permission requirement.
