// CloudSaveSystem.js - Cross-device cloud save synchronization
// Features: account-linked storage, auto-sync, conflict resolution,
// save slots, export/import codes, offline queue, backup snapshots

import { EventBus } from './EventBus.js';

// Sync status states
const SyncStatus = {
  SYNCED: 'synced',
  PENDING: 'pending',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
  OFFLINE: 'offline',
  ERROR: 'error'
};

// Conflict resolution strategies
const ConflictStrategy = {
  LAST_WRITE_WINS: 'lastWriteWins',
  MERGE: 'merge',
  MANUAL: 'manual'
};

// Default configuration
const DEFAULT_CONFIG = {
  syncInterval: 5 * 60 * 1000,      // 5 minutes idle sync
  autoSyncOnRaceComplete: true,
  autoSyncOnSettingsChange: true,
  maxSaveSlots: 3,
  backupInterval: 7 * 24 * 60 * 60 * 1000, // Weekly backups
  maxBackups: 4,
  conflictStrategy: ConflictStrategy.LAST_WRITE_WINS,
  apiBaseUrl: '/api/saves'          // Server endpoint prefix
};

class CloudSaveSystem {
  constructor(config = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    
    // State
    this._status = SyncStatus.OFFLINE;
    this._authToken = null;
    this._userId = null;
    
    // Save slots (local cache)
    this._slots = new Map(); // slotId -> { data, version, timestamp, synced }
    this._activeSlot = 0;
    
    // Offline queue for pending changes
    this._offlineQueue = [];
    
    // Backup snapshots
    this._backups = [];
    
    // Timers
    this._syncTimer = null;
    this._backupTimer = null;
    
    // Local save system reference
    this._localSave = null;
    
    // Callbacks
    this._callbacks = {
      onStatusChange: null,
      onSyncComplete: null,
      onConflict: null,
      onError: null
    };
    
    // Bind event listeners
    this._setupEventListeners();
  }

  /**
   * Initialize cloud save with authentication token
   * @param {string} authToken - JWT or session token
   * @param {object} [userData] - User info { id, name }
   * @returns {Promise<boolean>} Success status
   */
  async init(authToken, userData = null) {
    if (!authToken) {
      console.warn('[CloudSave] No auth token provided - cloud features disabled');
      this._setStatus(SyncStatus.OFFLINE);
      return false;
    }

    this._authToken = authToken;
    this._userId = userData?.id || null;

    // Get reference to local save system
    this._localSave = window.__engine?.save || window.saveSystem;
    
    try {
      // Load slots from server
      await this._loadSlotsFromServer();
      
      // Start periodic sync
      this._startPeriodicSync();
      
      // Start backup schedule
      this._startBackupSchedule();
      
      // Setup visibility change listener for app close/blur
      document.addEventListener('visibilitychange', this._handleVisibilityChange);
      window.addEventListener('beforeunload', this._handleBeforeUnload);
      
      this._setStatus(SyncStatus.SYNCED);
      console.log('[CloudSave] Initialized successfully');
      return true;
      
    } catch (error) {
      console.error('[CloudSave] Init failed:', error);
      this._setStatus(SyncStatus.ERROR);
      return false;
    }
  }

  /**
   * Manually trigger a sync with cloud
   * @param {number} [slotIndex] - Specific slot to sync, or active slot
   * @returns {Promise<object>} Sync result
   */
  async sync(slotIndex = this._activeSlot) {
    if (!this._authToken) {
      return { success: false, error: 'Not authenticated' };
    }

    this._setStatus(SyncStatus.SYNCING);

    try {
      const localData = this._getLocalData();
      const slotData = this._slots.get(slotIndex);
      
      // Determine if we need to push or pull
      const result = await this._performSync(slotIndex, localData, slotData);
      
      if (result.success) {
        this._setStatus(SyncStatus.SYNCED);
        this._callbacks.onSyncComplete?.(result);
        EventBus.emit('cloud:syncComplete', result);
      } else if (result.conflict) {
        this._setStatus(SyncStatus.CONFLICT);
        this._handleConflict(result);
      }
      
      return result;
      
    } catch (error) {
      console.error('[CloudSave] Sync failed:', error);
      this._setStatus(SyncStatus.ERROR);
      this._callbacks.onError?.('Sync failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save data to specific slot
   * @param {object} data - Save data object
   * @param {number} [slotIndex] - Target slot (default: active)
   * @returns {Promise<object>} Save result
   */
  async saveToSlot(data, slotIndex = this._activeSlot) {
    const slot = {
      data,
      version: Date.now(),
      timestamp: new Date().toISOString(),
      synced: false
    };
    
    this._slots.set(slotIndex, slot);
    
    // Queue for sync
    this._queueOfflineChange({ type: 'save', slotIndex, data });
    
    // Auto-sync if enabled
    if (this._config.autoSyncOnSettingsChange) {
      return this.sync(slotIndex);
    }
    
    this._setStatus(SyncStatus.PENDING);
    return { success: true, slotIndex };
  }

  /**
   * Load data from specific slot
   * @param {number} [slotIndex] - Source slot (default: active)
   * @returns {object|null} Slot data or null
   */
  loadFromSlot(slotIndex = this._activeSlot) {
    const slot = this._slots.get(slotIndex);
    return slot?.data || null;
  }

  /**
   * Switch active save slot
   * @param {number} slotIndex - New active slot index
   * @returns {boolean} Success
   */
  switchSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this._config.maxSaveSlots) {
      console.warn('[CloudSave] Invalid slot index');
      return false;
    }
    
    this._activeSlot = slotIndex;
    EventBus.emit('cloud:slotChanged', { slotIndex });
    return true;
  }

  /**
   * Get all slot metadata (without full data)
   * @returns {Array} Slot info array
   */
  getSlotsInfo() {
    const slots = [];
    for (let i = 0; i < this._config.maxSaveSlots; i++) {
      const slot = this._slots.get(i);
      slots.push({
        index: i,
        isActive: i === this._activeSlot,
        hasData: !!slot,
        timestamp: slot?.timestamp || null,
        synced: slot?.synced || false,
        preview: slot?.data ? this._createPreview(slot.data) : null
      });
    }
    return slots;
  }

  /**
   * Export current slot as shareable code
   * @param {number} [slotIndex] - Slot to export
   * @returns {string} Base64 encoded save code
   */
  exportSaveCode(slotIndex = this._activeSlot) {
    const slot = this._slots.get(slotIndex);
    if (!slot?.data) {
      throw new Error('No data in slot to export');
    }

    const exportData = {
      v: 1,
      ts: slot.timestamp,
      data: slot.data,
      game: 'wzk5',
      source: 'cloud-export'
    };

    return btoa(JSON.stringify(exportData));
  }

  /**
   * Import save from exported code
   * @param {string} code - Base64 encoded save code
   * @param {number} [targetSlot] - Target slot (default: active)
   * @returns {Promise<object>} Import result
   */
  async importSaveCode(code, targetSlot = this._activeSlot) {
    try {
      const rawData = atob(code);
      const importData = JSON.parse(rawData);
      
      if (importData.v !== 1 || importData.game !== 'wzk5') {
        throw new Error('Invalid save code format');
      }

      // Validate and migrate data if needed
      const validatedData = this._validateImportData(importData.data);
      
      // Save to slot
      return await this.saveToSlot(validatedData, targetSlot);
      
    } catch (error) {
      console.error('[CloudSave] Import failed:', error);
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  /**
   * Create a manual backup snapshot
   * @returns {object} Backup info
   */
  createBackup() {
    const backup = {
      id: `backup_${Date.now()}`,
      timestamp: new Date().toISOString(),
      slots: Array.from(this._slots.entries()).map(([idx, slot]) => ({
        index: idx,
        data: slot ? { ...slot.data } : null,
        version: slot?.version
      }))
    };

    this._backups.push(backup);
    
    // Trim old backups
    while (this._backups.length > this._config.maxBackups) {
      this._backups.shift();
    }

    // Persist backups locally
    this._persistBackups();

    EventBus.emit('cloud:backupCreated', backup);
    return backup;
  }

  /**
   * Restore from a backup
   * @param {string} backupId - Backup ID to restore
   * @returns {Promise<boolean>} Success
   */
  async restoreBackup(backupId) {
    const backup = this._backups.find(b => b.id === backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }

    // Restore each slot
    for (const slotData of backup.slots) {
      if (slotData.data) {
        await this.saveToSlot(slotData.data, slotData.index);
      }
    }

    EventBus.emit('cloud:backupRestored', backup);
    return true;
  }

  /**
   * Get all available backups
   * @returns {Array} Backup list
   */
  getBackups() {
    return [...this._backups];
  }

  /**
   * Get current sync status
   * @returns {string} Status string
   */
  getStatus() {
    return this._status;
  }

  /**
   * Set callback for events
   * @param {string} event - Event name
   * @param {function} callback 
   */
  on(event, callback) {
    if (this._callbacks.hasOwnProperty(event)) {
      this._callbacks[event] = callback;
    }
  }

  /**
   * Clean up resources and stop syncing
   */
  dispose() {
    this._stopPeriodicSync();
    this._stopBackupSchedule();
    
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    window.removeEventListener('beforeunload', this._handleBeforeUnload);
    
    this._status = SyncStatus.OFFLINE;
    this._authToken = null;
  }

  // ==================== PRIVATE METHODS ====================

  async _loadSlotsFromServer() {
    try {
      const response = await fetch(`${this._config.apiBaseUrl}/slots`, {
        headers: { 'Authorization': `Bearer ${this._authToken}` }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const { slots } = await response.json();

      // Cache slots locally
      this._slots.clear();
      for (const slot of slots || []) {
        this._slots.set(slot.index, {
          data: slot.data,
          version: slot.version,
          timestamp: slot.timestamp,
          synced: true
        });
      }

      // Load backups from local storage
      this._loadBackups();

    } catch (error) {
      // If server unavailable, work offline with local data
      console.warn('[CloudSave] Could not load from server, using local data');
      this._loadLocalFallback();
    }
  }

  async _performSync(slotIndex, localData, remoteSlot) {
    const endpoint = `${this._config.apiBaseUrl}/slots/${slotIndex}`;
    
    // Prepare payload
    const payload = {
      data: localData,
      clientVersion: Date.now(),
      lastKnownVersion: remoteSlot?.version || null
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._authToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Sync HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.conflict) {
      // Handle conflict based on strategy
      return this._resolveConflict(result, localData, remoteSlot);
    }

    // Update local cache
    if (result.data) {
      this._slots.set(slotIndex, {
        data: result.data,
        version: result.version,
        timestamp: result.timestamp,
        synced: true
      });
    }

    return { success: true, slotIndex };
  }

  _resolveConflict(serverResult, localData, remoteSlot) {
    switch (this._config.conflictStrategy) {
      case ConflictStrategy.MERGE:
        return this._mergeResolve(serverResult, localData, remoteSlot);
        
      case ConflictStrategy.MANUAL:
        this._callbacks.onConflict?.(serverResult, localData, remoteSlot);
        return { success: false, conflict: true, needsManualResolution: true };
        
      case ConflictStrategy.LAST_WRITE_WINS:
      default:
        // Server wins by default (it has authoritative timestamp)
        if (serverResult.serverData) {
          this._slots.set(this._activeSlot, {
            data: serverResult.serverData,
            version: serverResult.version,
            timestamp: serverResult.timestamp,
            synced: true
          });
        }
        return { success: true, conflictResolved: true, usedServer: true };
    }
  }

  _mergeResolve(serverResult, localData, remoteSlot) {
    // Simple merge: combine non-conflicting keys
    const merged = { ...(remoteSlot?.data || {}), ...localData };
    
    // For conflicting keys, use newer value based on timestamps
    // This is simplified - real implementation would do key-level comparison
    
    return {
      success: true,
      conflictResolved: true,
      merged: true,
      data: merged
    };
  }

  _handleConflict(result) {
    console.warn('[CloudSave] Conflict detected');
    this._callbacks.onConflict?.(result);
    EventBus.emit('cloud:conflict', result);
  }

  _queueOfflineChange(change) {
    this._offlineQueue.push({
      ...change,
      queuedAt: Date.now()
    });
    
    // Persist queue
    try {
      localStorage.setItem('wzk5_offline_queue', JSON.stringify(this._offlineQueue));
    } catch (e) {
      console.warn('[CloudSave] Could not persist offline queue');
    }
    
    this._setStatus(SyncStatus.PENDING);
  }

  async _processOfflineQueue() {
    if (this._offlineQueue.length === 0) return;
    
    console.log(`[CloudSave] Processing ${this._offlineQueue.length} offline changes`);
    
    const queue = [...this._offlineQueue];
    this._offlineQueue = [];
    
    for (const change of queue) {
      try {
        if (change.type === 'save') {
          await this.saveToSlot(change.data, change.slotIndex);
        }
      } catch (error) {
        console.warn('[CloudSave] Failed to process offline change:', error);
        this._offlineQueue.push(change); // Re-queue
      }
    }
    
    localStorage.removeItem('wzk5_offline_queue');
  }

  _getLocalData() {
    if (this._localSave) {
      return this._localSave.get('') || {}; // Get all data
    }
    return {};
  }

  _createPreview(data) {
    // Create a lightweight preview of save data for UI display
    return {
      level: data.progression?.level || 1,
      credits: data.progression?.credits || 0,
      vehiclesUnlocked: data.unlocks?.vehicles?.length || 0,
      racesCompleted: data.progression?.racesCompleted || 0,
      lastPlayed: data.preferences?.lastTrack || 'Unknown'
    };
  }

  _validateImportData(data) {
    // Basic validation and migration
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }
    
    // Ensure required sections exist
    return {
      settings: data.settings || {},
      progression: data.progression || {},
      unlocks: data.unlocks || {},
      garage: data.garage || {},
      preferences: data.preferences || {}
    };
  }

  _setStatus(status) {
    const oldStatus = this._status;
    this._status = status;
    
    if (oldStatus !== status) {
      this._callbacks.onStatusChange?.(status, oldStatus);
      EventBus.emit('cloud:statusChange', { status, oldStatus });
    }
  }

  _startPeriodicSync() {
    this._stopPeriodicSync();
    
    this._syncTimer = setInterval(async () => {
      if (document.visibilityState === 'visible') {
        await this.sync();
      }
    }, this._config.syncInterval);
  }

  _stopPeriodicSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }

  _startBackupSchedule() {
    this._stopBackupSchedule();
    
    this._backupTimer = setInterval(() => {
      this.createBackup();
    }, this._config.backupInterval);
  }

  _stopBackupSchedule() {
    if (this._backupTimer) {
      clearInterval(this._backupTimer);
      this._backupTimer = null;
    }
  }

  _persistBackups() {
    try {
      localStorage.setItem('wzk5_backups', JSON.stringify(this._backups));
    } catch (e) {
      console.warn('[CloudSave] Could not persist backups');
    }
  }

  _loadBackups() {
    try {
      const stored = localStorage.getItem('wzk5_backups');
      if (stored) {
        this._backups = JSON.parse(stored);
      }
    } catch (e) {
      this._backups = [];
    }
  }

  _loadLocalFallback() {
    // Initialize empty slots when offline
    for (let i = 0; i < this._config.maxSaveSlots; i++) {
      if (!this._slots.has(i)) {
        const localData = this._getLocalData();
        if (Object.keys(localData).length > 0 && i === 0) {
          this._slots.set(i, {
            data: localData,
            version: Date.now(),
            timestamp: new Date().toISOString(),
            synced: false
          });
        }
      }
    }
  }

  _setupEventListeners() {
    this._handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // App going to background - sync now
        await this.sync();
      } else if (document.visibilityState === 'visible') {
        // App coming back - process any offline queue
        await this._processOfflineQueue();
        await this.sync();
      }
    };

    this._handleBeforeUnload = () => {
      // Quick sync before page closes (use sendBeacon for reliability)
      if (navigator.sendBeacon && this._authToken) {
        const data = this._getLocalData();
        const blob = new Blob([JSON.stringify({ data })], { type: 'application/json' });
        navigator.sendBeacon(`${this._config.apiBaseUrl}/quick-save`, blob);
      }
    };

    // Listen for race completion
    EventBus.on('mode:circuit:raceEnd', async () => {
      if (this._config.autoSyncOnRaceComplete) {
        await this.sync();
      }
    });

    // Listen for settings changes
    EventBus.on('save:changed', async () => {
      if (this._config.autoSyncOnSettingsChange) {
        this._setStatus(SyncStatus.PENDING);
      }
    });
  }
}

// Export singleton and class
export const cloudSaveSystem = new CloudSaveSystem();
export default cloudSaveSystem;
export { SyncStatus, ConflictStrategy };
