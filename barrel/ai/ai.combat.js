// barrel/ai/ai.combat.js
// Combat AI system for item usage, targeting, and defense
// Handles: threat assessment, item selection, projectile targeting, dodge behavior, team coordination

// ============================================================================
// ITEM DEFINITIONS & PROPERTIES
// ============================================================================

/**
 * Item database with properties for AI decision making
 */
const ITEM_DATABASE = {
  boost: {
    id: 'boost',
    type: 'offensive',
    category: 'speed',
    useWhenAhead: 0.9,      // High priority when in lead (escape)
    useWhenBehind: 0.7,      // Good for catching up
    useWhenMiddle: 0.6,
    targetRequired: false,
    selfUse: true,
    description: 'Speed boost'
  },
  shield: {
    id: 'shield',
    type: 'defensive',
    category: 'protection',
    useWhenAhead: 0.7,       // Protect lead
    useWhenBehind: 0.3,
    useWhenMiddle: 0.5,
    targetRequired: false,
    selfUse: true,
    description: 'Protection from attacks'
  },
  missile: {
    id: 'missile',
    type: 'offensive',
    category: 'projectile',
    useWhenAhead: 0.1,       // Rarely useful when ahead
    useWhenBehind: 0.95,     // Primary attack when behind
    useWhenMiddle: 0.7,
    targetRequired: true,
    selfUse: false,
    projectileSpeed: 80,     // m/s equivalent
    homingStrength: 0.7,     // 0-1 how much it tracks
    description: 'Homing missile'
  },
  shell: {
    id: 'shell',
    type: 'offensive',
    category: 'projectile',
    useWhenAhead: 0.2,
    useWhenBehind: 0.8,
    useWhenMiddle: 0.6,
    targetRequired: true,
    selfUse: false,
    projectileSpeed: 120,    // Fast but non-homing
    homingStrength: 0,
    description: 'Green shell - straight shot'
  },
  triple_missile: {
    id: 'triple_missile',
    type: 'offensive',
    category: 'projectile',
    useWhenAhead: 0.15,
    useWhenBehind: 0.98,
    useWhenMiddle: 0.8,
    targetRequired: true,
    selfUse: false,
    projectileSpeed: 75,
    homingStrength: 0.6,
    description: 'Triple homing missiles'
  },
  banana: {
    id: 'banana',
    type: 'defensive',
    category: 'trap',
    useWhenAhead: 0.85,      // Drop behind for pursuers
    useWhenBehind: 0.1,
    useWhenMiddle: 0.4,
    targetRequired: false,
    selfUse: true,
    trapDuration: 15,        // seconds
    description: 'Slip trap dropped behind'
  },
  oil: {
    id: 'oil',
    type: 'defensive',
    category: 'trap',
    useWhenAhead: 0.8,
    useWhenBehind: 0.15,
    useWhenMiddle: 0.35,
    targetRequired: false,
    selfUse: true,
    trapDuration: 20,
    description: 'Oil slick trap'
  },
  lightning: {
    id: 'lightning',
    type: 'offensive',
    category: 'special',
    useWhenAhead: 0.5,
    useWhenBehind: 0.9,      // Great comeback item
    useWhenMiddle: 0.7,
    targetRequired: false,
    selfUse: false,
    affectsAll: true,
    description: 'Shrinks all other racers'
  }
};

// ============================================================================
// POSITION-BASED ITEM PRIORITY MATRIX
// ============================================================================

/**
 * Item selection weights based on race position tier
 * Position tiers: 1st (ahead), 2-3rd (competitive), 4-6th (middle), 7th+ (behind)
 */
const POSITION_TIERS = {
  first: { maxPosition: 1, label: 'First Place' },
  competitive: { maxPosition: 3, label: 'Competitive' },
  middle: { maxPosition: 6, label: 'Middle Pack' },
  behind: { maxPosition: Infinity, label: 'Behind' }
};

/**
 * Get position tier from numeric position
 */
function getPositionTier(position) {
  if (position <= POSITION_TIERS.first.maxPosition) return 'first';
  if (position <= POSITION_TIERS.competitive.maxPosition) return 'competitive';
  if (position <= POSITION_TIERS.middle.maxPosition) return 'middle';
  return 'behind';
}

// ============================================================================
// MAIN COMBAT FUNCTIONS
// ============================================================================

/**
 * Decide whether and what item to use
 * @param {Object} context - Decision context
 * @returns {{use: boolean, needsTarget: boolean, priority: number, reason: string}}
 */
export function selectItem(context) {
  const {
    position,
    heldItem,
    personality,
    difficulty,
    threats = [],
    targets = [],
    combatSkill = 0.7,
    itemCooldown = 0
  } = context;

  // Don't use if on cooldown
  if (itemCooldown > 0) {
    return { use: false, needsTarget: false, priority: 0, reason: 'cooldown' };
  }

  // No item to use
  if (!heldItem) {
    return { use: false, needsTarget: false, priority: 0, reason: 'no_item' };
  }

  // Look up item properties
  const item = ITEM_DATABASE[heldItem];
  if (!item) {
    console.warn(`[AI.Combat] Unknown item: ${heldItem}`);
    return { use: false, needsTarget: false, priority: 0, reason: 'unknown_item' };
  }

  // Determine position tier
  const tier = getPositionTier(position.rank || position);
  
  // Calculate base usage probability based on position
  let useProbability;
  switch (tier) {
    case 'first':
      useProbability = item.useWhenAhead;
      break;
    case 'competitive':
      useProbability = (item.useWhenAhead + item.useWhenMiddle) / 2;
      break;
    case 'middle':
      useProbability = item.useWhenMiddle;
      break;
    case 'behind':
      useProbability = item.useWhenBehind;
      break;
    default:
      useProbability = 0.5;
  }

  // Modify by personality
  if (item.type === 'offensive') {
    useProbability *= (0.5 + personality.itemOffenseWeight * 0.8);
  } else if (item.type === 'defensive') {
    useProbability *= (0.5 + personality.itemDefenseWeight * 0.8);
  } else if (item.category === 'trap') {
    useProbability *= (0.5 + personality.itemTrickWeight * 0.6);
  }

  // Modify by combat skill (better fighters use items more effectively)
  useProbability *= (0.6 + combatSkill * 0.6);

  // Threat response bonus
  if (threats.length > 0 && item.type === 'defensive') {
    useProbability *= (1 + threats.length * 0.2); // More threats = more likely to defend
  }

  // Target availability check
  if (item.targetRequired && targets.length === 0) {
    return { use: false, needsTarget: true, priority: 0, reason: 'no_target' };
  }

  // Special case: defensive items when being attacked
  if (item.type === 'defensive' && threats.length > 0) {
    const incomingProjectile = threats.some(t => t.isProjectile === true);
    if (incomingProjectile) {
      useProbability = Math.min(1, useProbability * 1.5); // Urgent defense needed
    }
  }

  // Random factor (deterministic-ish based on skill)
  const randomThreshold = 0.3 + combatSkill * 0.4; // Better AI more consistent
  const shouldUse = useProbability > randomThreshold;

  // Generate reason for logging/debugging
  let reason = 'normal';
  if (tier === 'behind' && item.type === 'offensive') reason = 'catch_up_attack';
  if (tier === 'first' && item.type === 'defensive') reason = 'protect_lead';
  if (threats.length > 2 && item.type === 'defensive') reason = 'under_fire';
  if (targets.length > 0 && item.type === 'offensive' && tier !== 'first') reason = 'attack_opportunity';

  return {
    use: shouldUse,
    needsTarget: item.targetRequired,
    priority: useProbability,
    reason
  };
}

/**
 * Select best target for offensive items
 * @param {Object} context - Target selection context
 * @returns {Object|null} Selected target or null
 */
export function selectTarget(context) {
  const {
    targets = [],
    personality,
    heldItem,
    combatSkill = 0.7,
    myPosition = null
  } = context;

  if (targets.length === 0) return null;

  const item = ITEM_DATABASE[heldItem];
  
  // Score each potential target
  const scoredTargets = targets.map(target => {
    let score = 0;

    // Distance score (closer is generally better for projectiles)
    const distanceScore = 1 - Math.min(target.distance || 0, 1);
    score += distanceScore * 25;

    // Position score (targeting the leader is valuable when behind)
    if (myPosition && myPosition > (target.position || 1)) {
      // We're behind this target - good attack target
      score += 10;
      
      // Bonus for targeting higher positions when we're far back
      if (myPosition > 5 && (target.position || 1) <= 3) {
        score += 15; // Disrupt the leaders
      }
    }

    // Speed correlation (easier to hit similar speed targets)
    if (target.speed !== undefined && myPosition !== null) {
      // Speed matching bonus would go here if we had our own speed
    }

    // Threat level (target that could win is high priority)
    if ((target.position || 1) <= 2) {
      score += 10; // Leader or 2nd place is high value
    }

    // Personality modifiers
    if (personality.overtakingAggression > 0.7) {
      // Aggressive AIs prefer closer targets for quick satisfaction
      score += distanceScore * 10;
    }

    // Combat skill affects target quality assessment
    if (combatSkill > 0.8) {
      // Skilled AIs consider hit probability more
      score += calculateHitProbability(target, item) * 15;
    }

    return { ...target, score };
  });

  // Sort by score descending
  scoredTargets.sort((a, b) => b.score - a.score);

  // Return best target (with some randomness based on skill)
  if (combatSkill > 0.9 || Math.random() < combatSkill) {
    return scoredTargets[0]; // Best target
  } else {
    // Sometimes pick sub-optimal target (simulates human error)
    const idx = Math.min(
      Math.floor(Math.random() * Math.ceil(scoredTargets.length / 2)),
      scoredTargets.length - 1
    );
    return scoredTargets[idx];
  }
}

/**
 * Calculate probability of hitting a target with a projectile
 */
function calculateHitProbability(target, item) {
  if (!item || !item.projectileSpeed) return 0.5; // Non-projectile items

  let prob = 0.7; // Base hit rate

  // Distance penalty
  const dist = target.distance || 0.5;
  prob *= (1 - dist * 0.4);

  // Homing bonus
  if (item.homingStrength > 0) {
    prob += item.homingStrength * 0.25;
  }

  // Target speed penalty (faster targets harder to hit)
  if (target.speed) {
    prob *= Math.max(0.4, 1 - target.speed / 200);
  }

  return Math.max(0.1, Math.min(0.98, prob));
}

/**
 * Decide whether to use defensive item
 * @param {Object} context - Defense decision context
 * @returns {{shouldDefend: boolean, urgency: string, reason: string}}
 */
export function shouldDefend(context) {
  const {
    threats = [],
    personality,
    hasShield = false,
    incomingCount = 0
  } = context;

  // No threats - no need to defend
  if (threats.length === 0) {
    return { shouldDefend: false, urgency: 'none', reason: 'no_threats' };
  }

  // Calculate threat level
  let threatLevel = 0;
  let hasIncomingProjectile = false;
  let closestThreatDistance = Infinity;

  for (const threat of threats) {
    // Weight by distance (closer = more dangerous)
    const distanceWeight = 1 - (threat.distance || 0);
    threatLevel += distanceWeight * 20;

    // Projectiles are immediate threats
    if (threat.isProjectile) {
      hasIncomingProjectile = true;
      threatLevel += 30;
    }

    // Track closest threat
    if ((threat.distance || 1) < closestThreatDistance) {
      closestThreatDistance = threat.distance || 1;
    }
  }

  // Personality modifier
  const defensiveTendency = personality.itemDefenseWeight || 0.5;
  threatLevel *= (0.5 + defensiveTendency);

  // Decision threshold varies by situation
  let threshold = 40; // Base threshold
  
  if (hasIncomingProjectile) {
    threshold = 25; // Lower threshold for projectiles (react faster)
  }

  if (incomingCount >= 2) {
    threshold = 30; // Multiple attackers = be more defensive
  }

  const shouldDefend = threatLevel >= threshold && hasShield;

  // Determine urgency level
  let urgency = 'low';
  if (hasIncomingProjectile) urgency = 'critical';
  else if (closestThreatDistance < 0.05) urgency = 'high';
  else if (threatLevel > 50) urgency = 'medium';

  let reason = 'general_threat';
  if (hasIncomingProjectile) reason = 'incoming_projectile';
  else if (incomingCount >= 2) reason = 'multiple_attackers';
  else if (closestThreatDistance < 0.08) reason = 'close_pursuer';

  return { shouldDefend, urgency, reason };
}

/**
 * Decide whether to dodge an incoming attack
 * @param {Object} context - Dodge decision context
 * @returns {{shouldDodge: boolean, direction: 'left'|'right'|null, timing: number}}
 */
export function shouldDodge(context) {
  const {
    threats = [],
    personality,
    dodgeSkill = 0.7
  } = context;

  // Find dodgable threats (projectiles)
  const projectileThreats = threats.filter(t => t.isProjectile || t.canDodge);
  
  if (projectileThreats.length === 0) {
    return { shouldDodge: false, direction: null, timing: 0 };
  }

  // Get most imminent threat
  const imminentThreat = projectileThreats.reduce((closest, t) => 
    ((t.distance || 1) < (closest.distance || 1)) ? t : closest
  , { distance: Infinity });

  // Too close to dodge
  if ((imminentThreat.distance || 1) < 0.02) {
    return { shouldDodge: false, direction: null, timing: 0 }; // Too late
  }

  // Too far to bother yet
  if ((imminentThreat.distance || 1) > 0.15) {
    return { shouldDodge: false, direction: null, timing: 0 };
  }

  // Dodge skill check (better AI dodges more reliably)
  const dodgeChance = dodgeSkill * (personality.riskTaking < 0.5 ? 1.2 : 0.9); // Defensive AIs dodge better
  
  if (Math.random() > dodgeChance) {
    return { shouldDodge: false, direction: null, timing: 0 };
  }

  // Determine dodge direction (prefer away from track edges if possible)
  // For now, random with slight preference based on position
  const direction = Math.random() > 0.5 ? 'left' : 'right';
  
  // Timing: dodge sooner for slower reactions, later for better reflexes
  const timing = 0.15 + (1 - dodgeSkill) * 0.15; // 150-300ms

  return { 
    shouldDodge: true, 
    direction, 
    timing 
  };
}

/**
 * Team coordination for team modes
 * @param {Object} context - Team context
 * @returns {Object} Team coordination decisions
 */
export function coordinateWithTeam(context) {
  const {
    teammates = [],
    opponents = [],
    personality,
    role = 'balanced', // attacker, defender, support, balanced
    teamStrategy = 'standard'
  } = context;

  const decisions = {
    shouldPassItem: false,
    passToTeammate: null,
    targetPriority: [],
    defendTeammate: null,
    communication: null
  };

  // No teammates = no coordination
  if (teammates.length === 0) {
    return decisions;
  }

  // Find teammate positions
  const teammatePositions = teammates.map(t => ({
    id: t.id,
    position: t.position || 99,
    hasItem: !!t.heldItem,
    item: t.heldItem,
    underAttack: t.threats?.length > 1
  }));

  // Sort by position (best performing first)
  teammatePositions.sort((a, b) => a.position - b.position);

  // Role-based decisions
  switch (role) {
    case 'attacker':
      // Focus on attacking opponents, pass items to support if they need
      decisions.targetPriority = opponents.map(o => o.id);
      
      // Pass defensive items to struggling teammates
      const strugglingMate = teammatePositions.find(t => 
        t.position > 5 && !t.hasItem && t.underAttack
      );
      if (strugglingMate) {
        decisions.shouldPassItem = true;
        decisions.passToTeammate = strugglingMate.id;
      }
      break;

    case 'defender':
      // Protect leading teammates
      const leadingMate = teammatePositions.find(t => t.position <= 3);
      if (leadingMate?.underAttack) {
        decisions.defendTeammate = leadingMate.id;
        
        // If we have a defensive item, tell them we're coming
        decisions.communication = {
          type: 'covering',
          targetId: leadingMate.id
        };
      }
      break;

    case 'support':
      // Pass items to whoever needs them most
      const needyMate = teammatePositions.find(t => !t.hasItem && t.position < 6);
      if (needyMate) {
        decisions.shouldPassItem = true;
        decisions.passToTeammate = needyMate.id;
        decisions.communication = {
          type: 'item_pass',
          targetId: needyMate.id
        };
      }
      break;

    case 'balanced':
    default:
      // Adapt to situation
      const ourPosition = context.myPosition || 5;
      
      if (ourPosition <= 2) {
        // We're doing well - help others
        decisions.defendTeammate = teammatePositions[0]?.id;
      } else if (ourPosition >= 5) {
        // We're struggling - might receive help
        // Check if leading mate can spare items
        const generousMate = teammatePositions.find(t => 
          t.position <= 3 && t.hasItem
        );
        if (generousMate) {
          decisions.communication = {
            type: 'request_item',
            targetId: generousMate.id
          };
        }
      }
      break;
  }

  // Strategy modifications
  if (teamStrategy === 'all_in') {
    // Everyone attacks - don't defend
    decisions.defendTeammate = null;
    decisions.targetPriority = opponents.map(o => o.id);
  } else if (teamStrategy === 'protect_the_leader') {
    // Focus all defense on best-performing teammate
    const leader = teammatePositions[0];
    if (leader) {
      decisions.defendTeammate = leader.id;
      decisions.shouldPassItem = leader.hasItem === false;
      decisions.passToTeammate = leader.id;
    }
  }

  return decisions;
}

// ============================================================================
// LEAD CALCULATION FOR PROJECTILES
// ============================================================================

/**
 * Calculate where to aim to hit a moving target
 * @param {Object} shooter - Shooter's state
 * @param {Object} target - Target's state
 * @param {Object} item - Item being used
 * @returns {{x: number, z: number}} Aim point
 */
export function calculateLeadTarget(shooter, target, item) {
  if (!item?.projectileSpeed) {
    // Non-homing item - aim directly at current position
    return {
      x: target.x || target.position?.x || 0,
      z: target.z || target.position?.z || 0
    };
  }

  const shooterPos = {
    x: shooter.x || shooter.position?.x || 0,
    z: shooter.z || shooter.position?.z || 0
  };

  const targetPos = {
    x: target.x || target.position?.x || 0,
    z: target.z || target.position?.z || 0
  };

  const targetVel = {
    x: target.velocityX || target.speedX || 0,
    z: target.velocityZ || target.speedZ || 0
  };

  // Calculate time to reach target at current position
  const dx = targetPos.x - shooterPos.x;
  const dz = targetPos.z - shooterPos.z;
  const currentDist = Math.sqrt(dx * dx + dz * dz);
  
  if (currentDist < 0.001) {
    return targetPos; // Already at target
  }

  // Estimate flight time
  let flightTime = currentDist / item.projectileSpeed;

  // Iterate to improve estimate (account for target movement)
  for (let i = 0; i < 3; i++) {
    const predictedTarget = {
      x: targetPos.x + targetVel.x * flightTime,
      z: targetPos.z + targetVel.z * flightTime
    };

    const newDx = predictedTarget.x - shooterPos.x;
    const newDz = predictedTarget.z - shooterPos.z;
    const newDist = Math.sqrt(newDx * newDx + newDz * newDz);
    
    flightTime = newDist / item.projectileSpeed;
  }

  // Return predicted position
  return {
    x: targetPos.x + targetVel.x * flightTime,
    z: targetPos.z + targetVel.z * flightTime
  };
}

// ============================================================================
// UTITIES & HELPERS
// ============================================================================

/**
 * Get item info from database
 */
export function getItemInfo(itemId) {
  return ITEM_DATABASE[itemId] || null;
}

/**
 * Get all available items
 */
export function getAllItems() {
  return Object.keys(ITEM_DATABASE);
}

/**
 * Get items by category
 */
export function getItemsByCategory(category) {
  return Object.values(ITEM_DATABASE).filter(item => item.category === category);
}

/**
 * Check if item is defensive
 */
export function isDefensiveItem(itemId) {
  return ITEM_DATABASE[itemId]?.type === 'defensive';
}

/**
 * Check if item requires targeting
 */
export function requiresTarget(itemId) {
  return ITEM_DATABASE[itemId]?.targetRequired || false;
}

/**
 * Calculate optimal item for given situation (for power-up selection hints)
 */
export function suggestOptimalItem(position, nearbyEnemies, threats) {
  const tier = getPositionTier(position);
  
  const suggestions = [];
  
  // Score each item for this situation
  for (const [id, item] of Object.entries(ITEM_DATABASE)) {
    let score = 0;
    
    switch (tier) {
      case 'first':
        score = item.useWhenAhead * 100;
        if (threats.length > 0 && item.type === 'defensive') score += 30;
        break;
      case 'behind':
        score = item.useWhenBehind * 100;
        if (nearbyEnemies > 0 && item.type === 'offensive') score += 20;
        break;
      default:
        score = item.useWhenMiddle * 100;
    }
    
    suggestions.push({ id, score, item });
  }
  
  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 3); // Top 3 suggestions
}

// Default export with all functions
export default {
  selectItem,
  selectTarget,
  shouldDefend,
  shouldDodge,
  coordinateWithTeam,
  calculateLeadTarget,
  getItemInfo,
  getAllItems,
  getItemsByCategory,
  isDefensiveItem,
  requiresTarget,
  suggestOptimalItem,
  ITEM_DATABASE,
  POSITION_TIERS
};
