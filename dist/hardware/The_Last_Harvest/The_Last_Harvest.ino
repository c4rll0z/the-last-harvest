/*
  ==========================================
  THE LAST HARVEST
  Arduino MEGA 2560 - Master Controller (V4.2 motion-sensor game integration)
  ==========================================

  Inputs                       Outputs
  - D22 heat button            - D50 passive buzzer / speaker
  - D23 cool button            - D44 fan enable (PWM), D45/D46 fan direction
  - A0  light sensor           - LCD1602: RS 30, E 31, D4-D7 32-35
  - A1  water sensor
  - D41 PIR motion sensor (HC-SR501)

  Serial: 9600 baud. The board sends one JSON object per line:
    {"type":"temperature","value":24}
    {"type":"dayNight","value":"night"}
    {"type":"water","value":300}
    {"type":"motion","value":true}      (only while crows are in the field)
    {"type":"fan","value":"on"}       (acknowledges fan changes)

  The game sends one plain-text command per line. See handleCommand().
  If the game goes quiet for 4 seconds (cable pulled, tab closed), the fan,
  footsteps, and motion processing switch off automatically.
*/

#include <LiquidCrystal.h>
#include <string.h>
#include <stdlib.h>

// ===== TEMPERATURE BUTTONS =====
const int heatButton = 22;
const int coolButton = 23;

int temperature = 25;
const int minTemp = 5;
const int maxTemp = 40;

bool previousHeat = false;
bool previousCool = false;

unsigned long lastHeatPress = 0;
unsigned long lastCoolPress = 0;

const unsigned long buttonDebounce = 120;

// ===== LIGHT SENSOR =====
const int lightSensor = A0;

const int nightThreshold = 450;
const int dayThreshold = 550;

bool lightInitialized = false;
bool isNight = false;

// ===== WATER SENSOR =====
const int waterSensor = A1;
unsigned long lastWaterReading = 0;
const unsigned long waterInterval = 500;

// ===== PIR MOTION SENSOR (from the supplied The_Last_Harvest-4 sketch) =====
const int motionPin = 41;
bool previousMotion = false;
bool motionEnabled = false;

// ===== PASSIVE BUZZER =====
const int buzzerPin = 50;

// ===== HURRICANE FAN =====
const int fanEnable = 44;
const int fanIn1 = 45;
const int fanIn2 = 46;
const int fanSpeed = 220;

bool fanRunning = false;

// ===== LCD1602 SCREEN =====
LiquidCrystal lcd(30, 31, 32, 33, 34, 35);

// Custom characters. Slot 0 is skipped on purpose: a 0 byte would end
// the C string that holds each row.
const uint8_t GLYPH_COIN = 1;
const uint8_t GLYPH_SUN = 2;
const uint8_t GLYPH_MOON = 3;
const uint8_t GLYPH_DROP = 4;
const uint8_t GLYPH_CLOCK = 5;
const char GLYPH_DEGREE = (char)223;  // Built into the HD44780 character set

byte coinGlyph[8]  = {0b01110, 0b11011, 0b10101, 0b10101, 0b10101, 0b11011, 0b01110, 0b00000};
byte sunGlyph[8]   = {0b00100, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0b00100, 0b00000};
byte moonGlyph[8]  = {0b00110, 0b01100, 0b11000, 0b11000, 0b11000, 0b01100, 0b00110, 0b00000};
byte dropGlyph[8]  = {0b00100, 0b00100, 0b01110, 0b01110, 0b11111, 0b11111, 0b01110, 0b00000};
byte clockGlyph[8] = {0b00000, 0b01110, 0b10101, 0b10111, 0b10001, 0b01110, 0b00000, 0b00000};

enum Screen { SCREEN_TITLE, SCREEN_PLAYING, SCREEN_OVER };
Screen screen = SCREEN_TITLE;

// Latest numbers from the game's STAT command
long gameCoins = 0;
int gameSecondsLeft = 240;
int gameTemperature = 25;
int gameRain = 0;
bool gameNight = false;
int gameStormSeconds = -1; // Estimated arrival, storm remaining, or -1 after storm
char gameAlert = '-';   // '-' none, Z paused, W warning, H hurricane, C crows

// What is currently on the screen, so we only redraw changes.
char shownRows[2][17] = {"", ""};
unsigned long lastLcdRefresh = 0;
const unsigned long lcdRefreshInterval = 250;

// ===== SERIAL COMMANDS =====
char commandBuffer[48];
int commandPosition = 0;
bool commandOverflow = false;

unsigned long lastCommandAt = 0;
bool gameLinked = false;
const unsigned long gameTimeout = 4000;
enum HardwareTest { TEST_NONE, TEST_FAN, TEST_MOTION, TEST_LCD };
HardwareTest hardwareTest = TEST_NONE;
unsigned long testStartedAt = 0;
unsigned long testDuration = 0;

// ==========================================
// GAME SOUND EFFECTS
// ==========================================

// Frequency = pitch, duration = how long the note plays (ms).
// Frequency 0 = silence.

struct GameNote {
  unsigned int frequency;
  unsigned int duration;
};

// CUSTOMER ARRIVES / MARKET OPENS: familiar ding-dong
const GameNote customerSound[] = {
  {1000, 150}, {0, 60}, {750, 220}
};

// PLANT A SEED: gritty dirt placement
const GameNote plantingSound[] = {
  {190, 18}, {135, 15}, {210, 12}, {110, 22}, {160, 14}, {85, 35}
};

// HARVEST CROP: quick cheerful collection
const GameNote harvestSound[] = {
  {550, 65}, {750, 75}, {1050, 130}
};

// SELL AT THE MARKET: bright cash-register ding
const GameNote soldSound[] = {
  {1568, 45}, {0, 15}, {2093, 190}
};

// BUY SEEDS, LAND, OR A BUILDING: two quick coins out
const GameNote purchaseSound[] = {
  {880, 55}, {0, 20}, {660, 55}, {0, 20}, {988, 130}
};

// START BAKING: warm oven thump
const GameNote bakeSound[] = {
  {392, 70}, {0, 25}, {523, 120}
};

// BREAD IS READY: oven timer
const GameNote breadSound[] = {
  {1047, 80}, {0, 45}, {1047, 80}, {0, 45}, {1319, 220}
};

// QUEST CLAIMED: short fanfare
const GameNote questSound[] = {
  {784, 80}, {1047, 80}, {1319, 220}
};

// LEVEL UP: rising victory melody
const GameNote levelSound[] = {
  {523, 110}, {659, 110}, {784, 110}, {1047, 160}, {0, 55}, {1319, 350}
};

// CROWS LAND: two harsh caws
const GameNote crowSound[] = {
  {620, 70}, {430, 120}, {0, 90}, {620, 70}, {430, 150}
};

// CROWS SCARED: fluttering wings flying away
const GameNote scaredSound[] = {
  {300, 30}, {450, 30}, {600, 30}, {800, 30}, {1000, 30}, {1300, 90}
};

// STORM WARNING: short two-tone alert
const GameNote warningSound[] = {
  {880, 180}, {660, 180}, {880, 180}, {660, 180}
};

// HURRICANE ARRIVES: emergency siren
const GameNote hurricaneAlarm[] = {
  {880, 250}, {660, 250}, {880, 250}, {660, 250}, {880, 250},
  {660, 250}, {880, 250}, {660, 250}, {880, 250}, {660, 250}
};

// STORM PASSED: gentle falling chime
const GameNote calmSound[] = {
  {1175, 90}, {988, 90}, {784, 180}
};

// TIME'S UP: closing jingle
const GameNote gameOverSound[] = {
  {784, 140}, {659, 140}, {523, 140}, {659, 140}, {0, 40}, {784, 380}
};

#define SOUND_LENGTH(notes) (int)(sizeof(notes) / sizeof(notes[0]))

// ==========================================
// SOUND PLAYER STATE
// ==========================================

// The buzzer can play only one tone at a time.
// Event effects take priority over footsteps.

const GameNote* activeSound = NULL;
int activeSoundLength = 0;
int activeSoundIndex = 0;
unsigned long nextNoteAt = 0;

bool walking = false;
unsigned long nextFootstepAt = 0;
int footstepPhase = 0;

void playSound(const GameNote* notes, int count) {
  noTone(buzzerPin);

  activeSound = notes;
  activeSoundLength = count;
  activeSoundIndex = 0;
  nextNoteAt = millis();

  // Restart the footstep sequence afterward.
  footstepPhase = 0;
}

void stopSound() {
  activeSound = NULL;
  activeSoundLength = 0;
  activeSoundIndex = 0;
  noTone(buzzerPin);
  footstepPhase = 0;
  nextFootstepAt = millis();
}

void startWalking() {
  if (!walking) {
    walking = true;
    footstepPhase = 0;
    nextFootstepAt = millis();
  }
}

void stopWalking() {
  walking = false;
  footstepPhase = 0;

  // Only silence the buzzer if no event sound is playing.
  if (activeSound == NULL) {
    noTone(buzzerPin);
  }
}

void updateGameSounds() {
  unsigned long now = millis();

  // ===== EVENT SOUND EFFECTS =====
  if (activeSound != NULL) {
    if ((long)(now - nextNoteAt) < 0) {
      return;
    }

    if (activeSoundIndex >= activeSoundLength) {
      stopSound();
      return;
    }

    GameNote current = activeSound[activeSoundIndex];
    activeSoundIndex++;

    if (current.frequency == 0) {
      noTone(buzzerPin);
    } else {
      tone(buzzerPin, current.frequency, current.duration);
    }

    // Short gaps help the planting sound feel like a crunch.
    nextNoteAt = now + current.duration + 2;
    return;
  }

  // ===== FOOTSTEPS =====
  if (walking && (long)(now - nextFootstepAt) >= 0) {
    if (footstepPhase == 0) {
      tone(buzzerPin, 170, 18);     // First little crunch
      nextFootstepAt = now + 22;
      footstepPhase = 1;
    } else if (footstepPhase == 1) {
      tone(buzzerPin, 115, 16);     // Second gritty pulse
      nextFootstepAt = now + 20;
      footstepPhase = 2;
    } else {
      tone(buzzerPin, 85, 28);      // Low, heavy footstep ending
      nextFootstepAt = now + 310;
      footstepPhase = 0;
    }
  }
}

// ==========================================
// SEND DATA TO THE GAME
// ==========================================

void sendTemperature() {
  Serial.print("{\"type\":\"temperature\",\"value\":");
  Serial.print(temperature);
  Serial.println("}");
}

void sendDayNight() {
  Serial.print("{\"type\":\"dayNight\",\"value\":\"");
  Serial.print(isNight ? "night" : "day");
  Serial.println("\"}");
}

void sendWater(int value) {
  Serial.print("{\"type\":\"water\",\"value\":");
  Serial.print(value);
  Serial.println("}");
}

void sendMotion() {
  Serial.println("{\"type\":\"motion\",\"value\":true}");
}

void sendFan() {
  Serial.print("{\"type\":\"fan\",\"value\":\"");
  Serial.print(fanRunning ? "on" : "off");
  Serial.println("\"}");
}

// ==========================================
// HURRICANE FAN
// ==========================================

void fanOn() {
  digitalWrite(fanIn1, HIGH);
  digitalWrite(fanIn2, LOW);
  analogWrite(fanEnable, fanSpeed);

  if (!fanRunning) {
    fanRunning = true;
    sendFan();
  }
}

void fanOff() {
  analogWrite(fanEnable, 0);
  digitalWrite(fanIn1, LOW);
  digitalWrite(fanIn2, LOW);

  if (fanRunning) {
    fanRunning = false;
    sendFan();
  }
}

void hurricaneOn() {
  fanOn();
  playSound(hurricaneAlarm, SOUND_LENGTH(hurricaneAlarm));
}

void hurricaneOff() {
  fanOff();

  // Stop the siren if it is still playing.
  if (activeSound == hurricaneAlarm || activeSound == warningSound) {
    stopSound();
  }
}

// ==========================================
// LCD1602 DISPLAY
// ==========================================

// Write a 16-character row. Only touches the LCD when the text changed.
void showRow(int row, const char* text) {
  char padded[17];
  int length = strlen(text);
  for (int i = 0; i < 16; i++) {
    padded[i] = i < length ? text[i] : ' ';
  }
  padded[16] = '\0';

  if (memcmp(padded, shownRows[row], 17) == 0) {
    return;
  }
  memcpy(shownRows[row], padded, 17);

  lcd.setCursor(0, row);
  for (int i = 0; i < 16; i++) {
    lcd.write((uint8_t)padded[i]);
  }
}

// Copy text into a row buffer, centered.
void centerText(char* row, const char* text) {
  int length = strlen(text);
  if (length > 16) length = 16;
  int start = (16 - length) / 2;
  for (int i = 0; i < 16; i++) row[i] = ' ';
  memcpy(row + start, text, length);
  row[16] = '\0';
}

void formatClock(char* out, int seconds) {
  if (seconds < 0) seconds = 0;
  int minutes = seconds / 60;
  int rest = seconds % 60;
  out[0] = '0' + (minutes / 10) % 10;
  out[1] = '0' + minutes % 10;
  out[2] = ':';
  out[3] = '0' + rest / 10;
  out[4] = '0' + rest % 10;
  out[5] = '\0';
}

void drawTitle(unsigned long now) {
  char row[17];
  showRow(0, "The Last Harvest");

  // The arrows blink to invite players to press Start game.
  bool arrows = (now / 600) % 2 == 0;
  centerText(row, arrows ? "> START GAME <" : "  START GAME  ");
  showRow(1, row);
}

void drawPlaying(unsigned long now) {
  char row[17];
  char clock[6];

  // Row 1: coins on the left, time remaining on the right.
  //   [coin]125      [clock]03:42
  for (int i = 0; i < 16; i++) row[i] = ' ';
  row[16] = '\0';

  row[0] = (char)GLYPH_COIN;
  char number[8];
  ltoa(gameCoins > 999999L ? 999999L : gameCoins, number, 10);
  memcpy(row + 1, number, strlen(number));

  formatClock(clock, gameSecondsLeft);
  row[10] = (char)GLYPH_CLOCK;
  memcpy(row + 11, clock, 5);

  if (gameAlert == 'Z') {
    // Paused: replace the clock icon blink with a label.
    memcpy(row + 8, "II", 2);
  }
  showRow(0, row);

  // Alternate weather with the estimated hurricane arrival / storm timer.
  // Day/night changes can move arrival; the browser recomputes this estimate.
  if (gameAlert != 'Z' && gameAlert != 'C' && (now / 1500) % 2 == 0) {
    if (gameStormSeconds < 0) centerText(row, "Storm passed");
    else {
      char stormClock[6];
      formatClock(stormClock, gameStormSeconds);
      for (int i = 0; i < 16; i++) row[i] = ' ';
      row[16] = '\0';
      const char* label = gameAlert == 'H' ? "Storm left " : gameAlert == 'W' ? "WARNING   ~" : "Hurricane ~";
      memcpy(row, label, 11);
      memcpy(row + 11, stormClock, 5);
    }
    showRow(1, row);
    return;
  }

  // Row 2: weather, or an alert that alternates with the weather.
  bool showAlert = gameAlert != '-' && ((now / 1500) % 2 == 0 || gameAlert == 'Z');
  if (showAlert) {
    switch (gameAlert) {
      case 'Z': centerText(row, "PAUSED"); break;
      case 'W': centerText(row, "STORM WARNING!"); break;
      case 'H': centerText(row, "!! HURRICANE !!"); break;
      case 'C': centerText(row, "CROWS! WAVE NOW"); break;
      default:  centerText(row, ""); break;
    }
    showRow(1, row);
    return;
  }

  //   [sun]Day 24°C [drop]40%
  for (int i = 0; i < 16; i++) row[i] = ' ';
  row[16] = '\0';
  int position = 0;
  row[position++] = (char)(gameNight ? GLYPH_MOON : GLYPH_SUN);
  const char* period = gameNight ? "Ngt" : "Day";
  memcpy(row + position, period, 3);
  position += 4;

  char value[6];
  itoa(gameTemperature, value, 10);
  memcpy(row + position, value, strlen(value));
  position += strlen(value);
  row[position++] = GLYPH_DEGREE;
  row[position++] = 'C';

  itoa(gameRain, value, 10);
  int rainStart = 16 - 2 - strlen(value);
  row[rainStart] = (char)GLYPH_DROP;
  memcpy(row + rainStart + 1, value, strlen(value));
  row[15] = '%';
  showRow(1, row);
}

void drawGameOver(unsigned long now) {
  char row[17];
  char number[8];
  centerText(row, "GAME OVER");
  showRow(0, row);

  for (int i = 0; i < 16; i++) row[i] = ' ';
  row[16] = '\0';
  ltoa(gameCoins > 999999L ? 999999L : gameCoins, number, 10);
  int length = strlen(number);
  int start = (16 - (length + 7)) / 2;
  row[start] = (char)GLYPH_COIN;
  memcpy(row + start + 1, number, length);
  memcpy(row + start + 1 + length, " coins", 6);
  showRow(1, row);
}

void updateLCD() {
  unsigned long now = millis();
  if (now - lastLcdRefresh < lcdRefreshInterval) {
    return;
  }
  lastLcdRefresh = now;

  if (screen == SCREEN_PLAYING) drawPlaying(now);
  else if (screen == SCREEN_OVER) drawGameOver(now);
  else drawTitle(now);
}

void forceLcdRefresh() {
  lastLcdRefresh = millis() - lcdRefreshInterval;
}

// ==========================================
// RECEIVE GAME COMMANDS
// ==========================================

// Read the next comma-separated number. Returns false at the end.
bool nextField(char** cursor, long* value) {
  if (*cursor == NULL || **cursor == '\0') return false;
  char* end;
  *value = strtol(*cursor, &end, 10);
  if (end == *cursor || (*end != ',' && *end != '\0')) return false;
  *cursor = (*end == ',') ? end + 1 : end;
  return true;
}

// STAT,<coins>,<secondsLeft>,<temperature>,<rain%>,<D|N>,<alert>[,<stormSeconds>]
bool handleStat(char* fields) {
  char* cursor = fields;
  long coins, seconds, temp, rain, storm = -1;
  if (!nextField(&cursor, &coins) || !nextField(&cursor, &seconds) ||
      !nextField(&cursor, &temp) || !nextField(&cursor, &rain)) return false;
  if (strlen(cursor) < 3 || (cursor[0] != 'D' && cursor[0] != 'N') || cursor[1] != ',' ||
      strchr("-ZWHC", cursor[2]) == NULL) return false;
  bool night = cursor[0] == 'N';
  char alert = cursor[2];
  cursor += 3;
  if (*cursor != '\0') {
    if (*cursor++ != ',' || !nextField(&cursor, &storm) || *cursor != '\0') return false;
  }
  gameCoins = constrain(coins, 0L, 999999L);
  gameSecondsLeft = constrain(seconds, 0L, 5999L);
  gameTemperature = constrain(temp, -9L, 99L);
  gameRain = constrain(rain, 0L, 100L);
  gameNight = night;
  gameAlert = alert;
  gameStormSeconds = constrain(storm, -1L, 5999L);
  if (screen != SCREEN_PLAYING) { screen = SCREEN_PLAYING; forceLcdRefresh(); }
  return true;
}

void setMotionSensor(bool enabled) {
  if (motionEnabled == enabled) return;
  motionEnabled = enabled;
  // A sensor already HIGH when enabled is not a new movement.
  previousMotion = (digitalRead(motionPin) == HIGH);
  Serial.print("{\"type\":\"motionEnabled\",\"value\":\"");
  Serial.print(enabled ? "on" : "off");
  Serial.println("\"}");
}

void stopAll() {
  hardwareTest = TEST_NONE;
  stopSound();
  stopWalking();
  fanOff();
  setMotionSensor(false);
}

void startHardwareTest(HardwareTest test) {
  stopAll();
  hardwareTest = test;
  testStartedAt = millis();
  testDuration = test == TEST_FAN ? 3000 : 10000;
  if (test == TEST_FAN) fanOn();
  if (test == TEST_MOTION) setMotionSensor(true);
}

void updateHardwareTest() {
  if (hardwareTest == TEST_NONE) return;
  unsigned long elapsed = millis() - testStartedAt;
  if (elapsed >= testDuration) {
    stopAll();
    screen = SCREEN_TITLE;
    forceLcdRefresh();
    return;
  }
  if (hardwareTest != TEST_LCD) return;
  if (elapsed < 2500) screen = SCREEN_TITLE;
  else if (elapsed < 7500) {
    screen = SCREEN_PLAYING;
    gameCoins = 125; gameSecondsLeft = 222; gameTemperature = temperature;
    gameRain = 40; gameNight = isNight;
    gameStormSeconds = 37; gameAlert = elapsed < 5000 ? '-' : 'W';
  } else screen = SCREEN_OVER;
}

void handleCommand(char* command) {
  if (command[0] == '\0') return;


  // ----- Screen -----
  if (strncmp(command, "STAT,", 5) == 0) {
    if (!handleStat(command + 5)) return;
  } else if (strcmp(command, "TITLE") == 0) {
    if (screen != SCREEN_TITLE) {
      screen = SCREEN_TITLE;
      forceLcdRefresh();
    }
  } else if (strncmp(command, "OVER,", 5) == 0) {
    char* cursor = command + 5;
    long coins;
    if (!nextField(&cursor, &coins) || *cursor != '\0') return;
    gameCoins = constrain(coins, 0L, 999999L);
    if (screen != SCREEN_OVER) {
      screen = SCREEN_OVER;
      forceLcdRefresh();
    }
  }

  // ----- Sounds -----
  else if (strcmp(command, "CUSTOMER_ARRIVED") == 0) playSound(customerSound, SOUND_LENGTH(customerSound));
  else if (strcmp(command, "SEED_PLANTED") == 0) playSound(plantingSound, SOUND_LENGTH(plantingSound));
  else if (strcmp(command, "CROP_HARVESTED") == 0) playSound(harvestSound, SOUND_LENGTH(harvestSound));
  else if (strcmp(command, "ITEM_SOLD") == 0) playSound(soldSound, SOUND_LENGTH(soldSound));
  else if (strcmp(command, "PURCHASE") == 0) playSound(purchaseSound, SOUND_LENGTH(purchaseSound));
  else if (strcmp(command, "BAKE_START") == 0) playSound(bakeSound, SOUND_LENGTH(bakeSound));
  else if (strcmp(command, "BREAD_READY") == 0) playSound(breadSound, SOUND_LENGTH(breadSound));
  else if (strcmp(command, "QUEST_COMPLETE") == 0) playSound(questSound, SOUND_LENGTH(questSound));
  else if (strcmp(command, "LEVEL_UP") == 0) playSound(levelSound, SOUND_LENGTH(levelSound));
  else if (strcmp(command, "CROWS_ARRIVED") == 0) playSound(crowSound, SOUND_LENGTH(crowSound));
  else if (strcmp(command, "CROWS_SCARED") == 0) playSound(scaredSound, SOUND_LENGTH(scaredSound));
  else if (strcmp(command, "HURRICANE_WARNING") == 0) playSound(warningSound, SOUND_LENGTH(warningSound));
  else if (strcmp(command, "STORM_PASSED") == 0) playSound(calmSound, SOUND_LENGTH(calmSound));
  else if (strcmp(command, "GAME_OVER") == 0) playSound(gameOverSound, SOUND_LENGTH(gameOverSound));

  // ----- Footsteps -----
  else if (strcmp(command, "WALK_START") == 0) startWalking();
  else if (strcmp(command, "WALK_STOP") == 0) stopWalking();

  // ----- Fan -----
  else if (strcmp(command, "HURRICANE_ON") == 0) hurricaneOn();
  else if (strcmp(command, "HURRICANE_OFF") == 0) hurricaneOff();
  else if (strcmp(command, "FAN_ON") == 0) fanOn();
  else if (strcmp(command, "FAN_OFF") == 0) fanOff();

  // ----- Motion sensor -----
  else if (strcmp(command, "MOTION_ON") == 0) setMotionSensor(true);
  else if (strcmp(command, "MOTION_OFF") == 0) setMotionSensor(false);

  // ----- Connection -----
  else if (strcmp(command, "TEST_FAN") == 0) startHardwareTest(TEST_FAN);
  else if (strcmp(command, "TEST_MOTION") == 0) startHardwareTest(TEST_MOTION);
  else if (strcmp(command, "TEST_LCD") == 0) startHardwareTest(TEST_LCD);
  else if (strcmp(command, "TEST_SIREN") == 0) playSound(hurricaneAlarm, SOUND_LENGTH(hurricaneAlarm));
  else if (strcmp(command, "PING") == 0) { /* Heartbeat during component tests. */ }
  else if (strcmp(command, "SYNC") == 0) {
    Serial.println("{\"type\":\"ready\",\"version\":4}");
    sendTemperature();
    sendDayNight();
    sendWater(analogRead(waterSensor));
    sendFan();
  } else if (strcmp(command, "STOP_BUZZER") == 0) {
    stopSound();
    stopWalking();
  } else if (strcmp(command, "STOP_ALL") == 0) {
    stopAll();
  } else return; // Unknown or malformed commands do not extend the connection.
  lastCommandAt = millis();
  gameLinked = true;
}

void readCommands() {
  // Limit each pass so incoming traffic cannot starve the sensors.
  for (int count = 0; count < 80 && Serial.available() > 0; count++) {
    char incoming = Serial.read();

    if (incoming == '\r') {
      continue;
    }

    if (incoming == '\n') {
      commandBuffer[commandPosition] = '\0';
      if (!commandOverflow) {
        handleCommand(commandBuffer);
      }
      commandPosition = 0;
      commandOverflow = false;
    } else if (commandOverflow) {
      // Discard the rest of an oversized line.
    } else if (commandPosition < (int)sizeof(commandBuffer) - 1) {
      commandBuffer[commandPosition++] = incoming;
    } else {
      commandOverflow = true;
    }
  }
}

// If the game stops talking, make the hardware safe.
void checkGameLink() {
  if (gameLinked && millis() - lastCommandAt > gameTimeout) {
    gameLinked = false;
    stopAll();
    screen = SCREEN_TITLE;
    forceLcdRefresh();
  }
}

// ==========================================
// TEMPERATURE BUTTONS
// ==========================================

void readTemperatureButtons() {
  unsigned long now = millis();

  bool heatPressed = digitalRead(heatButton) == LOW;
  bool coolPressed = digitalRead(coolButton) == LOW;

  if (heatPressed && !previousHeat && now - lastHeatPress >= buttonDebounce) {
    if (temperature < maxTemp) temperature++;
    sendTemperature();
    lastHeatPress = now;
  }

  if (coolPressed && !previousCool && now - lastCoolPress >= buttonDebounce) {
    if (temperature > minTemp) temperature--;
    sendTemperature();
    lastCoolPress = now;
  }

  previousHeat = heatPressed;
  previousCool = coolPressed;
}

// ==========================================
// LIGHT SENSOR - DAY / NIGHT
// ==========================================

void readLightSensor() {
  int lightValue = analogRead(lightSensor);

  if (!lightInitialized) {
    isNight = lightValue < 500;
    lightInitialized = true;
    sendDayNight();
  } else if (!isNight && lightValue < nightThreshold) {
    isNight = true;
    sendDayNight();
  } else if (isNight && lightValue > dayThreshold) {
    isNight = false;
    sendDayNight();
  }
}

// ==========================================
// WATER SENSOR
// ==========================================

void readWaterSensor() {
  unsigned long now = millis();

  if (now - lastWaterReading >= waterInterval) {
    lastWaterReading = now;
    sendWater(analogRead(waterSensor));

    // Repeat absolute state so the game stays in sync after
    // connecting, pausing, or restarting.
    sendTemperature();
    sendDayNight();
  }
}

// ==========================================
// MOTION SENSOR - SCARE THE CROWS
// ==========================================

void readMotionSensor() {
  // HC-SR501 is active HIGH; emit once per LOW-to-HIGH transition.
  bool motion = (digitalRead(motionPin) == HIGH);
  if (motionEnabled && motion && !previousMotion) {
    sendMotion();
    setMotionSensor(false);
    if (hardwareTest == TEST_MOTION) hardwareTest = TEST_NONE;
  }
  previousMotion = motion;
}

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(9600);

  // Temperature buttons
  pinMode(heatButton, INPUT_PULLUP);
  pinMode(coolButton, INPUT_PULLUP);

  // Motion sensor: capture the initial level to avoid a false startup event.
  pinMode(motionPin, INPUT);
  previousMotion = (digitalRead(motionPin) == HIGH);

  // Passive buzzer
  pinMode(buzzerPin, OUTPUT);
  noTone(buzzerPin);

  // Start the hurricane fan OFF
  digitalWrite(fanEnable, LOW);
  pinMode(fanEnable, OUTPUT);
  digitalWrite(fanIn1, LOW);
  digitalWrite(fanIn2, LOW);
  pinMode(fanIn1, OUTPUT);
  pinMode(fanIn2, OUTPUT);

  // LCD display
  lcd.begin(16, 2);
  lcd.createChar(GLYPH_COIN, coinGlyph);
  lcd.createChar(GLYPH_SUN, sunGlyph);
  lcd.createChar(GLYPH_MOON, moonGlyph);
  lcd.createChar(GLYPH_DROP, dropGlyph);
  lcd.createChar(GLYPH_CLOCK, clockGlyph);
  lcd.clear();
  forceLcdRefresh();
  updateLCD();

  // Initial game data and protocol identification after USB auto-reset.
  Serial.println("{\"type\":\"ready\",\"version\":4}");
  readLightSensor();
  sendTemperature();
  sendWater(analogRead(waterSensor));
}

// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
  readTemperatureButtons();
  readLightSensor();
  readWaterSensor();
  readCommands();
  readMotionSensor();
  checkGameLink();
  updateHardwareTest();
  updateGameSounds();
  updateLCD();
}
