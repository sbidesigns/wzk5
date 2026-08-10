// core/ProgressionSystem.js
// Tracks XP, levels, currency. Notifies UI on changes.
// XP sources: base race XP + per-lap + win bonus + objective bonus.
// Level thresholds: 1000 XP per level (linear).
// Currency: credits (soft, earned) + gold (hard, premium).

import { EventBus } from './EventBus.js';

const XP_PER_LEVEL = 1000;

const LEVEL_REWARDS = {
  5:   { type: 'vehicle', id: 'atv-01',   message: 'Unlocked: Raptor ATV' },
  10:  { type: 'vehicle', id: 'buggy-01', message: 'Unlocked: Dune Buggy' },
  15:  { type: 'vehicle', id: 'moto-01',  message: 'Unlocked: Phantom Cycle' },
  20:  { type: 'character', id: 'jett',   message: 'Unlocked: Jett Reyes' },
  25:  { type: 'character', id: 'rogue',  message: 'Unlocked: Rogue Vance' },
  30:  { type: 'character', id: 'echo',   message: 'Unlocked: Echo Sato' },
  40:  { type: 'character', id: 'zero',   message: 'Unlocked: Zero Kaine' }
};

class ProgressionSystem {
  constructor() {
    this._save = null;
  }

  init(saveSystem) {
    this._save = saveSystem;
    // Listen for race completion events
    EventBus.on('mode:circuit:finished', ({ vehicle, position }) => this.onRaceComplete(vehicle, position));
    EventBus.on('mode:drift:finished', ({ vehicle, score }) => this.onDriftComplete(vehicle, score));
    EventBus.on('race:lapComplete', ({ vehicle, lapTime }) => this.onLapComplete(vehicle, lapTime));
  }

  onRaceComplete(vehicleId, position) {
    if (!this._save) return;
    const baseXP = 200;
    const positionBonus = position === 1 ? 300 : position === 2 ? 150 : position === 3 ? 75 : 0;
    const totalXP = baseXP + positionBonus;
    this.grantXP(totalXP);
    this.grantCredits(baseXP + positionBonus * 2);
    this._save.update('progression', p => ({ ...p, racesCompleted: p.racesCompleted + 1, racesWon: p.racesWon + (position === 1 ? 1 : 0) }));
    EventBus.emit('progression:raceComplete', { xp: totalXP, credits: baseXP + positionBonus * 2, position });
  }

  onDriftComplete(vehicleId, score) {
    const xp = Math.floor(score / 100);
    this.grantXP(xp);
    this.grantCredits(xp);
  }

  onLapComplete(vehicleId, lapTime) {
    if (vehicleId !== 'player') return;
    this.grantXP(50);
    // Track best lap
    this._save.update(`stats.bestLaps`, laps => {
      const trackId = this._save.get('preferences.lastTrack') || 'downtown';
      if (!laps) laps = {};
      if (!laps[trackId] || lapTime < laps[trackId]) {
        laps[trackId] = lapTime;
        EventBus.emit('progression:newBestLap', { track: trackId, time: lapTime });
      }
      return laps;
    });
  }

  grantXP(amount) {
    if (!this._save) return;
    const prog = this._save.get('progression') || {};
    let xp = (prog.xp || 0) + amount;
    let level = prog.level || 1;
    let leveledUp = false;
    let unlocks = [];
    while (xp >= XP_PER_LEVEL * level) {
      xp -= XP_PER_LEVEL * level;
      level++;
      leveledUp = true;
      const reward = LEVEL_REWARDS[level];
      if (reward) {
        this._grantUnlock(reward);
        unlocks.push(reward);
      }
    }
    this._save.set('progression.xp', xp);
    this._save.set('progression.level', level);
    if (leveledUp) {
      EventBus.emit('progression:levelUp', { level, xp, unlocks });
    }
  }

  grantCredits(amount) {
    if (!this._save) return;
    this._save.update('progression.credits', c => (c || 0) + amount);
  }

  grantGold(amount) {
    if (!this._save) return;
    this._save.update('progression.gold', g => (g || 0) + amount);
  }

  spendCredits(amount) {
    if (!this._save) return false;
    const current = this._save.get('progression.credits') || 0;
    if (current < amount) return false;
    this._save.set('progression.credits', current - amount);
    return true;
  }

  spendGold(amount) {
    if (!this._save) return false;
    const current = this._save.get('progression.gold') || 0;
    if (current < amount) return false;
    this._save.set('progression.gold', current - amount);
    return true;
  }

  _grantUnlock(reward) {
    if (reward.type === 'vehicle') {
      this._save.update('unlocks.vehicles', v => v.includes(reward.id) ? v : [...v, reward.id]);
    } else if (reward.type === 'character') {
      this._save.update('unlocks.characters', c => c.includes(reward.id) ? c : [...c, reward.id]);
    }
  }

  getLevel() { return this._save?.get('progression.level') || 1; }
  getXP() { return this._save?.get('progression.xp') || 0; }
  getCredits() { return this._save?.get('progression.credits') || 0; }
  getGold() { return this._save?.get('progression.gold') || 0; }
  getXPToNextLevel() {
    const level = this.getLevel();
    return XP_PER_LEVEL * level - this.getXP();
  }
  getLevelProgress() {
    const level = this.getLevel();
    const xp = this.getXP();
    return xp / (XP_PER_LEVEL * level);
  }
}

export const progression = new ProgressionSystem();
export default progression;
