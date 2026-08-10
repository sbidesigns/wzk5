// core/VoiceChat.js
// WebRTC voice communication system.
// Features push-to-talk, voice activation, spatial audio,
// per-player controls, and noise suppression.

import { EventBus } from './EventBus.js';

/**
 * Voice chat mode enumeration
 * @enum {string}
 */
const VoiceChatMode = {
  TEAM_ONLY: 'team_only',       // Team relay mode only
  NEARBY: 'nearby',             // Proximity-based (20m radius)
  ALL: 'all'                    // Global lobby chat
};

/**
 * @typedef {Object} VoiceParticipant
 * @property {string} id - Player unique ID
 * @property {string} name - Display name
 * @property {RTCPeerConnection|null} peerConnection - WebRTC connection
 * @property {MediaStream|null} remoteStream - Incoming audio stream
 * @property {boolean} muted - Whether we've muted this player
 * @property {number} volume - Individual volume (0-1)
 * @property {boolean} blocked - Blocked (muted + hidden from UI)
 * @property {HTMLAudioElement|null} audioElement - Audio playback element
 * @property {boolean} speaking - Currently speaking indicator
 * @property {THREE.Vector3|null} position - Position for spatial audio
 */

/**
 * @typedef {Object} VoiceChatConfig
 * @property {VoiceChatMode} mode - Current chat mode
 * @property {boolean} pushToTalk - Use PTT instead of voice activation
 * @property {string} pttKey - Keybind for PTT
 * @property {number} activationThreshold - Voice activation threshold (0-1)
 * @property {number} proximityRange - Range for nearby chat in meters
 * @property {number} maxRange - Maximum audible range in meters
 * @property {boolean} noiseSuppression - Enable basic noise suppression
 */

class VoiceChat {
  constructor() {
    /** @type {VoiceChatConfig} */
    this._config = {
      mode: VoiceChatMode.TEAM_ONLY,
      pushToTalk: true,
      pttKey: 'KeyV',
      activationThreshold: 0.02,
      proximityRange: 20,
      maxRange: 50,
      noiseSuppression: true
    };

    /** @type {Map<string, VoiceParticipant>} */
    this._participants = new Map();

    // Local microphone state
    this._localStream = null;
    this._audioContext = null;
    this._analyser = null;
    this._microphoneGain = null;
    this._noiseFilter = null;
    this._isMuted = false;
    this._isSpeaking = false;
    this._pttPressed = false;

    // Input level tracking
    this._inputLevel = 0; // 0-1 current input level
    this._inputHistory = []; // For smoothing

    // WebRTC configuration
    this._rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    // Connection state
    this._connected = false;
    this._roomId = null;
    this._signalingChannel = null;

    // Speaking detection interval
    this._speakingCheckInterval = null;
    this._lastSpeakTime = 0;

    // Feature detection
    this._supported = this._checkSupport();

    console.log(`[VoiceChat] Initialized, supported: ${this._supported}`);
  }

  /**
   * Check browser support for required features
   * @private
   * @returns {boolean}
   */
  _checkSupport() {
    const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasRTCPeerConnection = !!window.RTCPeerConnection;
    const hasAudioContext = !!(window.AudioContext || window.webkitAudioContext);
    
    return hasGetUserMedia && hasRTCPeerConnection && hasAudioContext;
  }

  /**
   * Check if voice chat is supported
   * @returns {boolean}
   */
  isSupported() {
    return this._supported;
  }

  /**
   * Initialize and request microphone permission
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    if (!this._supported) {
      console.error('[VoiceChat] Not supported in this browser');
      EventBus.emit('voicechat:error', { error: 'NOT_SUPPORTED' });
      return false;
    }

    try {
      // Request microphone access
      this._localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: this._config.noiseSuppression,
          autoGainControl: true,
          sampleRate: 48000
        },
        video: false
      });

      // Set up audio processing
      await this._setupAudioProcessing();

      this._connected = true;
      console.log('[VoiceChat] Microphone initialized');
      EventBus.emit('voicechat:initialized');
      
      // Start speaking detection
      this._startSpeakingDetection();
      
      return true;
    } catch (e) {
      console.error('[VoiceChat] Failed to initialize microphone:', e);
      EventBus.emit('voicechat:error', { 
        error: e.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'MIC_ERROR',
        details: e.message
      });
      return false;
    }
  }

  /**
   * Set up audio context for processing
   * @private
   */
  async _setupAudioProcessing() {
    this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000
    });

    const source = this._audioContext.createMediaStreamSource(this._localStream);

    // Gain node for volume control
    this._microphoneGain = this._audioContext.createGain();
    this._microphoneGain.gain.value = 1.0;

    // High-pass filter for noise suppression (basic rumble removal)
    if (this._config.noiseSuppression) {
      this._noiseFilter = this._audioContext.createBiquadFilter();
      this._noiseFilter.type = 'highpass';
      this._noiseFilter.frequency.value = 80; // Remove low frequency rumble
      source.connect(this._noiseFilter);
      this._noiseFilter.connect(this._microphoneGain);
    } else {
      source.connect(this._microphoneGain);
    }

    // Analyser for input level metering
    this._analyser = this._audioContext.createAnalyser();
    this._analyser.fftSize = 256;
    this._analyser.smoothingTimeConstant = 0.3;
    this._microphoneGain.connect(this._analyser);

    // Connect to destination for monitoring (optional, can be disconnected)
    // this._analyser.connect(this._audioContext.destination);
  }

  /**
   * Start periodic speaking detection
   * @private
   */
  _startSpeakingDetection() {
    if (this._speakingCheckInterval) {
      clearInterval(this._speakingCheckInterval);
    }

    this._speakingCheckInterval = setInterval(() => {
      this._updateInputLevel();
      this._checkSpeakingState();
    }, 50); // 20 times per second
  }

  /**
   * Update input level from analyser
   * @private
   */
  _updateInputLevel() {
    if (!this._analyser || this._isMuted) {
      this._inputLevel = 0;
      return;
    }

    const dataArray = new Float32Array(this._analyser.frequencyBinCount);
    this._analyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS (root mean square) for volume
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // Smooth the value
    this._inputHistory.push(rms);
    if (this._inputHistory.length > 5) {
      this._inputHistory.shift();
    }
    
    this._inputLevel = this._inputHistory.reduce((a, b) => a + b, 0) / this._inputHistory.length;
  }

  /**
   * Check and update speaking state
   * @private
   */
  _checkSpeakingState() {
    const wasSpeaking = this._isSpeaking;
    
    if (this._config.pushToTalk) {
      this._isSpeaking = this._pttPressed && !this._isMuted && this._inputLevel > 0.001;
    } else {
      // Voice activation
      const aboveThreshold = this._inputLevel > this._config.activationThreshold;
      
      if (aboveThreshold) {
        this._lastSpeakTime = Date.now();
        this._isSpeaking = true;
      } else if (Date.now() - this._lastSpeakTime > 200) {
        // Small delay to prevent choppy on/off
        this._isSpeaking = false;
      }
    }

    // Emit event on state change
    if (wasSpeaking !== this._isSpeaking) {
      EventBus.emit('voicechat:speakingStateChanged', { speaking: this._isSpeaking });
    }
  }

  /**
   * Join a voice room
   * @param {string} roomId - Room identifier
   * @param {Object} signaling - Signaling channel for WebRTC negotiation
   */
  async joinRoom(roomId, signaling) {
    if (!this._connected) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    this._roomId = roomId;
    this._signalingChannel = signaling;

    // Set up signaling handlers
    if (signaling) {
      signaling.onOffer = (fromId, offer) => this._handleOffer(fromId, offer);
      signaling.onAnswer = (fromId, answer) => this._handleAnswer(fromId, answer);
      signaling.onIceCandidate = (fromId, candidate) => this._handleIceCandidate(fromId, candidate);
      signaling.onParticipantJoin = (participant) => this._addParticipant(participant);
      signaling.onParticipantLeave = (participantId) => this._removeParticipant(participantId);
    }

    console.log(`[VoiceChat] Joined room: ${roomId}`);
    EventBus.emit('voicechat:roomJoined', { roomId });
    return true;
  }

  /**
   * Leave current room and clean up
   */
  leaveRoom() {
    // Close all peer connections
    for (const [id, participant] of this._participants) {
      this._closePeerConnection(id);
    }
    this._participants.clear();

    this._roomId = null;
    this._signalingChannel = null;

    console.log('[VoiceChat] Left room');
    EventBus.emit('voicechat:roomLeft');
  }

  /**
   * Add a participant and create peer connection
   * @private
   * @param {Object} participantData - Participant info
   */
  async _addParticipant(participantData) {
    if (this._participants.has(participantData.id)) return;

    const participant = {
      id: participantData.id,
      name: participantData.name,
      peerConnection: null,
      remoteStream: null,
      muted: false,
      volume: 1.0,
      blocked: false,
      audioElement: null,
      speaking: false,
      position: null
    };

    // Create WebRTC peer connection
    try {
      participant.peerConnection = new RTCPeerConnection(this._rtcConfig);

      // Add local stream
      if (this._localStream) {
        this._localStream.getTracks().forEach(track => {
          participant.peerConnection.addTrack(track, this._localStream);
        });
      }

      // Handle incoming stream
      participant.peerConnection.ontrack = (event) => {
        this._handleRemoteStream(participant.id, event.streams[0]);
      };

      // Handle ICE candidates
      participant.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this._signalingChannel) {
          this._signalingChannel.sendIceCandidate(participant.id, event.candidate);
        }
      };

      // Create and send offer (if initiator)
      const offer = await participant.peerConnection.createOffer();
      await participant.peerConnection.setLocalDescription(offer);

      if (this._signalingChannel) {
        this._signalingChannel.sendOffer(participant.id, offer);
      }

    } catch (e) {
      console.error(`[VoiceChat] Failed to create connection for ${participantData.id}:`, e);
    }

    this._participants.set(participantData.id, participant);
    console.log(`[VoiceChat] Added participant: ${participantData.name}`);
    EventBus.emit('voicechat:participantAdded', { id: participantData.id, name: participantData.name });
  }

  /**
   * Remove a participant
   * @private
   * @param {string} participantId - ID to remove
   */
  _removeParticipant(participantId) {
    this._closePeerConnection(participantId);
    this._participants.delete(participantId);
    console.log(`[VoiceChat] Removed participant: ${participantId}`);
    EventBus.emit('voicechat:participantRemoved', { id: participantId });
  }

  /**
   * Close peer connection cleanly
   * @private
   * @param {string} participantId - ID to close
   */
  _closePeerConnection(participantId) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    if (participant.audioElement) {
      participant.audioElement.pause();
      participant.audioElement.srcObject = null;
      participant.audioElement = null;
    }

    if (participant.peerConnection) {
      participant.peerConnection.close();
      participant.peerConnection = null;
    }
  }

  /**
   * Handle incoming WebRTC offer
   * @private
   */
  async _handleOffer(fromId, offer) {
    let participant = this._participants.get(fromId);
    
    if (!participant) {
      // Create participant for incoming connection
      await this._addParticipant({ id: fromId, name: `Player_${fromId.slice(0, 6)}` });
      participant = this._participants.get(fromId);
    }

    if (!participant?.peerConnection) return;

    try {
      await participant.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await participant.peerConnection.createAnswer();
      await participant.peerConnection.setLocalDescription(answer);

      if (this._signalingChannel) {
        this._signalingChannel.sendAnswer(fromId, answer);
      }
    } catch (e) {
      console.error('[VoiceChat] Error handling offer:', e);
    }
  }

  /**
   * Handle incoming WebRTC answer
   * @private
   */
  async _handleAnswer(fromId, answer) {
    const participant = this._participants.get(fromId);
    if (!participant?.peerConnection) return;

    try {
      await participant.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      console.error('[VoiceChat] Error handling answer:', e);
    }
  }

  /**
   * Handle incoming ICE candidate
   * @private
   */
  async _handleIceCandidate(fromId, candidate) {
    const participant = this._participants.get(fromId);
    if (!participant?.peerConnection) return;

    try {
      await participant.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('[VoiceChat] Error adding ICE candidate:', e);
    }
  }

  /**
   * Handle received remote audio stream
   * @private
   * @param {string} participantId - Source participant
   * @param {MediaStream} stream - Audio stream
   */
  _handleRemoteStream(participantId, stream) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    participant.remoteStream = stream;

    // Create audio element for playback with spatial control
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.volume = participant.volume;
    
    participant.audioElement = audio;
    console.log(`[VoiceChat] Received audio from ${participantId}`);
  }

  // ==================== CONTROLS ====================

  /**
   * Mute/unmute local microphone
   * @param {boolean} [force] - Force mute state
   */
  toggleMute(force) {
    this._isMuted = force !== undefined ? force : !this._isMuted;
    
    if (this._microphoneGain) {
      this._microphoneGain.gain.value = this._isMuted ? 0 : 1.0;
    }

    console.log(`[VoiceChat] Local mic ${this._isMuted ? 'muted' : 'unmuted'}`);
    EventBus.emit('voicechat:muteChanged', { muted: this._isMuted });
  }

  /**
   * Check if local mic is muted
   * @returns {boolean}
   */
  isMuted() {
    return this._isMuted;
  }

  /**
   * Handle push-to-talk key press
   * @param {boolean} pressed - Whether key is pressed
   */
  setPTTState(pressed) {
    this._pttPressed = pressed;
  }

  /**
   * Mute a specific participant
   * @param {string} participantId - Player to mute
   * @param {boolean} [force] - Force state
   */
  muteParticipant(participantId, force) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    participant.muted = force !== undefined ? force : !participant.muted;
    
    if (participant.audioElement) {
      participant.audioElement.volume = participant.muted ? 0 : participant.volume;
    }

    EventBus.emit('voicechat:participantMuteChanged', { 
      id: participantId, 
      muted: participant.muted 
    });
  }

  /**
   * Set individual participant volume
   * @param {string} participantId - Player ID
   * @param {number} volume - Volume level (0-1)
   */
  setParticipantVolume(participantId, volume) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    participant.volume = Math.max(0, Math.min(1, volume));
    
    if (participant.audioElement && !participant.muted) {
      participant.audioElement.volume = participant.volume;
    }
  }

  /**
   * Block a participant (mute + hide)
   * @param {string} participantId - Player to block
   * @param {boolean} [force] - Force state
   */
  blockParticipant(participantId, force) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    participant.blocked = force !== undefined ? force : !participant.blocked;
    this.muteParticipant(participantId, participant.blocked);

    EventBus.emit('voicechat:participantBlockChanged', { 
      id: participantId, 
      blocked: participant.blocked 
    });
  }

  /**
   * Set voice chat mode
   * @param {VoiceChatMode} mode - Desired mode
   */
  setMode(mode) {
    if (!Object.values(VoiceChatMode).includes(mode)) {
      console.warn(`[VoiceChat] Invalid mode: ${mode}`);
      return;
    }
    
    this._config.mode = mode;
    console.log(`[VoiceChat] Mode set to ${mode}`);
    EventBus.emit('voicechat:modeChanged', { mode });
  }

  /**
   * Get current mode
   * @returns {VoiceChatMode}
   */
  getMode() {
    return this._config.mode;
  }

  /**
   * Enable/disable push-to-talk
   * @param {boolean} enabled - Use PTT
   */
  setPushToTalk(enabled) {
    this._config.pushToTalk = enabled;
    EventBus.emit('voicechat:pttChanged', { enabled });
  }

  /**
   * Set PTT keybind
   * @param {string} key - KeyboardEvent code
   */
  setPTTKey(key) {
    this._config.pttKey = key;
  }

  /**
   * Set voice activation threshold
   * @param {number} threshold - Threshold (0-1)
   */
  setActivationThreshold(threshold) {
    this._config.activationThreshold = Math.max(0.001, Math.min(0.2, threshold));
  }

  // ==================== SPATIAL AUDIO ====================

  /**
   * Update participant position for spatial audio
   * @param {string} participantId - Player ID
   * @param {THREE.Vector3|{x, y, z}} position - World position
   */
  setParticipantPosition(participantId, position) {
    const participant = this._participants.get(participantId);
    if (!participant) return;

    participant.position = position instanceof Object && 'x' in position 
      ? position 
      : { x: 0, y: 0, z: 0 };

    this._updateSpatialAudio(participantId);
  }

  /**
   * Update local player position (for spatial calculations)
   * @param {THREE.Vector3|{x, y, z}} position - Our position
   */
  setLocalPosition(position) {
    this._localPosition = position instanceof Object && 'x' in position 
      ? position 
      : { x: 0, y: 0, z: 0 };

    // Update all participants' spatial audio
    for (const [id] of this._participants) {
      this._updateSpatialAudio(id);
    }
  }

  /**
   * Apply spatial audio effects based on positions
   * @private
   * @param {string} participantId - Target participant
   */
  _updateSpatialAudio(participantId) {
    const participant = this._participants.get(participantId);
    if (!participant?.audioElement || !participant.position || !this._localPosition) return;

    // Calculate distance
    const dx = participant.position.x - this._localPosition.x;
    const dy = participant.position.y - this._localPosition.y;
    const dz = participant.position.z - this._localPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check mode restrictions
    if (this._config.mode === VoiceChatMode.NEARBY) {
      if (distance > this._config.proximityRange) {
        participant.audioElement.volume = 0;
        return;
      }
    }

    // Mute beyond max range
    if (distance > this._config.maxRange) {
      participant.audioElement.volume = 0;
      return;
    }

    // Distance attenuation (inverse square law approximation)
    const maxDist = this._config.mode === VoiceChatMode.NEARBY 
      ? this._config.proximityRange 
      : this._config.maxRange;
    
    const attenuation = Math.max(0, 1 - (distance / maxDist));
    const baseVolume = participant.blocked ? 0 : participant.volume;
    
    participant.audioElement.volume = baseVolume * attenuation * attenuation;

    // Stereo panning based on horizontal position
    // Note: Full stereo requires StereoPannerNode or similar
    if (distance > 0.1) {
      const pan = Math.max(-1, Math.min(1, dx / maxDist));
      // Would apply pan here if using Web Audio API for output
    }
  }

  // ==================== STATE QUERIES ====================

  /**
   * Get current input level (for UI meter)
   * @returns {number} Level 0-1
   */
  getInputLevel() {
    return this._inputLevel;
  }

  /**
   * Check if currently speaking
   * @returns {boolean}
   */
  isSpeaking() {
    return this._isSpeaking;
  }

  /**
   * Get list of participants with their states
   * @returns {Array<Object>}
   */
  getParticipants() {
    const result = [];
    for (const [id, participant] of this._participants) {
      result.push({
        id: participant.id,
        name: participant.name,
        muted: participant.muted,
        volume: participant.volume,
        blocked: participant.blocked,
        speaking: participant.speaking,
        connected: participant.peerConnection?.connectionState === 'connected'
      });
    }
    return result;
  }

  /**
   * Get participant who is currently speaking
   * @returns {Array<string>} Array of speaking participant IDs
   */
  getSpeakingParticipants() {
    const speaking = [];
    for (const [id, participant] of this._participants) {
      if (participant.speaking && !participant.muted && !participant.blocked) {
        speaking.push(id);
      }
    }
    return speaking;
  }

  /**
   * Check if connected to a room
   * @returns {boolean}
   */
  isConnected() {
    return this._connected && !!this._roomId;
  }

  /**
   * Get current config
   * @returns {VoiceChatConfig}
   */
  getConfig() {
    return { ...this._config };
  }

  // ==================== CLEANUP ====================

  /**
   * Clean up all resources
   */
  destroy() {
    // Stop speaking detection
    if (this._speakingCheckInterval) {
      clearInterval(this._speakingCheckInterval);
      this._speakingCheckInterval = null;
    }

    // Leave room
    this.leaveRoom();

    // Stop local stream
    if (this._localStream) {
      this._localStream.getTracks().forEach(track => track.stop());
      this._localStream = null;
    }

    // Close audio context
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }

    this._connected = false;
    console.log('[VoiceChat] Destroyed');
    EventBus.emit('voicechat:destroyed');
  }

  /**
   * Get available modes
   * @returns {string[]}
   */
  static getModes() {
    return Object.values(VoiceChatMode);
  }
}

export const voiceChat = new VoiceChat();
export { VoiceChatMode };
export default voiceChat;
