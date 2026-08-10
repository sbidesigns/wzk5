// core/CareerSystem.js
// Career mode: 30 events across 6 chapters. Rival races unlock vehicles.
// Reputation gained per event placement.

import { EventBus } from './EventBus.js';

const CHAPTERS = [
  {
    id: 'ch1-rookie',
    name: 'Rookie League',
    requiredRep: 0,
    events: [
      { id: 'ev1-1', name: 'First Lap', mode: 'circuit', track: 'downtown', laps: 3, reward: { credits: 2000, rep: 100 } },
      { id: 'ev1-2', name: 'Sprint Intro', mode: 'sprint', track: 'downtown', reward: { credits: 2500, rep: 100 } },
      { id: 'ev1-3', name: 'Drift Basics', mode: 'drift', track: 'downtown', reward: { credits: 3000, rep: 150 } },
      { id: 'ev1-4', name: 'Time Trial', mode: 'time-trial', track: 'downtown', reward: { credits: 3500, rep: 150 } },
      { id: 'ev1-5', name: 'Rookie Championship', mode: 'circuit', track: 'downtown', laps: 5, reward: { credits: 5000, rep: 200 } }
    ],
    rival: { name: 'Ace Rourke', vehicle: 'spectre', character: 'ace' }
  },
  {
    id: 'ch2-amateur',
    name: 'Amateur Circuit',
    requiredRep: 700,
    events: [
      { id: 'ev2-1', name: 'City Sprint', mode: 'sprint', track: 'downtown', reward: { credits: 4000, rep: 150 } },
      { id: 'ev2-2', name: 'Neon Drift', mode: 'drift', track: 'downtown', reward: { credits: 4500, rep: 150 } },
      { id: 'ev2-3', name: 'Elimination Run', mode: 'elimination', track: 'downtown', reward: { credits: 5000, rep: 200 } },
      { id: 'ev2-4', name: 'Team Relay', mode: 'team-relay', track: 'downtown', reward: { credits: 5500, rep: 200 } },
      { id: 'ev2-5', name: 'Amateur Championship', mode: 'circuit', track: 'downtown', laps: 5, reward: { credits: 7000, rep: 250 } }
    ],
    rival: { name: 'Nova Kade', vehicle: 'vixen', character: 'nova' }
  },
  {
    id: 'ch3-pro',
    name: 'Pro League',
    requiredRep: 1500,
    events: [
      { id: 'ev3-1', name: 'Pro Circuit', mode: 'circuit', track: 'downtown', laps: 5, reward: { credits: 6000, rep: 200 } },
      { id: 'ev3-2', name: 'Drift Master', mode: 'drift', track: 'downtown', reward: { credits: 6500, rep: 200 } },
      { id: 'ev3-3', name: 'Derby Arena', mode: 'derby', track: 'downtown', reward: { credits: 7000, rep: 250 } },
      { id: 'ev3-4', name: 'Battle Royale', mode: 'battle-royale', track: 'downtown', reward: { credits: 8000, rep: 300 } },
      { id: 'ev3-5', name: 'Pro Championship', mode: 'circuit', track: 'downtown', laps: 7, reward: { credits: 10000, rep: 350 } }
    ],
    rival: { name: 'Brick Stone', vehicle: 'titan', character: 'brick' }
  },
  {
    id: 'ch4-elite',
    name: 'Elite Circuit',
    requiredRep: 2500,
    events: [
      { id: 'ev4-1', name: 'Elite Sprint', mode: 'sprint', track: 'downtown', reward: { credits: 8000, rep: 250 } },
      { id: 'ev4-2', name: 'Extreme Drift', mode: 'drift', track: 'downtown', reward: { credits: 8500, rep: 250 } },
      { id: 'ev4-3', name: 'Last Stand', mode: 'elimination', track: 'downtown', reward: { credits: 9000, rep: 300 } },
      { id: 'ev4-4', name: 'Team Elite', mode: 'team-relay', track: 'downtown', reward: { credits: 9500, rep: 300 } },
      { id: 'ev4-5', name: 'Elite Championship', mode: 'circuit', track: 'downtown', laps: 7, reward: { credits: 12000, rep: 400 } }
    ],
    rival: { name: 'Vex Marlowe', vehicle: 'vixen', character: 'vex' }
  },
  {
    id: 'ch5-master',
    name: 'Master Series',
    requiredRep: 3800,
    events: [
      { id: 'ev5-1', name: 'Master Circuit', mode: 'circuit', track: 'downtown', laps: 7, reward: { credits: 10000, rep: 300 } },
      { id: 'ev5-2', name: 'Drift Legend', mode: 'drift', track: 'downtown', reward: { credits: 11000, rep: 300 } },
      { id: 'ev5-3', name: 'Derby King', mode: 'derby', track: 'downtown', reward: { credits: 12000, rep: 350 } },
      { id: 'ev5-4', name: 'BR Champion', mode: 'battle-royale', track: 'downtown', reward: { credits: 14000, rep: 400 } },
      { id: 'ev5-5', name: 'Master Championship', mode: 'circuit', track: 'downtown', laps: 10, reward: { credits: 18000, rep: 500 } }
    ],
    rival: { name: 'Jett Reyes', vehicle: 'moto-01', character: 'jett' }
  },
  {
    id: 'ch6-legend',
    name: 'Legend Tier',
    requiredRep: 5500,
    events: [
      { id: 'ev6-1', name: 'Legend Sprint', mode: 'sprint', track: 'downtown', reward: { credits: 15000, rep: 400 } },
      { id: 'ev6-2', name: 'Legend Drift', mode: 'drift', track: 'downtown', reward: { credits: 16000, rep: 400 } },
      { id: 'ev6-3', name: 'Legend Derby', mode: 'derby', track: 'downtown', reward: { credits: 18000, rep: 450 } },
      { id: 'ev6-4', name: 'Legend BR', mode: 'battle-royale', track: 'downtown', reward: { credits: 20000, rep: 500 } },
      { id: 'ev6-5', name: 'Grand Championship', mode: 'circuit', track: 'downtown', laps: 12, reward: { credits: 30000, rep: 700 } }
    ],
    rival: { name: 'Zero Kaine', vehicle: 'moto-01', character: 'zero' }
  }
];

class CareerSystem {
  constructor() {
    this._save = null;
    this._chapters = CHAPTERS;
  }

  init(saveSystem) {
    this._save = saveSystem;
    if (!this._save.get('career')) {
      this._save.set('career', {
        reputation: 0,
        completedEvents: [],
        rivalDefeated: [],
        currentChapter: 0
      });
    }
  }

  getChapters() { return this._chapters; }

  getChapter(chapterId) {
    return this._chapters.find(c => c.id === chapterId);
  }

  isChapterUnlocked(chapterId) {
    const chapter = this.getChapter(chapterId);
    if (!chapter) return false;
    const rep = this.getReputation();
    return rep >= chapter.requiredRep;
  }

  getReputation() { return this._save?.get('career.reputation') || 0; }
  getCompletedEvents() { return this._save?.get('career.completedEvents') || []; }
  getRivalDefeated() { return this._save?.get('career.rivalDefeated') || []; }

  isEventCompleted(eventId) {
    return this.getCompletedEvents().includes(eventId);
  }

  completeEvent(eventId, position) {
    const chapter = this._chapters.find(c => c.events.some(e => e.id === eventId));
    if (!chapter) return;
    const event = chapter.events.find(e => e.id === eventId);
    if (!event) return;

    const completed = this.getCompletedEvents();
    if (!completed.includes(eventId)) {
      this._save.update('career.completedEvents', c => [...c, eventId]);
    }

    // Award rewards (placement-based: 1st = 100%, 2nd = 70%, 3rd = 50%)
    const placementMult = position === 1 ? 1.0 : position === 2 ? 0.7 : position === 3 ? 0.5 : 0.25;
    const credits = Math.floor((event.reward.credits || 0) * placementMult);
    const rep = Math.floor((event.reward.rep || 0) * placementMult);

    if (window.__engine?.progression) {
      window.__engine.progression.grantCredits(credits);
    }
    this._save.update('career.reputation', r => (r || 0) + rep);

    EventBus.emit('career:eventComplete', { eventId, position, credits, rep });
    return { credits, rep };
  }

  defeatRival(chapterId) {
    const chapter = this.getChapter(chapterId);
    if (!chapter?.rival) return;
    this._save.update('career.rivalDefeated', d => d.includes(chapterId) ? d : [...d, chapterId]);
    // Unlock rival's vehicle
    if (chapter.rival.vehicle) {
      this._save.update('unlocks.vehicles', v => v.includes(chapter.rival.vehicle) ? v : [...v, chapter.rival.vehicle]);
    }
    EventBus.emit('career:rivalDefeated', { chapterId, rival: chapter.rival });
  }

  getCurrentChapter() {
    const rep = this.getReputation();
    for (let i = this._chapters.length - 1; i >= 0; i--) {
      if (rep >= this._chapters[i].requiredRep) return i;
    }
    return 0;
  }

  getProgress() {
    const completed = this.getCompletedEvents().length;
    const total = this._chapters.reduce((sum, c) => sum + c.events.length, 0);
    return { completed, total, percent: Math.round(completed / total * 100) };
  }
}

export const career = new CareerSystem();
export default career;
