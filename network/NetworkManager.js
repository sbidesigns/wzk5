// network/NetworkManager.js - Multiplayer Networking Foundation
// WebSocket-based client with client-side prediction, server reconciliation,
// lobby system, matchmaking queue, and MMO persistent world support

export class NetworkManager {
  constructor(config = {}) {
    this.config = {
      serverUrl: config.serverUrl || 'ws://localhost:8080',
      reconnectInterval: 5000,
      pingInterval: 5000,
      timeout: 10000,
      ...config
    };
    
    // Connection state
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    // Session data
    this.sessionId = null;
    this.playerId = this._generatePlayerId();
    this.token = null;
    
    // Ping/latency tracking
    this.pingInterval = null;
    this.latency = 0;
    this.lastPingTime = 0;
    this.jitter = 0;
    this.pings = [];
    
    // Message queues
    this.sendQueue = [];
    this.messageHandlers = new Map(); // type -> handler function
    
    // State synchronization
    this.serverState = {}; // Authoritative state from server
    this.clientState = {};   // Predicted local state
    this.stateBuffer = [];   // Buffer for reconciliation
    
    // Prediction settings
    this.predictionEnabled = true;
    this.maxRollbackTime = 100; // ms of state history to keep
    this.interpolationDelay = 200; // ms to delay remote entities
    
    // Entity interpolation
    this.remoteEntities = new Map(); // entityId -> { position, rotation, timestamp, targetValues }
    
    // Party/Lobby
    this.party = null;
    this.partyMembers = [];
    this.isPartyLeader = false;
    
    // Matchmaking
    this.matchmakingQueue = false;
    this.matchmakingPreferences = {};
    this.queuePosition = 0;
    this.estimatedWaitTime = 0;
    
    // Chat
    this.chatMessages = [];
    this.mutedPlayers = new Set();
    
    // Event callbacks
    this.onConnect = null;
    this.onDisconnect = null;
    this.onMessage = null;
    this.onError = null;
    
    // Statistics
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      reconnects: 0,
      latencySamples: []
    };
  }

  _generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  }

  // ==================== CONNECTION MANAGEMENT ====================

  async connect() {
    if (this.connected || this.connecting) return this;
    
    this.connecting = true;
    
    try {
      this.ws = new WebSocket(this.config.serverUrl);
      
      this.ws.onopen = () => this._handleOpen();
      this.ws.onclose = (event) => this._handleClose(event);
      this.ws.onerror = (error) => this._handleError(error);
      this.ws.onmessage = (event) => this._handleMessage(event);
      
      // Connection timeout
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.config.timeout);
      });
      
      await Promise.race([
        new Promise(resolve => { this.ws.onopen = () => resolve(); }),
        timeoutPromise
      ]);
      
      return this;
      
    } catch (error) {
      console.error('[Network] Connection failed:', error.message);
      this.connecting = false;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log(`[Network] Reconnecting... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        await new Promise(r => setTimeout(r, this.config.reconnectInterval));
        this.reconnectAttempts++;
        this.stats.reconnects++;
        
        return this.connect();
      }
      
      throw error;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    this._cleanup();
  }

  _handleOpen() {
    console.log('[Network] Connected to server');
    this.connected = true;
    this.connecting = false;
    this.reconnectAttempts = 0;
    
    // Start ping interval
    this._startPingLoop();
    
    // Flush send queue
    this._flushSendQueue();
    
    // Authenticate or register
    this.send({
      type: 'auth:register',
      playerId: this.playerId,
      version: '1.0.0'
    });
    
    if (this.onConnect) this.onConnect();
  }

  _handleClose(event) {
    console.log(`[Network] Disconnected: ${event.code} ${event.reason}`);
    this.connected = false;
    this._stopPingLoop();
    this._cleanup();
    
    if (this.onDisconnect) this.onDisconnect({ code: event.code, reason: event.reason });
  }

  _handleError(error) {
    console.error('[Network] Error:', error);
    
    if (this.onError) this.onError(error);
  }

  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.stats.messagesReceived++;
      this.stats.bytesReceived += event.data.length;
      
      // Route message to appropriate handler
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        handler(message);
      } else {
        // Default message handling
        this._handleDefaultMessage(message);
      }
      
      if (this.onMessage) this.onMessage(message);
      
    } catch (e) {
      console.warn('[Network] Failed to parse message:', e);
    }
  }

  _cleanup() {
    this._stopPingLoop();
    this.remoteEntities.clear();
  }

  // ==================== MESSAGE SENDING ====================

  send(data) {
    const message = JSON.stringify(data);
    
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      this.stats.messagesSent++;
      this.stats.bytesSent += message.length;
    } else {
      // Queue for when connected
      this.sendQueue.push(data);
      
      // Limit queue size
      if (this.sendQueue.length > 100) {
        this.sendQueue.shift();
      }
    }
  }

  _flushSendQueue() {
    while (this.sendQueue.length > 0 && this.connected) {
      const data = this.sendQueue.shift();
      this.send(data);
    }
  }

  // ==================== PING/LATENCY ====================

  _startPingLoop() {
    this._stopPingLoop();
    
    this.pingInterval = setInterval(() => {
      if (!this.connected) return;
      
      this.lastPingTime = performance.now();
      
      this.send({
        type: 'ping',
        timestamp: this.lastPingTime,
        clientTime: performance.now()
      });
      
    }, this.config.pingInterval);
  }

  _stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ==================== STATE SYNCHRONIZATION ====================

  /**
   * Send local state update to server
   * Includes prediction data for reconciliation
   */
  sendStateUpdate(stateData) {
    const update = {
      type: 'state:update',
      timestamp: performance.now(),
      sequence: this.stats.messagesSent, // Simple sequence number
      input: stateData.input || {},
      position: stateData.position || {},
      rotation: stateData.rotation || {},
      velocity: stateData.velocity || {},
      localTime: performance.now(),
      prediction: this.predictionEnabled
    };
    
    // Store in buffer for potential rollback
    this.stateBuffer.push(update);
    
    // Keep buffer manageable
    while (this.stateBuffer.length > 60) {
      this.stateBuffer.shift();
    }
    
    this.send(update);
  }

  /**
   * Receive authoritative state from server
   * Reconcile with predictions if needed
   */
  receiveServerState(serverState) {
    const now = performance.now();
    
    // Store authoritative state
    Object.assign(this.serverState, serverState);
    
    // Process entity updates
    if (serverState.entities) {
      Object.entries(serverState.entities).forEach(([entityId, entityData]) => {
        this._updateRemoteEntity(entityId, entityData, now);
      });
    }
    
    // Check for state corrections (server disagreement)
    if (serverState.corrections) {
      serverState.corrections.forEach(correction => {
        this._applyCorrection(correction);
      });
    }
  }

  _updateRemoteEntity(entityId, data, timestamp) {
    const existing = this.remoteEntities.get(entityId);
    
    if (existing) {
      // Interpolate to smooth out movement
      const age = timestamp - existing.timestamp;
      
      if (age < this.interpolationDelay) {
        // Smooth interpolate
        const t = age / this.interpolationDelay;
        
        if (data.position) {
          existing.targetValues.position = data.position;
          // Would lerp here
        }
        
        existing.timestamp = timestamp;
        existing.data = data;
      } else {
        // Old data, just snap
        existing.data = data;
        existing.timestamp = timestamp;
      }
    } else {
      // New entity
      this.remoteEntities.set(entityId, {
        data,
        timestamp,
        targetValues: {}
      });
    }
  }

  _applyCorrection(correction) {
    // Find matching state in buffer
    const bufferedState = this.stateBuffer.find(s => s.sequence === correction.sequence);
    
    if (bufferedState) {
      // Roll back to corrected state
      console.log(`[Network] Applying correction for sequence ${correction.sequence}`);
      
      // Emit correction event for game to handle
      if (this.onMessage) {
        this.onMessage({
          type: 'state:correction',
          correction
        });
      }
    }
  }

  // ==================== PARTY/LOBBY SYSTEM ====================

  async createParty(name = 'My Party') {
    const result = await this._sendAndWait('party:create', { name }, 5000);
    
    if (result.success) {
      this.party = result.party;
      this.isPartyLeader = true;
      this.partyMembers = [this.playerId];
      
      return this.party;
    }
    
    throw new Error(result.error || 'Failed to create party');
  }

  async joinParty(partyCode) {
    const result = await this._sendAndWait('party:join', { partyCode }, 5000);
    
    if (result.success) {
      this.party = result.party;
      this.isPartyLeader = false;
      this.partyMembers = result.members || [this.playerId];
      
      return this.party;
    }
    
    throw new Error(result.error || 'Failed to join party');
  }

  leaveParty() {
    if (this.party) {
      this.send({ type: 'party:leave', partyId: this.party.id });
      this.party = null;
      this.isPartyLeader = false;
      this.partyMembers = [];
    }
  }

  invitePlayer(playerId) {
    this.send({
      type: 'party:invite',
      partyId: this.party?.id,
      targetPlayerId: playerId
    });
  }

  kickPlayer(playerId, reason = '') {
    if (!this.isPartyLeader) return;
    
    this.send({
      type: 'party:kick',
      partyId: this.party?.id,
      targetPlayerId: playerId,
      reason
    });
  }

  setPartyReadiness(ready) {
    this.send({
      type: 'party:readiness',
      partyId: this.party?.id,
      ready
    });
  }

  startMatch(mode, track, options = {}) {
    if (!this.isPartyLeader) return;
    
    this.send({
      type: 'match:start',
      partyId: this.party.id,
      mode,
      track,
      options
    });
  }

  // ==================== MATCHMAKING ====================

  async enterMatchmaking(preferences = {}) {
    this.matchmakingPreferences = preferences;
    this.matchmakingQueue = true;
    this.send({
      type: 'matchmaking:enter',
      preferences
    });
    
    // Poll for status updates
    this._pollMatchmakingStatus();
  }

  leaveMatchmaking() {
    this.matchmakingQueue = false;
    this.send({ type: 'matchmaking:leave' });
  }

  async _pollMatchmakingStatus() {
    if (!this.matchmakingQueue) return;
    
    const status = await this._sendAndWait('matchmaking:status', {}, 3000);
    
    if (status.found) {
      this.matchmakingQueue = false;
      return status.match;
    }
    
    this.queuePosition = status.position || 0;
    this.estimatedWaitTime = status.estimatedWait || 0;
    
    // Continue polling
    setTimeout(() => this._pollMatchmakingStatus(), 3000);
  }

  // ==================== CHAT SYSTEM ====================

  sendMessage(text, target = 'all') {
    this.send({
      type: 'chat:message',
      text,
      target,
      senderId: this.playerId,
      timestamp: performance.now()
    });
  }

  receiveChatMessage(message) {
    if (this.mutedPlayers.has(message.senderId)) return;
    
    this.chatMessages.push(message);
    
    // Keep last 100 messages
    if (this.chatMessages.length > 100) {
      this.chatMessages.shift();
    }
    
    // Emit chat event
    if (this.onMessage) {
      this.onMessage({ type: 'chat:received', message });
    }
  }

  mutePlayer(playerId) {
    this.mutedPlayers.add(playerId);
  }

  unmutePlayer(playerId) {
    this.mutedPlayers.delete(playerId);
  }

  // ==================== MMO PERSISTENT WORLD ====================

  enterLobbyWorld(worldId) {
    this.send({
      type: 'mmo:enterWorld',
      worldId
    });
  }

  leaveLobbyWorld() {
    this.send({ type: 'mmo:leaveWorld' });
  }

  requestNearbyEntities(radius = 100) {
    this.send({
      type: 'mmo:requestEntities',
      radius
    });
  }

  updatePlayerAppearance(appearance) {
    this.send({
      type: 'mmo:updateAppearance',
      appearance
    });
  }

  emote(emoteType) {
    this.send({
      type: 'mmo:emote',
      emoteType,
      timestamp: performance.now()
    });
  }

  // ==================== UTILITY METHODS ====================

  getLatency() { return this.latency; }
  isConnected() { return this.connected; }
  getPlayerId() { return this.playerId; }
  getPartyInfo() { return this.party ? { ...this.party, members: this.partyMembers, isLeader: this.isPartyLeader } : null; }
  getMatchmakingStatus() { return { inQueue: this.matchmakingQueue, position: this.queuePosition, estimatedWait: this.estimatedWaitTime }; }
  getStats() { return { ...this.stats, latency: this.latency, jitter: this.jitter, messagesInQueue: this.sendQueue.length }; }

  async _sendAndWait(type, payload, timeout = 5000) {
    this.send({ type, ...payload });
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Request timeout')), timeout);
      
      const handler = (message) => {
        if (message.type === type || message.type === 'error') {
          clearTimeout(timer);
          
          // Remove this one-time listener
          this.messageHandlers.delete(handler);
          
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message);
          }
        }
      };
      
      this.messageHandlers.set(type, handler);
    });
  }

  _handleDefaultMessage(message) {
    switch (message.type) {
      case 'pong':
        this._handlePong(message);
        break;
        
      case 'chat:message':
        this.receiveChatMessage(message);
        break;
        
      case 'party:update':
        this._handlePartyUpdate(message);
        break;
        
      case 'matchmaking:found':
        this.matchmakingQueue = false;
        break;
        
      case 'mmo:entityUpdate':
        if (message.entities) {
          Object.entries(message.entities).forEach(([id, data]) => {
            this._updateRemoteEntity(id, data, performance.now());
          });
        }
        break;
        
      case 'mmo:emote':
        // Handle player emote display
        if (this.onMessage) this.onMessage(message);
        break;
    }
  }

  _handlePong(message) {
    const now = performance.now();
    const rtt = now - message.timestamp;
    
    // Calculate latency
    this.pings.push(rtt);
    if (this.pings.length > 10) this.pings.shift();
    
    this.latency = Math.round(this.pings.reduce((a, b) => a + b, 0) / this.pings.length);
    
    // Calculate jitter (variation in latency)
    if (this.pings.length > 2) {
      const avg = this.pings.reduce((a, b) => a + b, 0) / this.pings.length;
      const variance = this.pings.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / this.pings.length;
      this.jitter = Math.round(Math.sqrt(variance));
    }
  }

  _handlePartyUpdate(message) {
    if (message.party) {
      this.party = message.party;
      this.partyMembers = message.members || [];
      this.isPartyLeader = message.leader === this.playerId;
    }
  }

  dispose() {
    this.disconnect();
    this.messageHandlers.clear();
    this.chatMessages = [];
    this.remoteEntities.clear();
  }
}

export default NetworkManager;
