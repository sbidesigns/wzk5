// core/BattlePassSystem.js
// 100-tier battle pass with free + paid tracks.
// XP sources: races, laps, challenges, season quests.
// Tier unlocks grant rewards (credits, gold, vehicles, characters, parts, skins).

import { EventBus } from './EventBus.js';

const TIERS = 100;
const XP_PER_TIER = 1000;

// Reward generator — generates 100 tiers of rewards
function generateRewards() {
  const rewards = [];
  for (let i = 1; i <= TIERS; i++) {
    const free = generateFreeReward(i);
    const paid = generatePaidReward(i);
    rewards.push({ tier: i, free, paid });
  }
  return rewards;
}

function generateFreeReward(tier) {
  if (tier % 10 === 0) return { type: 'gold', amount: 100, displayName: `${100} Gold` };
  if (tier % 5 === 0) return { type: 'credits', amount: 5000, displayName: `5,000 Credits` };
  if (tier % 3 === 0) return { type: 'xp_boost', amount: 2, displayName: '2x XP Boost (1hr)' };
  return { type: 'credits', amount: 1000, displayName: `1,000 Credits` };
}

function generatePaidReward(tier) {
  if (tier === 100) return { type: 'vehicle', id: 'moto-01', displayName: 'Phantom Cycle (Legendary Skin)' };
  if (tier === 50) return { type: 'character', id: 'zero', displayName: 'Zero Kaine (Legendary Skin)' };
  if (tier === 25) return { type: 'vehicle', id: 'buggy-01', displayName: 'Dune Buggy (Pro Skin)' };
  if (tier % 25 === 0) return { type: 'gold', amount: 500, displayName: `500 Gold` };
  if (tier % 10 === 0) return { type: 'part', id: `body-extreme-1`, displayName: 'Extreme Carbon Body' };
  if (tier % 5 === 0) return { type: 'credits', amount: 10000, displayName: `10,000 Credits` };
  if (tier % 3 === 0) return { type: 'gold', amount: 50, displayName: `50 Gold` };
  return { type: 'credits', amount: 2500, displayName: `2,500 Credits` };
}

class BattlePassSystem {
  constructor() {
    this._save = null;
    this._rewards = generateRewards();
    this._challenges = [];
  }

  init(saveSystem) {
    this._save = saveSystem;
    // Initialize battle pass state if missing
    if (!this._save.get('battlePass')) {
      this._save.set('battlePass', {
        seasonId: 'S01_NEON_UNDERGROUND',
        tier: 0,
        xpInTier: 0,
        paid: false,
        claimedTiers: []
      });
    }
    // Listen for XP events
    EventBus.on('progression:raceComplete', ({ xp }) => this.grantXP(xp));
    EventBus.on('progression:levelUp', ({ xp }) => this.grantXP(xp * 0.5)); // Half XP also goes to battle pass
  }

  getRewards() { return this._rewards; }
  getTier() { return this._save?.get('battlePass.tier') || 0; }
  getXPInTier() { return this._save?.get('battlePass.xpInTier') || 0; }
  isPaid() { return this._save?.get('battlePass.paid') || false; }
  getClaimedTiers() { return this._save?.get('battlePass.claimedTiers') || []; }

  getTierProgress() {
    return this.getXPInTier() / XP_PER_TIER;
  }

  getXPToNextTier() {
    return XP_PER_TIER - this.getXPInTier();
  }

  grantXP(amount) {
    if (!this._save) return;
    let tier = this.getTier();
    let xp = this.getXPInTier() + amount;
    let tiersGained = 0;
    while (xp >= XP_PER_TIER && tier < TIERS) {
      xp -= XP_PER_TIER;
      tier++;
      tiersGained++;
      EventBus.emit('battlepass:tierUp', { tier });
    }
    this._save.set('battlePass.tier', tier);
    this._save.set('battlePass.xpInTier', xp);
    if (tiersGained > 0) {
      EventBus.emit('battlepass:tiersGained', { count: tiersGained, newTier: tier });
    }
  }

  purchasePass() {
    const gold = this._save.get('progression.gold') || 0;
    if (gold < 1000) return { ok: false, error: 'Insufficient gold (need 1000)' };
    this._save.set('progression.gold', gold - 1000);
    this._save.set('battlePass.paid', true);
    EventBus.emit('battlepass:purchased', {});
    return { ok: true };
  }

  claimReward(tier, track = 'free') {
    const claimed = this.getClaimedTiers();
    const claimKey = `${tier}:${track}`;
    if (claimed.includes(claimKey)) return { ok: false, error: 'Already claimed' };
    if (this.getTier() < tier) return { ok: false, error: 'Tier not reached' };
    if (track === 'paid' && !this.isPaid()) return { ok: false, error: 'Premium pass required' };

    const reward = this._rewards[tier - 1]?.[track];
    if (!reward) return { ok: false, error: 'No reward at this tier' };

    // Grant reward
    this._grantReward(reward);
    this._save.update('battlePass.claimedTiers', c => [...c, claimKey]);
    EventBus.emit('battlepass:rewardClaimed', { tier, track, reward });
    return { ok: true, reward };
  }

  _grantReward(reward) {
    switch (reward.type) {
      case 'credits':
        this._save.update('progression.credits', c => (c || 0) + reward.amount);
        break;
      case 'gold':
        this._save.update('progression.gold', g => (g || 0) + reward.amount);
        break;
      case 'vehicle':
        this._save.update('unlocks.vehicles', v => v.includes(reward.id) ? v : [...v, reward.id]);
        break;
      case 'character':
        this._save.update('unlocks.characters', c => c.includes(reward.id) ? c : [...c, reward.id]);
        break;
      case 'part':
        this._save.update('unlocks.parts', p => p.includes(reward.id) ? p : [...p, reward.id]);
        break;
    }
  }

  // Daily/weekly challenges
  generateDailyChallenges() {
    const pool = [
      { id: 'win-3', desc: 'Win 3 races', target: 3, xp: 500, type: 'wins' },
      { id: 'drift-500', desc: 'Drift 500m total', target: 500, xp: 500, type: 'driftDistance' },
      { id: 'use-10-items', desc: 'Use 10 items', target: 10, xp: 500, type: 'itemsUsed' },
      { id: 'complete-5', desc: 'Complete 5 races', target: 5, xp: 500, type: 'racesCompleted' },
      { id: 'lap-time', desc: 'Beat a personal best lap', target: 1, xp: 500, type: 'newBestLap' }
    ];
    // Pick 3 random
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).map(c => ({ ...c, progress: 0, completed: false }));
  }

  generateWeeklyChallenges() {
    const pool = [
      { id: 'win-10', desc: 'Win 10 races', target: 10, xp: 2000, type: 'wins' },
      { id: 'drift-2000', desc: 'Drift 2000m total', target: 2000, xp: 2000, type: 'driftDistance' },
      { id: 'reach-300', desc: 'Reach 300 km/h', target: 1, xp: 2000, type: 'topSpeed' },
      { id: 'complete-25', desc: 'Complete 25 races', target: 25, xp: 2000, type: 'racesCompleted' },
      { id: 'all-modes', desc: 'Play all 8 modes', target: 8, xp: 2000, type: 'modesPlayed' }
    ];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5).map(c => ({ ...c, progress: 0, completed: false }));
  }
}

export const battlePass = new BattlePassSystem();
export default battlePass;
