/**
 * Store Model
 * Represents a store in the distributed inventory system
 */
class Store {
  constructor(id, name, location, syncInterval = 15) {
    this.id = id;
    this.name = name;
    this.location = location;
    this.syncInterval = syncInterval; // minutes
    this.lastSync = null;
    this.isOnline = true;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Mark store as online
   */
  setOnline() {
    this.isOnline = true;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Mark store as offline
   */
  setOffline() {
    this.isOnline = false;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Update last sync timestamp
   */
  updateLastSync() {
    this.lastSync = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Check if store needs sync
   * @returns {boolean}
   */
  needsSync() {
    if (!this.lastSync) return true;
    const lastSyncTime = new Date(this.lastSync);
    const now = new Date();
    const diffMinutes = (now - lastSyncTime) / (1000 * 60);
    return diffMinutes >= this.syncInterval;
  }

  /**
   * Get sync status
   * @returns {Object}
   */
  getSyncStatus() {
    const needsSync = this.needsSync();
    const lastSyncAgo = this.lastSync 
      ? Math.round((new Date() - new Date(this.lastSync)) / (1000 * 60))
      : null;
    
    return {
      needsSync,
      lastSyncAgo,
      isOnline: this.isOnline,
      syncInterval: this.syncInterval
    };
  }

  /**
   * Convert to JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      location: this.location,
      syncInterval: this.syncInterval,
      lastSync: this.lastSync,
      isOnline: this.isOnline,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      syncStatus: this.getSyncStatus()
    };
  }

  /**
   * Create from JSON data
   * @param {Object} data - JSON data
   * @returns {Store}
   */
  static fromJSON(data) {
    const store = new Store(data.id, data.name, data.location, data.syncInterval);
    store.lastSync = data.lastSync;
    store.isOnline = data.isOnline;
    store.createdAt = data.createdAt;
    store.updatedAt = data.updatedAt;
    return store;
  }

  /**
   * Validate store data
   * @param {Object} data - Store data to validate
   * @returns {Object} - Validation result
   */
  static validate(data) {
    const errors = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Store ID is required and must be a string');
    }
    
    if (!data.name || typeof data.name !== 'string') {
      errors.push('Store name is required and must be a string');
    }
    
    if (!data.location || typeof data.location !== 'string') {
      errors.push('Store location is required and must be a string');
    }
    
    if (typeof data.syncInterval !== 'number' || data.syncInterval < 1) {
      errors.push('Sync interval must be a positive number (minutes)');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = Store;
