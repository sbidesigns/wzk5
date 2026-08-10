// core/BotBackfillSystem.js
// Warzone-style bot backfill for lobby.
// After grace period (10s), if lobby not full, inject bots with simulated ping + realistic names.
// Bots are not visually distinguishable from humans in lobby UI.

import { EventBus } from './EventBus.js';

const BOT_NAME_POOL = [
  'ShadowDriver', 'NeonDrifter', 'ApexHunter', 'TurboAlice', 'GhostRider', 'VelocityVex',
  'MidnightMax', 'CrimsonClaire', 'BlazeBishop', 'PhantomPhil', 'StormSasha', 'RogueRachel',
  'DriftKing', 'NitroNate', 'SerenitySue', 'TitanTom', 'VortexVic', 'EchoElena',
  'SpecterSteve', 'MaverickMia', 'HavocHal', 'ZenithZoe', 'PulsePat', 'NovaNick',
  'RaptorRay', 'SableSam', 'CometChris', 'TalonTaylor', 'ReaperRiley', 'BlazeBrook',
  'OnyxOwen', 'QuillQuinn', 'SaintSage', 'SaintSky', 'DriftDana', 'ApexAri',
  'BoostBlake', 'RallyRobin', 'SlideSid', 'GripGrace', 'BurnBen', 'DraftDrew',
  'LeadLuna', 'PacePiper', 'RushReese', 'SprintSasha', 'TrackTerry', 'TurnToni',
  'VelocityVic', 'WarpWren', 'ZeroZane', 'AceAvery', 'BrickBeck', 'NovaNoel',
  'EchoEmery', 'JettJules', 'RogueRemy', 'VexVal', 'TitanTate', 'SpecterSloane'
];

const BOT_PING_MIN = 30;
const BOT_PING_MAX = 80;
const BOT_PING_JITTER = 10;

class BotBackfillSystem {
  constructor() {
    this._save = null;
    this._bots = [];
    this._gracePeriod = 10;
    this._active = false;
    this._usedNames = new Set();
  }

  init(saveSystem) {
    this._save = saveSystem;
  }

  // Called by LobbySystem when lobby starts
  onLobbyStart(maxPlayers, currentHumans) {
    this._active = true;
    this._bots = [];
    this._usedNames = new Set();
    this._maxPlayers = maxPlayers;
    this._currentHumans = currentHumans;
    this._lobbyStartTime = performance.now();
    this._lastBackfillCheck = 0;
  }

  // Called every frame by LobbySystem
  update(dt, lobbyState) {
    if (!this._active) return;
    const elapsed = (performance.now() - this._lobbyStartTime) / 1000;
    // Check if backfill needed (after grace period)
    if (elapsed >= this._gracePeriod && lobbyState.players.length < this._maxPlayers) {
      const slotsToFill = this._maxPlayers - lobbyState.players.length;
      // Inject bots gradually (1 per second, not all at once — feels more natural)
      const botsToInject = Math.min(1, slotsToFill);
      for (let i = 0; i < botsToInject; i++) {
        const bot = this._createBot();
        if (bot) {
          lobbyState.players.push(bot);
          EventBus.emit('lobby:playerJoined', { player: bot, isBot: true });
        }
      }
    }

    // Update bot ping jitter (every 5s, ±10ms)
    if (performance.now() - this._lastBackfillCheck > 5000) {
      this._lastBackfillCheck = performance.now();
      for (const bot of this._bots) {
        bot.ping = Math.max(BOT_PING_MIN, Math.min(BOT_PING_MAX, bot.ping + (Math.random() - 0.5) * 2 * BOT_PING_JITTER));
        bot.ping = Math.round(bot.ping);
      }
    }
  }

  _createBot() {
    // Pick unused name
    const availableNames = BOT_NAME_POOL.filter(n => !this._usedNames.has(n));
    if (availableNames.length === 0) return null;
    const name = availableNames[Math.floor(Math.random() * availableNames.length)];
    this._usedNames.add(name);

    const bot = {
      id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      isBot: true,
      ping: Math.floor(Math.random() * (BOT_PING_MAX - BOT_PING_MIN)) + BOT_PING_MIN,
      level: Math.floor(Math.random() * 40) + 5,
      ready: true,
      avatar: name.charAt(0),
      isPlayer: false
    };
    this._bots.push(bot);
    return bot;
  }

  getBots() { return this._bots; }
  isBot(playerId) { return this._bots.some(b => b.id === playerId); }

  // Bot AI difficulty: based on player's last 5 race times
  // Multiplier: 0.9 = harder than player, 1.1 = easier
  getBotDifficulty(playerId) {
    const stats = this._save?.get('stats');
    const bestLaps = stats?.bestLaps || {};
    const trackId = this._save?.get('preferences.lastTrack') || 'downtown';
    const playerBest = bestLaps[trackId];
    if (!playerBest) return 1.0; // Default: match player
    // If player is fast, make bots harder (lower multiplier)
    if (playerBest < 30) return 0.9;
    if (playerBest < 45) return 0.95;
    if (playerBest < 60) return 1.0;
    return 1.1;
  }

  onLobbyEnd() {
    this._active = false;
    this._bots = [];
    this._usedNames.clear();
  }
}

export const botBackfill = new BotBackfillSystem();
export default botBackfill;
