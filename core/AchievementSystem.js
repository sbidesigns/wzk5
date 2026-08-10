// core/AchievementSystem.js
// 50 achievements across categories: racing, collection, social, special.
// Notification toast on unlock.

import { EventBus } from './EventBus.js';

const ACHIEVEMENTS = [
  // Racing (15)
  { id: 'first-race', name: 'First Race', desc: 'Complete your first race', cat: 'racing', check: s => s.racesCompleted >= 1, xp: 100 },
  { id: 'win-1', name: 'Winner', desc: 'Win your first race', cat: 'racing', check: s => s.racesWon >= 1, xp: 200 },
  { id: 'win-10', name: 'Champion', desc: 'Win 10 races', cat: 'racing', check: s => s.racesWon >= 10, xp: 500 },
  { id: 'win-50', name: 'Legend', desc: 'Win 50 races', cat: 'racing', check: s => s.racesWon >= 50, xp: 2000 },
  { id: 'win-100', name: 'Hall of Fame', desc: 'Win 100 races', cat: 'racing', check: s => s.racesWon >= 100, xp: 5000 },
  { id: 'drift-100', name: 'Drift Novice', desc: 'Drift 100m total', cat: 'racing', check: s => s.totalDrift >= 100, xp: 100 },
  { id: 'drift-1000', name: 'Drift Pro', desc: 'Drift 1,000m total', cat: 'racing', check: s => s.totalDrift >= 1000, xp: 500 },
  { id: 'drift-10000', name: 'Drift King', desc: 'Drift 10,000m total', cat: 'racing', check: s => s.totalDrift >= 10000, xp: 2000 },
  { id: 'burnout-100', name: 'Burnout Master', desc: 'Burnout 100 times', cat: 'racing', check: s => s.totalBurnout >= 100, xp: 300 },
  { id: 'reach-200', name: 'Speed Demon', desc: 'Reach 200 km/h', cat: 'racing', check: s => s.topSpeed >= 200, xp: 500 },
  { id: 'reach-300', name: 'Land Speed', desc: 'Reach 300 km/h', cat: 'racing', check: s => s.topSpeed >= 300, xp: 1000 },
  { id: 'items-100', name: 'Item User', desc: 'Use 100 items', cat: 'racing', check: s => s.itemsUsed >= 100, xp: 300 },
  { id: 'laps-100', name: 'Lap Runner', desc: 'Complete 100 laps', cat: 'racing', check: s => s.lapsCompleted >= 100, xp: 400 },
  { id: 'perfect-lap', name: 'Perfect Lap', desc: 'Complete a lap without hitting anything', cat: 'racing', check: s => s.perfectLaps >= 1, xp: 500 },
  { id: 'comeback', name: 'Comeback Kid', desc: 'Win from last place', cat: 'racing', check: s => s.comebackWins >= 1, xp: 1000 },
  // Collection (12)
  { id: 'first-vehicle', name: 'First Ride', desc: 'Unlock your first vehicle', cat: 'collection', check: (s, ctx) => ctx.unlocks.vehicles.length >= 1, xp: 100 },
  { id: 'all-vehicles', name: 'Collector', desc: 'Unlock all vehicles', cat: 'collection', check: (s, ctx) => ctx.unlocks.vehicles.length >= 9, xp: 2000 },
  { id: 'all-characters', name: 'Crew Assembled', desc: 'Unlock all characters', cat: 'collection', check: (s, ctx) => ctx.unlocks.characters.length >= 8, xp: 1500 },
  { id: 'first-part', name: 'Tuner', desc: 'Buy your first part', cat: 'collection', check: (s, ctx) => ctx.unlocks.parts.length >= 1, xp: 100 },
  { id: 'all-parts', name: 'Master Mechanic', desc: 'Own all parts', cat: 'collection', check: (s, ctx) => ctx.unlocks.parts.length >= 25, xp: 3000 },
  { id: 'all-street', name: 'Street Tuner', desc: 'Own all Street-tier parts', cat: 'collection', check: (s, ctx) => ctx.streetPartsOwned >= 7, xp: 500 },
  { id: 'all-pro', name: 'Pro Tuner', desc: 'Own all Pro-tier parts', cat: 'collection', check: (s, ctx) => ctx.proPartsOwned >= 7, xp: 1000 },
  { id: 'all-extreme', name: 'Extreme Tuner', desc: 'Own all Extreme-tier parts', cat: 'collection', check: (s, ctx) => ctx.extremePartsOwned >= 7, xp: 2000 },
  { id: 'level-10', name: 'Rising Star', desc: 'Reach level 10', cat: 'collection', check: (s, ctx) => ctx.level >= 10, xp: 500 },
  { id: 'level-25', name: 'Veteran', desc: 'Reach level 25', cat: 'collection', check: (s, ctx) => ctx.level >= 25, xp: 1500 },
  { id: 'level-50', name: 'Elite', desc: 'Reach level 50', cat: 'collection', check: (s, ctx) => ctx.level >= 50, xp: 3000 },
  { id: 'level-100', name: 'Max Level', desc: 'Reach level 100', cat: 'collection', check: (s, ctx) => ctx.level >= 100, xp: 10000 },
  // Social (8)
  { id: 'first-friend', name: 'Social Butterfly', desc: 'Add your first friend', cat: 'social', check: (s, ctx) => ctx.friendsCount >= 1, xp: 100 },
  { id: 'party-race', name: 'Party On', desc: 'Complete a party race', cat: 'social', check: s => s.partyRaces >= 1, xp: 300 },
  { id: 'team-win', name: 'Team Player', desc: 'Win a team relay race', cat: 'social', check: s => s.teamWins >= 1, xp: 500 },
  { id: 'play-5-modes', name: 'Variety', desc: 'Play 5 different modes', cat: 'social', check: (s, ctx) => ctx.modesPlayed >= 5, xp: 300 },
  { id: 'play-all-modes', name: 'Jack of All Trades', desc: 'Play all 8 modes', cat: 'social', check: (s, ctx) => ctx.modesPlayed >= 8, xp: 1000 },
  { id: 'online-win', name: 'Online Champion', desc: 'Win an online race', cat: 'social', check: s => s.onlineWins >= 1, xp: 1000 },
  { id: 'online-10', name: 'Online Veteran', desc: 'Complete 10 online races', cat: 'social', check: s => s.onlineRaces >= 10, xp: 500 },
  { id: 'rival-defeat', name: 'Rival Conqueror', desc: 'Defeat your first rival', cat: 'social', check: (s, ctx) => ctx.rivalsDefeated >= 1, xp: 500 },
  // Special (15)
  { id: 'season-1', name: 'Early Adopter', desc: 'Play in Season 1', cat: 'special', check: (s, ctx) => ctx.seasonPlayed, xp: 200 },
  { id: 'bp-tier-10', name: 'Battle Pass Starter', desc: 'Reach battle pass tier 10', cat: 'special', check: (s, ctx) => ctx.bpTier >= 10, xp: 500 },
  { id: 'bp-tier-50', name: 'Battle Pass Pro', desc: 'Reach battle pass tier 50', cat: 'special', check: (s, ctx) => ctx.bpTier >= 50, xp: 1500 },
  { id: 'bp-tier-100', name: 'Battle Pass Master', desc: 'Reach battle pass tier 100', cat: 'special', check: (s, ctx) => ctx.bpTier >= 100, xp: 5000 },
  { id: 'bp-paid', name: 'Premium Supporter', desc: 'Purchase the battle pass', cat: 'special', check: (s, ctx) => ctx.bpPaid, xp: 200 },
  { id: 'career-ch1', name: 'Rookie Graduate', desc: 'Complete Chapter 1', cat: 'special', check: (s, ctx) => ctx.careerChapter >= 1, xp: 500 },
  { id: 'career-ch3', name: 'Pro Graduate', desc: 'Complete Chapter 3', cat: 'special', check: (s, ctx) => ctx.careerChapter >= 3, xp: 1500 },
  { id: 'career-ch6', name: 'Legend Graduate', desc: 'Complete all chapters', cat: 'special', check: (s, ctx) => ctx.careerChapter >= 6, xp: 5000 },
  { id: 'br-win', name: 'Last One Standing', desc: 'Win a Battle Royale', cat: 'special', check: s => s.brWins >= 1, xp: 2000 },
  { id: 'derby-win', name: 'Demolition Derby', desc: 'Win a Derby match', cat: 'special', check: s => s.derbyWins >= 1, xp: 1000 },
  { id: 'ghost-beat', name: 'Ghost Buster', desc: 'Beat your own ghost', cat: 'special', check: s => s.ghostsBeaten >= 1, xp: 500 },
  { id: 'share-replay', name: 'Show Off', desc: 'Share a replay code', cat: 'special', check: s => s.replaysShared >= 1, xp: 200 },
  { id: 'tutorial', name: 'Quick Learner', desc: 'Complete the tutorial', cat: 'special', check: s => s.tutorialCompleted, xp: 100 },
  { id: 'daily-streak-7', name: 'Weekly Warrior', desc: '7-day daily login streak', cat: 'special', check: s => s.dailyStreak >= 7, xp: 700 },
  { id: 'daily-streak-30', name: 'Monthly Regular', desc: '30-day daily login streak', cat: 'special', check: s => s.dailyStreak >= 30, xp: 3000 }
];

class AchievementSystem {
  constructor() {
    this._save = null;
    this._achievements = ACHIEVEMENTS;
  }

  init(saveSystem) {
    this._save = saveSystem;
    if (!this._save.get('achievements')) {
      this._save.set('achievements', { unlocked: [], progress: {} });
    }
  }

  getAchievements() { return this._achievements; }
  getUnlocked() { return this._save?.get('achievements.unlocked') || []; }
  isUnlocked(id) { return this.getUnlocked().includes(id); }

  checkAll() {
    if (!this._save) return;
    const stats = this._save.get('stats') || {};
    const progression = this._save.get('progression') || {};
    const unlocks = this._save.get('unlocks') || {};
    const bp = this._save.get('battlePass') || {};
    const career = this._save.get('career') || {};
    const friends = this._save.get('friends') || [];

    const ctx = {
      level: progression.level || 1,
      unlocks,
      friendsCount: friends.length,
      modesPlayed: stats.modesPlayed || 0,
      rivalsDefeated: career.rivalDefeated?.length || 0,
      bpTier: bp.tier || 0,
      bpPaid: bp.paid || false,
      careerChapter: career.rivalDefeated?.length || 0,
      seasonPlayed: true,
      streetPartsOwned: unlocks.parts?.filter(p => p.includes('street')).length || 0,
      proPartsOwned: unlocks.parts?.filter(p => p.includes('pro')).length || 0,
      extremePartsOwned: unlocks.parts?.filter(p => p.includes('extreme')).length || 0
    };

    for (const ach of this._achievements) {
      if (this.isUnlocked(ach.id)) continue;
      try {
        if (ach.check(stats, ctx)) {
          this._unlock(ach);
        }
      } catch (e) {
        // Skip broken achievement check
      }
    }
  }

  _unlock(ach) {
    this._save.update('achievements.unlocked', u => u.includes(ach.id) ? u : [...u, ach.id]);
    // Grant XP
    if (window.__engine?.progression) {
      window.__engine.progression.grantXP(ach.xp);
    }
    // Show notification toast
    this._showToast(ach);
    EventBus.emit('achievement:unlocked', ach);
  }

  _showToast(ach) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 80px; right: 24px; z-index: 1000;
      background: linear-gradient(135deg, #ffd23f, #ff8c00);
      color: #05060a; padding: 16px 24px; border-radius: 8px;
      box-shadow: 0 8px 32px rgba(255,210,63,0.4);
      font-family: 'Bebas Neue', Impact, sans-serif;
      animation: slideIn 0.3s ease, fadeOut 0.5s ease 4s forwards;
      max-width: 320px;
    `;
    toast.innerHTML = `
      <div style="font-size: 12px; opacity: 0.7; letter-spacing: 0.2em;">ACHIEVEMENT UNLOCKED</div>
      <div style="font-size: 24px; margin: 4px 0;">${ach.name}</div>
      <div style="font-size: 14px; opacity: 0.8;">${ach.desc}</div>
      <div style="font-size: 12px; margin-top: 4px; color: #0066cc;">+${ach.xp} XP</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  getProgress() {
    const unlocked = this.getUnlocked().length;
    const total = this._achievements.length;
    return { unlocked, total, percent: Math.round(unlocked / total * 100) };
  }
}

export const achievements = new AchievementSystem();
export default achievements;
