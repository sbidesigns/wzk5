// OnlineMultiplayer.js - Complete multiplayer flow controller
// Wires NetworkManager to actual gameplay with full connection lifecycle,
// race synchronization, lobby features, and disconnection handling.

import { NetworkManager } from './NetworkManager.js';
import { EventBus } from '../core/EventBus.js';

// Connection states
const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  MATCHMAKING: 'matchmaking',
  IN_LOBBY: 'in_lobby',
  IN_RACE: 'in_race'
};

// Race states
const RaceState = {
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  FINISHED: 'finished'
};

class OnlineMultiplayer {
  constructor() {
    this._network = new NetworkManager({
      serverUrl: import.meta.env?.VITE_WS_URL || 'ws://localhost:8080',
      reconnectInterval: 3000,
      pingInterval: 5000,
      timeout: 15000
    });

    // Connection state
    this._connectionState = ConnectionState.DISCONNECTED;
    this._authToken = null;
    this._playerInfo = null;

    // Match/lobby state
    this._currentLobby = null;
    this._lobbyMembers = [];
    this._isHost = false;
    this._raceState = RaceState.WAITING;
    this._matchId = null;

    // Race synchronization
    this._inputSequence = 0;
    this._predictedStates = new Map(); // sequence -> state
    this._serverStateBuffer = [];
    this._otherPlayers = new Map(); // playerId -> playerData
    this._lastServerUpdate = 0;

    // Reconnection
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._lastKnownState = null;

    // Callbacks
    this._callbacks = {
      onStateChange: null,
      onPlayerJoined: null,
      onPlayerLeft: null,
      onChatMessage: null,
      onRaceStart: null,
      onRaceEnd: null,
      onError: null,
      onReconnected: null
    };

    // Bind network events
    this._bindNetworkEvents();
  }

  // ==================== CONNECTION LIFECYCLE ====================

  /**
   * Initialize WebSocket connection to server
   * @param {string} serverUrl - Optional override for server URL
   * @returns {Promise<void>}
   */
  async connectToServer(serverUrl) {
    if (this._connectionState !== ConnectionState.DISCONNECTED && 
        this._connectionState !== ConnectionState.CONNECTING) {
      console.warn('[Multiplayer] Already connected or connecting');
      return;
    }

    this._setState(ConnectionState.CONNECTING);

    if (serverUrl) {
      this._network.config.serverUrl = serverUrl;
    }

    try {
      await this._network.connect();
      this._setState(ConnectionState.CONNECTED);
      EventBus.emit('multiplayer:connected');
      console.log('[Multiplayer] Connected to server');
    } catch (error) {
      this._setState(ConnectionState.DISCONNECTED);
      this._emitError('Connection failed', error);
      throw error;
    }
  }

  /**
   * Authenticate with JWT token
   * @param {string} token - JWT auth token
   * @returns {Promise<object>} Player info
   */
  async authenticate(token) {
    if (!this._network.isConnected()) {
      throw new Error('Not connected to server');
    }

    this._setState(ConnectionState.AUTHENTICATING);
    this._authToken = token;

    try {
      const result = await this._network._sendAndWait('auth:jwt', { token }, 10000);
      
      if (result.success) {
        this._playerInfo = result.player;
        this._network.token = token;
        this._setState(ConnectionState.AUTHENTICATED);
        EventBus.emit('multiplayer:authenticated', result.player);
        console.log('[Multiplayer] Authenticated as', result.player.name);
        return result.player;
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      this._setState(ConnectionState.CONNECTED);
      this._emitError('Authentication failed', error);
      throw error;
    }
  }

  /**
   * Enter matchmaking queue for a game mode
   * @param {string} modeId - Game mode identifier
   * @param {object} preferences - Matchmaking preferences
   * @returns {Promise<void>}
   */
  async findMatch(modeId, preferences = {}) {
    if (!this._network.isConnected()) {
      throw new Error('Not connected to server');
    }

    this._setState(ConnectionState.MATCHMAKING);

    const payload = {
      modeId,
      preferences: {
        region: preferences.region || 'auto',
        maxPing: preferences.maxPing || 200,
        ...preferences
      }
    };

    try {
      await this._network.enterMatchmaking(payload);
      EventBus.emit('multiplayer:matchmaking', { modeId, preferences });
      console.log('[Multiplayer] Entered matchmaking for', modeId);
    } catch (error) {
      this._setState(ConnectionState.AUTHENTICATED);
      this._emitError('Matchmaking failed', error);
      throw error;
    }
  }

  /**
   * Cancel current matchmaking search
   */
  cancelMatchmaking() {
    if (this._connectionState === ConnectionState.MATCHMAKING) {
      this._network.leaveMatchmaking();
      this._setState(ConnectionState.AUTHENTICATED);
      EventBus.emit('multiplayer:matchmakingCancelled');
      console.log('[Multiplayer] Left matchmaking queue');
    }
  }

  /**
   * Join a specific lobby room
   * @param {string} roomId - Room ID to join
   * @returns {Promise<object>} Lobby data
   */
  async joinLobby(roomId) {
    try {
      const result = await this._network._sendAndWait('lobby:join', { roomId }, 10000);
      
      if (result.success) {
        this._currentLobby = result.lobby;
        this._lobbyMembers = result.members || [];
        this._isHost = result.isHost || false;
        this._setState(ConnectionState.IN_LOBBY);
        
        EventBus.emit('multiplayer:joinedLobby', { lobby: result.lobby, members: this._lobbyMembers });
        console.log('[Multiplayer] Joined lobby:', roomId);
        return result;
      } else {
        throw new Error(result.error || 'Failed to join lobby');
      }
    } catch (error) {
      this._emitError('Failed to join lobby', error);
      throw error;
    }
  }

  /**
   * Signal ready status to host
   */
  readyUp() {
    if (!this._currentLobby) return;
    
    this._network.setPartyReadiness(true);
    this._network.send({ type: 'lobby:ready', ready: true });
    EventBus.emit('multiplayer:readyUp');
  }

  /**
   * Begin synchronized countdown and start race
   */
  startRace() {
    if (!this._isHost) {
      console.warn('[Multiplayer] Only host can start race');
      return;
    }

    this._network.send({ type: 'race:startCountdown' });
    this._setState(RaceState.COUNTDOWN);
    console.log('[Multiplayer] Initiating race countdown');
  }

  // ==================== RACE SYNCHRONIZATION ====================

  /**
   * Send player input state to server (call at 60Hz)
   * @param {object} inputState - Current input state
   */
  sendInput(inputState) {
    if (this._connectionState !== ConnectionState.IN_RACE || 
        this._raceState !== RaceState.RACING) {
      return;
    }

    const update = {
      type: 'race:input',
      sequence: ++this._inputSequence,
      timestamp: performance.now(),
      input: inputState
    };

    // Store predicted state for reconciliation
    this._predictedStates.set(this._inputSequence, {
      sequence: this._inputSequence,
      timestamp: performance.now(),
      input: inputState,
      position: this._lastKnownState?.position || null,
      rotation: this._lastKnownState?.rotation || null
    });

    // Keep buffer manageable
    if (this._predictedStates.size > 120) {
      const oldestKey = this._predictedStates.keys().next().value;
      this._predictedStates.delete(oldestKey);
    }

    this._network.send(update);
  }

  /**
   * Process authoritative state from server
   * @param {object} serverState - State received from server
   */
  receiveState(serverState) {
    this._lastServerUpdate = performance.now();

    // Update match/race state if present
    if (serverState.matchState) {
      this._matchId = serverState.matchState.matchId;
      
      switch (serverState.matchState.phase) {
        case 'countdown':
          this._raceState = RaceState.COUNTDOWN;
          break;
        case 'racing':
          if (this._raceState !== RaceState.RACING) {
            this._raceState = RaceState.RACING;
            this._callbacks.onRaceStart?.(serverState.matchState);
            EventBus.emit('multiplayer:raceStart', serverState.matchState);
          }
          break;
        case 'finished':
          this._raceState = RaceState.FINISHED;
          this._callbacks.onRaceEnd?.(serverState.results);
          EventBus.emit('multiplayer:raceEnd', serverState.results);
          break;
      }
    }

    // Process corrections (reconciliation)
    if (serverState.corrections && serverState.corrections.length > 0) {
      for (const correction of serverState.corrections) {
        this.reconcilePrediction(null, correction);
      }
    }

    // Store authoritative state
    if (serverState.authoritative) {
      this._lastKnownState = serverState.authoritative;
      this._serverStateBuffer.push({
        ...serverState.authoritative,
        receivedAt: performance.now()
      });

      // Keep last 60 frames of server state
      while (this._serverStateBuffer.length > 60) {
        this._serverStateBuffer.shift();
      }
    }

    // Process other players
    if (serverState.players) {
      this.handleOtherPlayers(serverState.players);
    }

    // Pass to NetworkManager's state handler
    this._network.receiveServerState(serverState);
  }

  /**
   * Reconcile client prediction with server authority
   * @param {object} clientState - Client's predicted state
   * @param {object} serverState - Server's authoritative state
   */
  reconcilePrediction(clientState, serverState) {
    if (!serverState.sequence) return;

    const predicted = this._predictedStates.get(serverState.sequence);
    if (!predicted) return;

    // Check if server disagrees significantly
    const positionError = serverState.position && predicted.position ? 
      Math.abs(serverState.position.x - predicted.position.x) +
      Math.abs(serverState.position.y - predicted.position.y) +
      Math.abs(serverState.position.z - predicted.position.z) : 0;

    if (positionError > 0.5) {
      // Significant discrepancy - emit correction event
      console.warn(`[Multiplayer] Correction needed at seq ${serverState.sequence}, error: ${positionError.toFixed(2)}`);
      
      EventBus.emit('multiplayer:stateCorrection', {
        sequence: serverState.sequence,
        serverPosition: serverState.position,
        clientPosition: predicted.position,
        error: positionError
      });

      // Remove old predictions up to this point
      for (const [seq, state] of this._predictedStates) {
        if (seq <= serverState.sequence) {
          this._predictedStates.delete(seq);
        }
      }
    }
  }

  /**
   * Update remote player positions from server
   * @param {object[]} playerStates - Array of other player states
   */
  handleOtherPlayers(playerStates) {
    const now = performance.now();

    for (const playerState of playerStates) {
      const existing = this._otherPlayers.get(playerState.playerId);
      
      if (existing) {
        // Interpolate smoothly
        existing.targetPosition = playerState.position;
        existing.targetRotation = playerState.rotation;
        existing.velocity = playerState.velocity;
        existing.lastUpdate = now;
        existing.lap = playerState.lap;
        existing.checkpoint = playerState.checkpoint;
        existing.position = playerState.racePosition;
      } else {
        // New player joined
        this._otherPlayers.set(playerState.playerId, {
          ...playerState,
          targetPosition: playerState.position,
          targetRotation: playerState.rotation,
          lastUpdate: now
        });
        
        this._callbacks.onPlayerJoined?.(playerState);
        EventBus.emit('multiplayer:playerJoined', playerState);
      }
    }

    // Check for disconnected players
    const currentIds = new Set(playerStates.map(p => p.playerId));
    for (const [playerId, player] of this._otherPlayers) {
      if (!currentIds.has(playerId) && now - player.lastUpdate > 5000) {
        this._otherPlayers.delete(playerId);
        this._callbacks.onPlayerLeft?.({ playerId, name: player.name });
        EventBus.emit('multiplayer:playerLeft', { playerId, name: player.name });
      }
    }
  }

  /**
   * Get interpolated positions for all remote players
   * @param {number} interpolationDelay - Delay in ms for interpolation
   * @returns {Map} Player ID -> interpolated state
   */
  getInterpolatedPlayers(interpolationDelay = 100) {
    const now = performance.now();
    const result = new Map();

    for (const [playerId, player] of this._otherPlayers) {
      const age = now - player.lastUpdate;
      
      if (age < 3000) { // Don't show stale players
        let position = player.targetPosition || player.position;
        let rotation = player.targetRotation || player.rotation;

        // Simple interpolation would go here
        // For now, use latest known position
        
        result.set(playerId, {
          ...player,
          interpolatedPosition: position,
          interpolatedRotation: rotation,
          age
        });
      }
    }

    return result;
  }

  // ==================== LOBBY FEATURES ====================

  /**
   * Send chat message to lobby
   * @param {string} text - Message text
   */
  sendMessage(text) {
    if (!text.trim()) return;
    
    this._network.sendMessage(text, 'lobby');
    
    // Echo locally
    this._callbacks.onChatMessage?.({
      senderId: this._network.getPlayerId(),
      senderName: this._playerInfo?.name || 'You',
      text: text.trim(),
      timestamp: Date.now(),
      isLocal: true
    });
  }

  /**
   * Vote for a track/map in lobby
   * @param {string} trackId - Track to vote for
   */
  voteForMap(trackId) {
    this._network.send({
      type: 'lobby:vote',
      voteType: 'track',
      value: trackId
    });
    EventBus.emit('multiplayer:mapVote', { trackId });
  }

  /**
   * Kick a player from lobby (host only)
   * @param {string} playerId - Player to kick
   * @param {string} reason - Reason for kick
   */
  kickPlayer(playerId, reason = '') {
    if (!this._isHost) {
      console.warn('[Multiplayer] Only host can kick players');
      return;
    }
    
    this._network.kickPlayer(playerId, reason);
  }

  /**
   * Invite a friend to the party/lobby
   * @param {string} playerId - Player to invite
   */
  inviteFriend(playerId) {
    this._network.invitePlayer(playerId);
    EventBus.emit('multiplayer:sentInvite', { playerId });
  }

  // ==================== DISCONNECTION HANDLING ====================

  /**
   * Handle disconnection from server
   */
  handleDisconnect() {
    const wasInRace = this._connectionState === ConnectionState.IN_RACE;
    
    this._setState(ConnectionState.DISCONNECTED);
    
    // Show reconnect UI
    EventBus.emit('multiplayer:disconnected', { wasInRace });
    
    // Attempt auto-reconnect
    if (this._reconnectAttempts < this._maxReconnectAttempts) {
      this.attemptReconnect();
    } else {
      this._emitError('Connection lost. Please refresh the page.', null);
    }
  }

  /**
   * Attempt to reconnect to server
   */
  async attemptReconnect() {
    this._reconnectAttempts++;
    console.log(`[Multiplayer] Reconnecting... (${this._reconnectAttempts}/${this._maxReconnectAttempts})`);
    
    EventBus.emit('multiplayer:reconnecting', { 
      attempt: this._reconnectAttempts, 
      max: this._maxReconnectAttempts 
    });

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.connectToServer();
        
        // Re-authenticate if we had a token
        if (this._authToken) {
          await this.authenticate(this._authToken);
        }
        
        // Restore previous state
        const restoredState = this.restoreState();
        
        this._reconnectAttempts = 0;
        this._callbacks.onReconnected?.(restoredState);
        EventBus.emit('multiplayer:reconnected', restoredState);
        console.log('[Multiplayer] Successfully reconnected');
        
      } catch (error) {
        console.warn('[Multiplayer] Reconnect failed:', error.message);
        
        if (this._reconnectAttempts < this._maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this._emitError('Failed to reconnect after multiple attempts', error);
        }
      }
    }, 3000 * this._reconnectAttempts); // Exponential backoff
  }

  /**
   * Get last known state for reconnection restoration
   * @returns {object} Last known state snapshot
   */
  restoreState() {
    return {
      connectionState: this._connectionState,
      lobby: this._currentLobby,
      isHost: this._isHost,
      raceState: this._raceState,
      matchId: this._matchId,
      lastKnownState: this._lastKnownState,
      otherPlayers: Array.from(this._otherPlayers.entries()),
      timestamp: Date.now()
    };
  }

  /**
   * Cancel any pending reconnection attempts
   */
  cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempts = 0;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Set callback for events
   * @param {string} event - Event name
   * @param {function} callback - Handler function
   */
  on(event, callback) {
    if (this._callbacks.hasOwnProperty(event)) {
      this._callbacks[event] = callback;
    }
  }

  /**
   * Get current connection state
   * @returns {string}
   */
  getState() {
    return {
      connection: this._connectionState,
      race: this._raceState,
      isInLobby: !!this._currentLobby,
      isHost: this._isHost,
      playerCount: this._lobbyMembers.length,
      latency: this._network.getLatency()
    };
  }

  /**
   * Get network statistics
   * @returns {object}
   */
  getStats() {
    return {
      ...this._network.getStats(),
      connectionState: this._connectionState,
      raceState: this._raceState,
      playerCount: this._otherPlayers.size,
      inputSequence: this._inputSequence,
      reconnectAttempts: this._reconnectAttempts
    };
  }

  /**
   * Disconnect from server completely
   */
  disconnect() {
    this.cancelReconnect();
    this._network.disconnect();
    this._setState(ConnectionState.DISCONNECTED);
    this._currentLobby = null;
    this._lobbyMembers = [];
    this._otherPlayers.clear();
    this._predictedStates.clear();
    this._serverStateBuffer = [];
    EventBus.emit('multiplayer:disconnected', { intentional: true });
  }

  // ==================== INTERNAL METHODS ====================

  _setState(newState) {
    const oldState = this._connectionState;
    this._connectionState = newState;
    this._callbacks.onStateChange?.(newState, oldState);
    EventBus.emit('multiplayer:stateChange', { newState, oldState });
  }

  _bindNetworkEvents() {
    // Handle network-level disconnect
    this._network.onDisconnect = () => {
      this.handleDisconnect();
    };

    // Register message handlers for game-specific messages
    this._network.messageHandlers.set('lobby:update', (msg) => {
      this._currentLobby = msg.lobby;
      this._lobbyMembers = msg.members || [];
      this._isHost = msg.leader === this._network.getPlayerId();
      EventBus.emit('multiplayer:lobbyUpdate', msg);
    });

    this._network.messageHandlers.set('lobby:chat', (msg) => {
      this._callbacks.onChatMessage?.(msg);
      EventBus.emit('multiplayer:chat', msg);
    });

    this._network.messageHandlers.set('lobby:playerJoined', (msg) => {
      this._callbacks.onPlayerJoined?.(msg);
      EventBus.emit('multiplayer:playerJoined', msg);
    });

    this._network.messageHandlers.set('lobby:playerLeft', (msg) => {
      this._callbacks.onPlayerLeft?.(msg);
      EventBus.emit('multiplayer:playerLeft', msg);
    });

    this._network.messageHandlers.set('race:state', (msg) => {
      this.receiveState(msg);
    });

    this._network.messageHandlers.set('race:countdown', (msg) => {
      this._raceState = RaceState.COUNTDOWN;
      EventBus.emit('multiplayer:countdown', msg);
    });

    this._network.messageHandlers.set('matchmaking:found', (msg) => {
      this._currentLobby = msg.lobby;
      this._lobbyMembers = msg.members || [];
      this._setState(ConnectionState.IN_LOBBY);
      EventBus.emit('multiplayer:matchFound', msg);
    });

    this._network.messageHandlers.set('party:invite', (msg) => {
      EventBus.emit('multiplayer:receivedInvite', msg);
    });

    this._network.messageHandlers.set('error', (msg) => {
      this._emitError(msg.message || 'Server error', msg);
    });
  }

  _emitError(message, error) {
    console.error('[Multiplayer]', message, error);
    this._callbacks.onError?.(message, error);
    EventBus.emit('multiplayer:error', { message, error });
  }

  dispose() {
    this.disconnect();
    this._callbacks = {};
  }
}

// Export singleton instance and class
export const onlineMultiplayer = new OnlineMultiplayer();
export default onlineMultiplayer;
export { ConnectionState, RaceState };
