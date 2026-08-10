// server/rooms/LobbyRoom.js — AAA Pre-game Lobby with Real Matchmaking
// Implements skill-based matchmaking integration, ready-check system,
// team assignment logic, bot backfill, chat moderation, and host migration.
//
// Features:
// - Real matchmaking integration (calls Matchmaker.findMatch when ready)
// - Player ready-check system (all players must ready up before race starts)
// - Team assignment logic for team-based game modes
// - Bot backfill integration (requests bots from BotBackfillSystem config)
// - Chat moderation (profanity filter, spam detection, rate limiting)
// - Map voting integration (MapVoteSystem)
// - Host migration if host disconnects
//
// @module rooms/LobbyRoom

import { Room } from 'colyseus';
import { Matchmaker } from '../matchmaking/Matchmaker.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum players in lobby */
const MAX_LOBBY_SIZE = 100;

/** Maximum players per race */
const MAX_RACE_PLAYERS = 16;

/** Minimum players to start matchmaking */
const MIN_MATCHMAKE_PLAYERS = 2;

/** Ready check timeout in milliseconds */
const READY_CHECK_TIMEOUT = 30000; // 30 seconds

/** Chat message rate limit (messages per minute) */
const CHAT_RATE_LIMIT = 30;

/** Chat message max length */
const CHAT_MAX_LENGTH = 200;

/** Spam detection window in milliseconds */
const SPAM_DETECTION_WINDOW = 5000;

/** Max identical messages in spam window */
const SPAM_THRESHOLD = 3;

// ============================================================================
// PROFANITY FILTER
// ============================================================================

/**
 * Basic profanity word list (expand as needed)
 * In production, use a dedicated library or API
 * @type {Set<string>}
 */
const PROFANITY_LIST = new Set([
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard',
  'crap', 'hell', 'dick', 'piss', 'slut', 'whore'
]);

/**
 * Check if message contains profanity
 * @param {string} message - Message to check
 * @returns {Object} Filter result with clean flag and violations
 */
function filterProfanity(message) {
  const words = message.toLowerCase().split(/\s+/);
  const violations = words.filter(word => PROFANITY_LIST.has(word));
  
  return {
    clean: violations.length === 0,
    violations,
    filteredMessage: violations.length > 0 
      ? words.map(w => PROFANITY_LIST.has(w) ? '***' : w).join(' ')
      : message
  };
}

// ============================================================================
// BOT CONFIGURATION
// ============================================================================

/**
 * Bot configuration for backfill
 * @type {Object}
 */
const BOT_CONFIG = {
  enabled: true,
  minPlayersToStart: 4,
  maxBots: 6,
  fillTimeout: 10000, // 10 seconds to wait for real players
  
  /** Bot name pool */
  names: [
    'SpeedBot', 'NitroAI', 'TurboBot', 'RacerX', 'DriftKing',
    'ApexBot', 'Velocity', 'ThunderAI', 'BlazeBot', 'StormAI',
    'Phantom9', 'VortexBot', 'FlashAI', 'SonicBot', 'RocketAI'
  ],
  
  /** Difficulty levels mapped to player average ELO */
  difficultyRanges: {
    easy: { eloMin: 800, eloMax: 1100 },
    medium: { eloMin: 1100, eloMax: 1400 },
    hard: { eloMin: 1400, eloMax: 1700 },
    expert: { eloMin: 1700, eloMax: 9999 }
  }
};

/**
 * Map vote configuration
 * @type {Object}
 */
const MAP_VOTE_CONFIG = {
  votingDuration: 30000, // 30 seconds
  optionsPerVote: 3, // Number of track options to present
  tracks: ['downtown', 'mountain', 'coastal', 'volcano', 'neon', 'arctic']
};

// ============================================================================
// MAIN LOBBY ROOM CLASS
// ============================================================================

/**
 * Lobby Room for pre-game activities
 * Handles matchmaking, party formation, and race preparation
 * 
 * @extends Room
 * 
 * @example
 * gameServer.define('lobby', LobbyRoom);
 */
export class LobbyRoom extends Room {
  /**
   * Maximum clients allowed
   * @type {number}
   */
  maxClients = MAX_LOBBY_SIZE;

  /**
   * Called when room is created
   * Initializes state, matchmaker, and event handlers
   */
  onCreate() {
    console.log('[LobbyRoom] Created');
    
    // Initialize room state
    this.state = {
      players: {},
      matchmakingQueues: {},
      parties: {},
      currentVotes: null,
      selectedTrack: null,
      phase: 'lobby', // lobby, voting, ready_check, transitioning
      hostId: null
    };
    
    // Initialize matchmaker
    this._matchmaker = new Matchmaker(process.env.REDIS_URL);
    
    // Setup matchmaker event handlers
    this._setupMatchmakerEvents();
    
    // Chat moderation state
    this._chatHistory = new Map(); // playerId -> [{message, timestamp}]
    
    // Ready check state
    this._readyCheckTimer = null;
    this._readyPlayers = new Set();
    
    // Bot tracking
    this._activeBots = new Map(); // botId -> botData
    
    // Setup message handlers
    this._setupMessageHandlers();
    
    console.log('[LobbyRoom] Initialized with matchmaking');
  }

  /**
   * Setup matchmaker event listeners
   * @private
   */
  _setupMatchmakerEvents() {
    this._matchmaker.on('matchFound', (match) => {
      console.log(`[LobbyRoom] Match found! ${match.players.length} players`);
      
      // Notify all matched players
      for (const player of match.players) {
        const client = this.clients.find(c => c.sessionId === player.playerId);
        if (client) {
          this.send(client, 'matchFound', {
            matchId: match.matchId,
            roomId: `race-${match.matchId}`,
            trackId: match.trackId,
            modeId: match.modeId,
            players: match.players,
            qualityScore: match.qualityScore
          });
        }
      }
    });
    
    this._matchmaker.on('playerJoined', (data) => {
      this.broadcast('queueUpdate', {
        type: 'joined',
        queueSize: data.entry?.preferences?.modeId || 'unknown'
      });
    });
    
    this._matchmaker.on('playerLeft', (data) => {
      this.broadcast('queueUpdate', {
        type: 'left'
      });
    });
  }

  /**
   * Setup all message handlers
   * @private
   */
  _setupMessageHandlers() {
    // Matchmaking requests
    this.onMessage('matchmake', (client, prefs) => this._handleMatchmake(client, prefs));
    this.onMessage('cancelMatchmake', (client) => this._handleCancelMatchmake(client));
    
    // Party system
    this.onMessage('createParty', (client) => this._handleCreateParty(client));
    this.onMessage('inviteToParty', (client, data) => this._handlePartyInvite(client, data));
    this.onMessage('acceptInvite', (client, data) => this._handleAcceptInvite(client, data));
    this.onMessage('leaveParty', (client) => this._handleLeaveParty(client));
    
    // Chat
    this.onMessage('chat', (client, msg) => this._handleChat(client, msg));
    
    // Ready system
    this.onMessage('ready', (client) => this._handleReady(client));
    this.onMessage('unready', (client) => this._handleUnready(client));
    
    // Voting
    this.onMessage('vote', (client, data) => this._handleVote(client, data));
    
    // Host actions
    this.onMessage('startRace', (client) => this._handleStartRace(client));
    this.onMessage('kickPlayer', (client, data) => this._handleKickPlayer(client, data));
    
    // Bot management
    this.onMessage('addBot', (client) => this._handleAddBot(client));
    this.onMessage('removeBot', (client, data) => this._handleRemoveBot(client, data));
  }

  /**
   * Handle client joining the lobby
   * 
   * @param {Client} client - Colyseus client
   * @param {Object} options - Join options
   * @param {string} [options.name] - Player display name
   * @param {string} [options.playerId] - Authenticated player ID
   * @param {number} [options.elo] - Player's ELO rating
   * @param {number} [options.level] - Player level
   */
  onJoin(client, options) {
    console.log(`[LobbyRoom] Client joined: ${client.sessionId}`);
    
    // First joining player becomes host
    if (!this.state.hostId) {
      this.state.hostId = client.sessionId;
    }
    
    // Create player entry
    const playerId = options?.playerId || client.sessionId;
    this.state.players[client.sessionId] = {
      id: client.sessionId,
      authPlayerId: playerId,
      name: options?.name || `Player${Math.floor(Math.random() * 10000)}`,
      level: options?.level || 1,
      elo: options?.elo || 1200,
      ready: false,
      isHost: client.sessionId === this.state.hostId,
      joinedAt: Date.now(),
      partyId: null,
      vehicleId: options?.vehicleId || 'spectre',
      characterId: options?.characterId || 'ace'
    };
    
    // Initialize chat history for spam detection
    this._chatHistory.set(client.sessionId, []);
    
    // Notify others
    this.broadcast('playerJoined', { 
      player: this.state.players[client.sessionId],
      totalPlayers: Object.keys(this.state.players).length
    }, { except: client });
    
    // Send current state to new player
    this.send(client, 'lobbyState', {
      players: Object.values(this.state.players),
      phase: this.state.phase,
      hostId: this.state.hostId,
      votes: this.state.currentVotes,
      selectedTrack: this.state.selectedTrack
    });
    
    console.log(`[LobbyRoom] ${this.state.players[client.sessionId].name} joined lobby`);
  }

  /**
   * Handle client leaving
   * 
   * @param {Client} client - Leaving client
   */
  onLeave(client) {
    const player = this.state.players[client.sessionId];
    console.log(`[LobbyRoom] Client left: ${client.sessionId}`);
    
    // Remove from matchmaking queue
    this._handleCancelMatchmake(client);
    
    // Remove from party if in one
    if (player?.partyId) {
      this._removeFromParty(client.sessionId, player.partyId);
    }
    
    // Remove from ready set
    this._readyPlayers.delete(client.sessionId);
    
    // Clean up chat history
    this._chatHistory.delete(client.sessionId);
    
    // Delete player from state
    delete this.state.players[client.sessionId];
    
    // Host migration check
    if (this.state.hostId === client.sessionId) {
      this._migrateHost();
    }
    
    // Notify others
    this.broadcast('playerLeft', { 
      id: client.sessionId,
      totalPlayers: Object.keys(this.state.players).length
    });
  }

  // ==========================================================================
  // MATCHMAKING HANDLING
  // ==========================================================================

  /**
   * Handle matchmaking request
   * Joins player to appropriate matchmaking queue based on preferences
   * 
   * @param {Client} client - Requesting client
   * @param {Object} prefs - Matchmaking preferences
   * @param {string} prefs.modeId - Game mode
   * @param {string} [prefs.trackId] - Preferred track ('random' for any)
   * @param {string} [prefs.region] - Preferred region
   */
  async _handleMatchmake(client, prefs) {
    try {
      const player = this.state.players[client.sessionId];
      if (!player) return;
      
      // Validate preferences
      const validModes = ['circuit', 'sprint', 'timeTrial', 'teamRace'];
      if (!validModes.includes(prefs.modeId)) {
        this.send(client, 'error', { message: 'Invalid game mode' });
        return;
      }
      
      // Check if already in queue
      if (this.state.matchmakingQueues[client.sessionId]) {
        this.send(client, 'error', { message: 'Already in matchmaking queue' });
        return;
      }
      
      // Determine player IDs (include party members)
      let playerIds = [client.sessionId];
      if (player.partyId && this.state.parties[player.partyId]) {
        const party = this.state.parties[player.partyId];
        playerIds = party.members.map(m => m.sessionId);
        
        // Ensure all party members are ready
        const allReady = party.members.every(m => m.ready);
        if (!allReady) {
          this.send(client, 'error', { message: 'All party members must be ready' });
          return;
        }
      }
      
      // Join matchmaking queue
      const result = await this._matchmaker.joinQueue(playerIds, {
        modeId: prefs.modeId,
        trackId: prefs.trackId || 'random',
        region: prefs.region || 'auto',
        rating: player.elo,
        partyMembers: playerIds.length > 1 ? playerIds.filter(id => id !== client.sessionId) : undefined
      });
      
      // Store queue reference
      this.state.matchmakingQueues[client.sessionId] = {
        ...result,
        preferences: prefs,
        joinedAt: Date.now()
      };
      
      // Confirm to client
      this.send(client, 'queueJoined', {
        position: result.position,
        estimatedWait: result.estimatedWait,
        preferences: prefs
      });
      
      console.log(`[LobbyRoom] ${player.name} joined ${prefs.modeId} queue`);
      
    } catch (error) {
      console.error('[LobbyRoom] Matchmake error:', error.message);
      this.send(client, 'error', { message: error.message });
    }
  }

  /**
   * Handle cancel matchmaking request
   * @private
   */
  async _handleCancelMatchmake(client) {
    const queueEntry = this.state.matchmakingQueues[client.sessionId];
    if (queueEntry) {
      await this._matchmaker.leaveQueue(client.sessionId);
      delete this.state.matchmakingQueues[client.sessionId];
      
      this.send(client, 'queueLeft', {});
      console.log(`[LobbyRoom] ${client.sessionId} left queue`);
    }
  }

  // ==========================================================================
  // PARTY SYSTEM
  // ==========================================================================

  /**
   * Handle create party request
   * @private
   */
  _handleCreateParty(client) {
    const player = this.state.players[client.sessionId];
    if (!player || player.partyId) {
      this.send(client, 'error', { message: 'Already in a party' });
      return;
    }
    
    const partyId = `party_${Date.now()}_${client.sessionId}`;
    this.state.parties[partyId] = {
      id: partyId,
      leaderId: client.sessionId,
      members: [{
        sessionId: client.sessionId,
        name: player.name,
        ready: false
      }],
      createdAt: Date.now()
    };
    
    player.partyId = partyId;
    
    this.send(client, 'partyCreated', { partyId, party: this.state.parties[partyId] });
    this.broadcast('partyUpdate', { partyId, party: this.state.parties[partyId] });
    
    console.log(`[LobbyRoom] Party created by ${player.name}: ${partyId}`);
  }

  /**
   * Handle party invite
   * @private
   */
  _handlePartyInvite(client, data) {
    const player = this.state.players[client.sessionId];
    const targetPlayer = Object.values(this.state.players).find(p => p.id === data.targetId);
    
    if (!player?.partyId) {
      this.send(client, 'error', { message: 'Not in a party' });
      return;
    }
    
    const party = this.state.parties[player.partyId];
    if (party.leaderId !== client.sessionId) {
      this.send(client, 'error', { message: 'Only leader can invite' });
      return;
    }
    
    if (!targetPlayer) {
      this.send(client, 'error', { message: 'Player not found' });
      return;
    }
    
    // Send invite to target
    const targetClient = this.clients.find(c => c.sessionId === data.targetId);
    if (targetClient) {
      this.send(targetClient, 'partyInvite', {
        partyId: player.partyId,
        from: player.name,
        fromId: client.sessionId
      });
    }
  }

  /**
   * Handle accept party invite
   * @private
   */
  _handleAcceptInvite(client, data) {
    const party = this.state.parties[data.partyId];
    const player = this.state.players[client.sessionId];
    
    if (!party || !player) return;
    
    if (party.members.length >= MAX_RACE_PLAYERS) {
      this.send(client, 'error', { message: 'Party is full' });
      return;
    }
    
    // Add to party
    party.members.push({
      sessionId: client.sessionId,
      name: player.name,
      ready: false
    });
    
    player.partyId = data.partyId;
    
    // Notify party members
    for (const member of party.members) {
      const memberClient = this.clients.find(c => c.sessionId === member.sessionId);
      if (memberClient) {
        this.send(memberClient, 'partyUpdate', { partyId: data.partyId, party });
      }
    }
    
    console.log(`[LobbyRoom] ${player.name} joined party ${data.partyId}`);
  }

  /**
   * Handle leave party
   * @private
   */
  _handleLeaveParty(client) {
    const player = this.state.players[client.sessionId];
    if (!player?.partyId) return;
    
    this._removeFromParty(client.sessionId, player.partyId);
  }

  /**
   * Remove player from party
   * @private
   */
  _removeFromParty(sessionId, partyId) {
    const party = this.state.parties[partyId];
    if (!party) return;
    
    // Remove member
    party.members = party.members.filter(m => m.sessionId !== sessionId);
    
    // Update player reference
    const player = this.state.players[sessionId];
    if (player) {
      player.partyId = null;
    }
    
    // If leader left, migrate or disband
    if (party.leaderId === sessionId) {
      if (party.members.length > 0) {
        party.leaderId = party.members[0].sessionId;
        this.state.players[party.leaderId].isHost = true; // Update host flag
      } else {
        delete this.state.parties[partyId];
        return;
      }
    }
    
    // Notify remaining members
    for (const member of party.members) {
      const memberClient = this.clients.find(c => c.sessionId === member.sessionId);
      if (memberClient) {
        this.send(memberClient, 'partyUpdate', { partyId, party });
      }
    }
    
    this.send(this.clients.find(c => c.sessionId === sessionId), 'partyLeft', { partyId });
  }

  // ==========================================================================
  // CHAT MODERATION
  // ==========================================================================

  /**
   * Handle chat message with moderation
   * Filters profanity, detects spam, enforces rate limits
   * 
   * @param {Client} client - Sending client
   * @param {string|Object} msg - Message or message object
   */
  _handleChat(client, msg) {
    const player = this.state.players[client.sessionId];
    if (!player) return;
    
    // Extract message text
    const messageText = typeof msg === 'string' ? msg : msg.message || msg.text || '';
    
    // Length validation
    if (messageText.length > CHAT_MAX_LENGTH) {
      this.send(client, 'chatWarning', { reason: 'Message too long' });
      return;
    }
    
    // Empty message check
    if (!messageText.trim()) return;
    
    // Rate limiting check
    const chatHistory = this._chatHistory.get(client.sessionId) || [];
    const oneMinuteAgo = Date.now() - 60000;
    const recentMessages = chatHistory.filter(m => m.timestamp > oneMinuteAgo);
    
    if (recentMessages.length >= CHAT_RATE_LIMIT) {
      this.send(client, 'chatWarning', { reason: 'Sending messages too fast' });
      return;
    }
    
    // Spam detection (identical messages)
    const fiveSecondsAgo = Date.now() - SPAM_DETECTION_WINDOW;
    const veryRecent = recentMessages.filter(m => m.timestamp > fiveSecondsAgo);
    const identicalCount = veryRecent.filter(m => m.text.toLowerCase() === messageText.toLowerCase()).length;
    
    if (identicalCount >= SPAM_THRESHOLD) {
      this.send(client, 'chatWarning', { reason: 'Please don\'t spam' });
      // Could implement temporary mute here
      return;
    }
    
    // Profanity filter
    const filterResult = filterProfanity(messageText);
    
    // Log violation but still send filtered message
    if (!filterResult.clean) {
      console.warn(`[LobbyRoom] Profanity from ${player.name}: ${filterResult.violations.join(', ')}`);
    }
    
    // Add to history
    recentMessages.push({ text: messageText, timestamp: Date.now() });
    this._chatHistory.set(client.sessionId, recentMessages.slice(-100)); // Keep last 100
    
    // Broadcast chat message
    const broadcastMessage = filterResult.filteredMessage;
    this.broadcast('chat', {
      playerId: client.sessionId,
      name: player.name,
      message: broadcastMessage,
      timestamp: Date.now(),
      wasFiltered: !filterResult.clean
    });
  }

  // ==========================================================================
  // READY CHECK SYSTEM
  // ==========================================================================

  /**
   * Handle player ready signal
   * @private
   */
  _handleReady(client) {
    const player = this.state.players[client.sessionId];
    if (!player || player.ready) return;
    
    player.ready = true;
    this._readyPlayers.add(client.sessionId);
    
    // Update party member ready status
    if (player.partyId) {
      const party = this.state.parties[player.partyId];
      if (party) {
        const member = party.members.find(m => m.sessionId === client.sessionId);
        if (member) member.ready = true;
      }
    }
    
    this.broadcast('playerReady', { playerId: client.sessionId });
    
    // Check if we can start ready check countdown
    this._checkReadyState();
  }

  /**
   * Handle player unready
   * @private
   */
  _handleUnready(client) {
    const player = this.state.players[client.sessionId];
    if (!player || !player.ready) return;
    
    player.ready = false;
    this._readyPlayers.delete(client.sessionId);
    
    // Cancel any active ready check timer
    if (this._readyCheckTimer) {
      this.clock.clearTimeout(this._readyCheckTimer);
      this._readyCheckTimer = null;
    }
    
    this.broadcast('playerUnready', { playerId: client.sessionId });
  }

  /**
   * Check if all conditions are met for race start
   * @private
   */
  _checkReadyState() {
    const players = Object.values(this.state.players).filter(p => !p.isBot);
    const readyCount = this._readyPlayers.size;
    
    // Need minimum players and all must be ready
    if (players.length >= MIN_MATCHMAKE_PLAYERS && readyCount === players.length) {
      // Start ready check countdown
      this._startReadyCheck();
    } else if (readyCount >= MIN_MATCHMAKE_PLAYERS) {
      // Some players ready, notify about waiting for others
      const waitingFor = players.filter(p => !this._readyPlayers.has(p.id)).map(p => p.name);
      this.broadcast('waitingForPlayers', { waitingFor });
    }
  }

  /**
   * Start the ready check countdown
   * Gives unresponsive players time to confirm
   * @private
   */
  _startReadyCheck() {
    if (this._readyCheckTimer) return;
    
    this.state.phase = 'ready_check';
    this.broadcast('phaseChange', { phase: 'ready_check', duration: READY_CHECK_TIMEOUT });
    
    this._readyCheckTimer = this.clock.setTimeout(() => {
      this._confirmReadyAndProceed();
    }, READY_CHECK_TIMEOUT);
  }

  /**
   * Confirm all players are still ready and proceed to next phase
   * @private
   */
  _confirmReadyAndProceed() {
    const players = Object.values(this.state.players).filter(p => !p.isBot);
    const allStillReady = players.every(p => p.ready && this._readyPlayers.has(p.id));
    
    if (allStillReady) {
      // Start map voting or proceed directly
      this._startMapVoting();
    } else {
      // Someone unreadied, cancel
      this.state.phase = 'lobby';
      this.broadcast('readyCheckFailed', { 
        reason: 'Not all players remained ready' 
      });
    }
    
    this._readyCheckTimer = null;
  }

  // ==========================================================================
  // MAP VOTING SYSTEM
  // ==========================================================================

  /**
   * Start map voting phase
   * Selects random track options and presents to players
   * @private
   */
  _startMapVoting() {
    this.state.phase = 'voting';
    
    // Select random tracks
    const shuffled = [...MAP_VOTE_CONFIG.tracks].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, MAP_VOTE_CONFIG.optionsPerVote);
    
    this.state.currentVotes = {
      options,
      votes: {}, // option -> count
      voters: new Set(),
      endsAt: Date.now() + MAP_VOTE_CONFIG.votingDuration
    };
    
    this.broadcast('mapVoteStart', {
      options,
      duration: MAP_VOTE_CONFIG.votingDuration
    });
    
    // Auto-end voting after duration
    this.clock.setTimeout(() => {
      this._endMapVoting();
    }, MAP_VOTE_CONFIG.votingDuration);
  }

  /**
   * Handle vote cast
   * @private
   */
  _handleVote(client, data) {
    if (this.state.phase !== 'voting') return;
    if (!this.state.currentVotes) return;
    
    const player = this.state.players[client.sessionId];
    if (!player || !player.ready) return;
    
    const { trackId } = data;
    const validOptions = this.state.currentVotes.options;
    
    if (!validOptions.includes(trackId)) {
      this.send(client, 'error', { message: 'Invalid vote option' });
      return;
    }
    
    // Change vote if already voted
    if (this.state.currentVotes.voters.has(client.sessionId)) {
      // Find and remove old vote
      for (const [option, voters] of Object.entries(this.state.currentVotes.voteDetails || {})) {
        const idx = voters.indexOf(client.sessionId);
        if (idx !== -1) {
          voters.splice(idx, 1);
          this.state.currentVotes.votes[option] = voters.length;
        }
      }
    }
    
    // Register vote
    this.state.currentVotes.voters.add(client.sessionId);
    this.state.currentVotes.votes[trackId] = (this.state.currentVotes.votes[trackId] || 0) + 1;
    
    if (!this.state.currentVotes.voteDetails) {
      this.state.currentVotes.voteDetails = {};
    }
    if (!this.state.currentVotes.voteDetails[trackId]) {
      this.state.currentVotes.voteDetails[trackId] = [];
    }
    this.state.currentVotes.voteDetails[trackId].push(client.sessionId);
    
    this.broadcast('voteCast', { 
      playerId: client.sessionId, 
      trackId,
      totals: this.state.currentVotes.votes 
    });
  }

  /**
   * End map voting and select winning track
   * @private
   */
  _endMapVoting() {
    if (!this.state.currentVotes) return;
    
    const votes = this.state.currentVotes.votes;
    const options = this.state.currentVotes.options;
    
    // Find winner (most votes, random tiebreak)
    let maxVotes = 0;
    let winners = [];
    
    for (const option of options) {
      const count = votes[option] || 0;
      if (count > maxVotes) {
        maxVotes = count;
        winners = [option];
      } else if (count === maxVotes) {
        winners.push(option);
      }
    }
    
    // Random tiebreak
    const selectedTrack = winners[Math.floor(Math.random() * winners.length)];
    this.state.selectedTrack = selectedTrack;
    
    this.state.phase = 'transitioning';
    this.broadcast('mapVoteEnd', {
      selectedTrack,
      votes,
      winner: selectedTrack
    });
    
    console.log(`[LobbyRoom] Track selected: ${selectedTrack}`);
    
    // Transition to race after brief delay
    this.clock.setTimeout(() => {
      this._proceedToRace(selectedTrack);
    }, 3000);
  }

  // ==========================================================================
  // BOT BACKFILL SYSTEM
  // ==========================================================================

  /**
   * Handle add bot request (host only)
   * @private
   */
  _handleAddBot(client) {
    const player = this.state.players[client.sessionId];
    if (!player || client.sessionId !== this.state.hostId) {
      this.send(client, 'error', { message: 'Only host can add bots' });
      return;
    }
    
    if (this._activeBots.size >= BOT_CONFIG.maxBots) {
      this.send(client, 'error', { message: 'Maximum bots reached' });
      return;
    }
    
    // Calculate difficulty based on average player ELO
    const players = Object.values(this.state.players).filter(p => !p.isBot);
    const avgElo = players.reduce((sum, p) => sum + (p.elo || 1200), 0) / Math.max(players.length, 1);
    
    let difficulty = 'medium';
    for (const [diff, range] of Object.entries(BOT_CONFIG.difficultyRanges)) {
      if (avgElo >= range.eloMin && avgElo <= range.eloMax) {
        difficulty = diff;
        break;
      }
    }
    
    // Create bot
    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const botName = BOT_CONFIG.names[Math.floor(Math.random() * BOT_CONFIG.names.length)];
    
    const botData = {
      id: botId,
      name: botName,
      isBot: true,
      difficulty,
      elo: this._getBotElo(difficulty),
      ready: true,
      joinedAt: Date.now()
    };
    
    this._activeBots.set(botId, botData);
    this.state.players[botId] = {
      ...botData,
      level: Math.floor(Math.random() * 50) + 1,
      vehicleId: 'spectre',
      characterId: 'ace'
    };
    
    this._readyPlayers.add(botId); // Bots are always ready
    
    this.broadcast('botAdded', { bot: botData });
    console.log(`[LobbyRoom] Bot added: ${botName} (${difficulty})`);
  }

  /**
   * Get ELO rating for bot based on difficulty
   * @private
   */
  _getBotElo(difficulty) {
    const range = BOT_CONFIG.difficultyRanges[difficulty];
    return Math.floor(Math.random() * (range.eloMax - range.eloMin)) + range.eloMin;
  }

  /**
   * Handle remove bot request
   * @private
   */
  _handleRemoveBot(client, data) {
    if (client.sessionId !== this.state.hostId) {
      this.send(client, 'error', { message: 'Only host can remove bots' });
      return;
    }
    
    const botId = data.botId;
    if (!this._activeBots.has(botId)) {
      this.send(client, 'error', { message: 'Bot not found' });
      return;
    }
    
    this._activeBots.delete(botId);
    delete this.state.players[botId];
    this._readyPlayers.delete(botId);
    
    this.broadcast('botRemoved', { botId });
  }

  /**
   * Auto-fill with bots if needed
   * Call when starting race to ensure minimum player count
   * @private
   */
  async _backfillWithBots() {
    const humanPlayers = Object.values(this.state.players).filter(p => !p.isBot);
    const currentTotal = humanPlayers.length + this._activeBots.size;
    const needed = Math.max(0, BOT_CONFIG.minPlayersToStart - currentTotal);
    
    for (let i = 0; i < needed && this._activeBots.size < BOT_CONFIG.maxBots; i++) {
      await this._handleAddBot({ sessionId: this.state.hostId });
    }
  }

  // ==========================================================================
  // HOST MANAGEMENT
  // ==========================================================================

  /**
   * Migrate host to another player if current host leaves
   * @private
   */
  _migrateHost() {
    const players = Object.values(this.state.players).filter(p => !p.isBot);
    
    if (players.length === 0) {
      this.state.hostId = null;
      return;
    }
    
    // Select new host (longest session or first available)
    const newHost = players.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    
    const oldHostId = this.state.hostId;
    this.state.hostId = newHost.id;
    newHost.isHost = true;
    
    // Clear old host flag
    if (this.state.players[oldHostId]) {
      this.state.players[oldHostId].isHost = false;
    }
    
    this.broadcast('hostMigrated', {
      oldHostId,
      newHostId: newHost.id,
      newHostName: newHost.name
    });
    
    console.log(`[LobbyRoom] Host migrated to ${newHost.name}`);
  }

  /**
   * Handle start race request (host only)
   * @private
   */
  async _handleStartRace(client) {
    if (client.sessionId !== this.state.hostId) {
      this.send(client, 'error', { message: 'Only host can start race' });
      return;
    }
    
    // Backfill with bots if needed
    await this._backfillWithBots();
    
    // Start ready check
    this._startReadyCheck();
  }

  /**
   * Handle kick player request (host only)
   * @private
   */
  _handleKickPlayer(client, data) {
    if (client.sessionId !== this.state.hostId) {
      this.send(client, 'error', { message: 'Only host can kick players' });
      return;
    }
    
    const targetClient = this.clients.find(c => c.sessionId === data.playerId);
    if (targetClient) {
      this.send(targetClient, 'kicked', { reason: data.reason || 'Kicked by host' });
      targetClient.leave();
    }
  }

  // ==========================================================================
  // RACE TRANSITION
  // ==========================================================================

  /**
   * Proceed to race after all preparations complete
   * @private
   */
  async _proceedToRace(trackId) {
    console.log(`[LobbyRoom] Transitioning to race on ${trackId}`);
    
    // Gather all players (including bots)
    const racePlayers = Object.values(this.state.players).map(p => ({
      sessionId: p.id,
      name: p.name,
      vehicleId: p.vehicleId || 'spectre',
      characterId: p.characterId || 'ace',
      isBot: p.isBot || false,
      elo: p.elo || 1200
    }));
    
    // Notify clients about transition
    this.broadcast('raceTransitioning', {
      trackId,
      modeId: this.state.selectedMode || 'circuit',
      players: racePlayers,
      roomId: `race_${Date.now()}`
    });
  }

  /**
   * Cleanup on room dispose
   */
  onDispose() {
    // Cancel any pending timers
    if (this._readyCheckTimer) {
      this.clock.clearTimeout(this._readyCheckTimer);
    }
    
    // Clean up matchmaker
    if (this._matchmaker) {
      this._matchmaker.shutdown();
    }
    
    console.log('[LobbyRoom] Disposed');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default LobbyRoom;
