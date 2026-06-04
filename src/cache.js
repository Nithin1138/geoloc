/**
 * Cache Module — In-memory LRU Cache for IP Geolocation
 * Production-grade caching with TTL and memory limits
 * 
 * For distributed caching (multiple instances), upgrade to Redis
 */

class LRUCache {
  constructor(maxSize = 10000, ttlMs = 3600000) { // 1 hour default
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0
    };
  }

  set(key, value) {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    // Store with expiration timestamp
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
    this.stats.sets++;
  }

  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);
    this.stats.hits++;
    return item.value;
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses === 0 
      ? 0 
      : ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(2);
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

// Singleton instances
const ipCacheInstance = new LRUCache(10000, 3600000); // 10K IPs, 1 hour TTL
const keysCacheInstance = new LRUCache(5000, 300000); // 5K keys, 5 min TTL

module.exports = {
  ipCache: ipCacheInstance,
  keysCache: keysCacheInstance,
  LRUCache
};
