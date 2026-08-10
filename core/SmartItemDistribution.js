// SmartItemDistribution.js - Fair item distribution based on race position
// Mario Kart-style weighted random item selection that helps players
// in lower positions catch up while giving leaders defensive items.

/**
 * Position-based item weight table.
 * Players in lower positions get more powerful offensive items,
 * while leaders get coins and defensive items.
 * 
 * Weights represent percentage chance (should sum to ~100 per row)
 */
const POSITION_WEIGHTS = {
  1:  { coin: 30, banana: 25, shield: 20, boost: 15, missile: 5,  triple: 5, star: 0 },
  2:  { coin: 20, banana: 20, shield: 25, boost: 20, missile: 10, triple: 5, star: 0 },
  3:  { coin: 15, banana: 15, shield: 20, boost: 25, missile: 15, triple: 8, star: 2 },
  4:  { coin: 10, banana: 10, shield: 15, boost: 28, missile: 18, triple: 5, star: 4 },
  5:  { coin: 10, banana: 10, shield: 15, boost: 25, missile: 23, triple: 13, star: 10 },
  6:  { coin: 5,  banana: 5,  shield: 10, boost: 20, missile: 28, triple: 22, star: 14 },
  7:  { coin: 5,  banana: 5,  shield: 5,  boost: 15, missile: 32, triple: 25, star: 18 },
  8:  { coin: 0,  banana: 0,  shield: 5,  boost: 10, missile: 40, triple: 32, star: 15 },
  9:  { coin: 0,  banana: 0,  shield: 0,  boost: 5,  missile: 45, triple: 35, star: 15 },
  10: { coin: 0,  banana: 0,  shield: 0,  boost: 5,  missile: 42, triple: 38, star: 17 },
  11: { coin: 0,  banana: 0,  shield: 0,  boost: 0,  missile: 38, triple: 42, star: 20 },
  12: { coin: 0,  banana: 0,  shield: 0,  boost: 0,  missile: 32, triple: 38, star: 30 }
};

/**
 * Item definitions with metadata for UI display
 */
const ITEM_DEFINITIONS = {
  coin: {
    id: 'coin',
    name: 'Coin',
    icon: '🪙',
    description: '+1 coin collected. Collect 8 for a small speed boost.',
    category: 'utility',
    power: 1,
    rarity: 'common'
  },
  banana: {
    id: 'banana',
    name: 'Banana Peel',
    icon: '🍌',
    description: 'Drop behind you to spin out anyone who hits it.',
    category: 'defensive',
    power: 2,
    rarity: 'common'
  },
  shield: {
    id: 'shield',
    name: 'Shield',
    icon: '🛡️',
    description: 'Protects from one attack. Also steals items on contact.',
    category: 'defensive',
    power: 3,
    rarity: 'uncommon'
  },
  boost: {
    id: 'boost',
    name: 'Nitro Boost',
    icon: '🚀',
    description: 'Temporary speed increase. Hold to steer while boosting.',
    category: 'offensive',
    power: 4,
    rarity: 'uncommon'
  },
  missile: {
    id: 'missile',
    name: 'Homing Missile',
    icon: '🎯',
    description: 'Locks onto the racer ahead of you. Hard to dodge!',
    category: 'offensive',
    power: 6,
    rarity: 'rare'
  },
  triple: {
    id: 'triple',
    name: 'Triple Items',
    icon: '3️⃣',
    description: 'Get 3 copies of a random item! Use them wisely.',
    category: 'power',
    power: 7,
    rarity: 'rare'
  },
  star: {
    id: 'star',
    name: 'Star Power',
    icon: '⭐',
    description: '8 seconds of invincibility + speed boost! Knock aside anyone you touch!',
    category: 'power',
    power: 8,
    rarity: 'legendary'
  }
};

/**
 * Mode-specific modifiers that adjust base weights
 */
const MODE_MODIFIERS = {
  circuit: {}, // Standard weights
  sprint: { // Sprint races favor offensive items slightly more
    boostMultiplier: 1.2,
    missileMultiplier: 1.1
  },
  drift: { // Drift mode - more boosts useful
    boostMultiplier: 1.4,
    coinMultiplier: 0.8
  },
  elimination: { // Elimination - very aggressive item distribution
    missileMultiplier: 1.3,
    tripleMultiplier: 1.2,
    shieldMultiplier: 1.2,
    coinMultiplier: 0.3
  },
  derby: { // Derby mode - all about offense
    missileMultiplier: 1.5,
    boostMultiplier: 1.3,
    coinMultiplier: 0
  },
  battleRoyale: { // Battle Royale - survival focused
    shieldMultiplier: 1.4,
    tripleMultiplier: 1.3,
    starMultiplier: 1.3,
    coinMultiplier: 0.2
  },
  teamRelay: { // Team relay - balanced but team-supportive
    shieldMultiplier: 1.3,
    boostMultiplier: 1.1
  },
  timeTrial: { // Time trial - only coins and boosts
    allowedItems: ['coin', 'boost']
  }
};

/**
 * Get a weighted random item based on race position
 * 
 * @param {number} position - Current race position (1st, 2nd, etc.)
 * @param {string[]} [availableItems] - Optional list of available item IDs (filters results)
 * @param {object} [options] - Additional options
 * @param {string} [options.mode] - Game mode ID for modifier application
 * @param {number} [options.lap] - Current lap number (later laps = slightly better items)
 * @param {boolean} [options.isLastLap] - If true, slightly increases power items
 * @returns {string} The selected item ID
 */
export function getItemForPosition(position, availableItems = null, options = {}) {
  // Clamp position to valid range
  const clampedPos = Math.max(1, Math.min(position, 12));
  
  // Get base weights for this position
  let weights = { ...POSITION_WEIGHTS[clampedPos] };
  
  // Apply mode modifiers if specified
  if (options.mode && MODE_MODIFIERS[options.mode]) {
    const mod = MODE_MODIFIERS[options.mode];
    
    // Check if mode restricts items
    if (mod.allowedItems) {
      availableItems = mod.allowedItems;
    }
    
    // Apply multipliers
    if (mod.coinMultiplier) weights.coin = Math.round((weights.coin || 0) * mod.coinMultiplier);
    if (mod.bananaMultiplier) weights.banana = Math.round((weights.banana || 0) * mod.bananaMultiplier);
    if (mod.shieldMultiplier) weights.shield = Math.round((weights.shield || 0) * mod.shieldMultiplier);
    if (mod.boostMultiplier) weights.boost = Math.round((weights.boost || 0) * mod.boostMultiplier);
    if (mod.missileMultiplier) weights.missile = Math.round((weights.missile || 0) * mod.missileMultiplier);
    if (mod.tripleMultiplier) weights.triple = Math.round((weights.triple || 0) * mod.tripleMultiplier);
  }
  
  // Last lap bonus - slight increase to power items
  if (options.isLastLap) {
    weights.missile = Math.round((weights.missile || 0) * 1.15);
    weights.triple = Math.round((weights.triple || 0) * 1.1);
    weights.boost = Math.round((weights.boost || 0) * 1.05);
  }
  
  // Late race bonus (lap 2+)
  if (options.lap && options.lap > 1) {
    const lapBonus = 1 + (options.lap - 1) * 0.05;
    weights.missile = Math.round((weights.missile || 0) * lapBonus);
    weights.shield = Math.round((weights.shield || 0) * lapBonus);
  }
  
  // Filter by available items if specified
  if (availableItems && Array.isArray(availableItems)) {
    const filteredWeights = {};
    for (const itemId of availableItems) {
      if (weights[itemId] !== undefined) {
        filteredWeights[itemId] = weights[itemId];
      }
    }
    weights = filteredWeights;
  }
  
  // Ensure we have at least one item with weight > 0
  const validItems = Object.entries(weights).filter(([_, w]) => w > 0);
  if (validItems.length === 0) {
    console.warn('[ItemDistribution] No valid items available, defaulting to coin');
    return 'coin';
  }
  
  // Weighted random selection
  return _weightedRandom(validItems);
}

/**
 * Get multiple items at once (for triple power-up)
 * 
 * @param {number} position - Current race position
 * @param {number} count - Number of items to generate
 * @param {string[]} [availableItems] - Available item IDs
 * @param {object} [options] - Options passed to getItemForPosition
 * @returns {string[]} Array of item IDs
 */
export function getMultipleItems(position, count = 3, availableItems = null, options = {}) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(getItemForPosition(position, availableItems, options));
  }
  return items;
}

/**
 * Get the full distribution table for UI display
 * 
 * @param {number} [position] - Optional position to get specific row for
 * @returns {object|object[]} Distribution data
 */
export function getDistributionTable(position = null) {
  if (position !== null) {
    return {
      position,
      weights: POSITION_WEIGHTS[Math.max(1, Math.min(position, 12))] || {}
    };
  }
  
  return Object.entries(POSITION_WEIGHTS).map(([pos, weights]) => ({
    position: parseInt(pos),
    weights: { ...weights }
  }));
}

/**
 * Get item definition by ID
 * 
 * @param {string} itemId - Item identifier
 * @returns {object|null} Item definition or null if not found
 */
export function getItemDefinition(itemId) {
  return ITEM_DEFINITIONS[itemId] || null;
}

/**
 * Get all item definitions
 * 
 * @returns {object} All item definitions keyed by ID
 */
export function getAllItemDefinitions() {
  return { ...ITEM_DEFINITIONS };
}

/**
 * Calculate item "power level" for a given position (for balancing analysis)
 * 
 * @param {number} position - Race position
 * @returns {number} Average expected power level (1-7 scale)
 */
export function getExpectedPowerLevel(position) {
  const clampedPos = Math.max(1, Math.min(position, 12));
  const weights = POSITION_WEIGHTS[clampedPos];
  
  let totalWeight = 0;
  let weightedPower = 0;
  
  for (const [itemId, weight] of Object.entries(weights)) {
    const def = ITEM_DEFINITIONS[itemId];
    if (def) {
      totalWeight += weight;
      weightedPower += def.power * weight;
    }
  }
  
  return totalWeight > 0 ? weightedPower / totalWeight : 0;
}

/**
 * Internal weighted random selection
 * @param {Array} entries - Array of [itemId, weight] tuples
 * @returns {string} Selected item ID
 */
function _weightedRandom(entries) {
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;
  
  for (const [itemId, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return itemId;
    }
  }
  
  // Fallback to last item (floating point edge case)
  return entries[entries.length - 1][0];
}

// Export constants for external use
export { POSITION_WEIGHTS, ITEM_DEFINITIONS, MODE_MODIFIERS };

// Default export is the main function
export default getItemForPosition;
