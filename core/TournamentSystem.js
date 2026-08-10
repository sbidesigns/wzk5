// core/TournamentSystem.js
// Weekly tournament bracket (single elimination, 32 players).
// Sign up in advance, matches at scheduled times.

import { EventBus } from './EventBus.js';

class TournamentSystem {
  constructor() {
    this._save = null;
    this._currentTournament = null;
  }

  init(saveSystem) {
    this._save = saveSystem;
    this._generateWeeklyTournament();
  }

  _generateWeeklyTournament() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);
    const weekId = `tournament-${weekStart.toISOString().slice(0, 10)}`;

    if (this._save.get(`tournaments.${weekId}`)) {
      this._currentTournament = this._save.get(`tournaments.${weekId}`);
      return;
    }

    this._currentTournament = {
      id: weekId,
      startDate: weekStart.toISOString(),
      endDate: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      bracketSize: 32,
      signedUp: [],
      bracket: [],
      round: 0,
      rewards: [
        { position: 1, credits: 50000, gold: 500, title: 'Tournament Champion' },
        { position: 2, credits: 25000, gold: 250, title: 'Runner-Up' },
        { position: 3, credits: 15000, gold: 150, title: 'Third Place' },
        { position: 4, credits: 10000, gold: 100 },
        { position: 5-8, credits: 5000, gold: 50 },
        { position: 9-16, credits: 2500 }
      ]
    };
    this._save.set(`tournaments.${weekId}`, this._currentTournament);
  }

  signUp(playerName) {
    if (!this._currentTournament) return { ok: false, error: 'No active tournament' };
    if (this._currentTournament.signedUp.length >= 32) return { ok: false, error: 'Bracket full' };
    if (this._currentTournament.signedUp.find(p => p.name === playerName)) return { ok: false, error: 'Already signed up' };
    const entry = {
      id: `player-${Date.now()}`,
      name: playerName,
      isPlayer: true,
      seed: this._currentTournament.signedUp.length + 1,
      eliminated: false
    };
    this._currentTournament.signedUp.push(entry);
    // Fill with bots if needed
    while (this._currentTournament.signedUp.length < 32) {
      this._currentTournament.signedUp.push({
        id: `bot-${this._currentTournament.signedUp.length}`,
        name: this._botName(this._currentTournament.signedUp.length),
        isPlayer: false,
        seed: this._currentTournament.signedUp.length + 1,
        eliminated: false,
        skill: 0.5 + Math.random() * 0.5
      });
    }
    this._save.set(`tournaments.${this._currentTournament.id}`, this._currentTournament);
    EventBus.emit('tournament:signedUp', { entry });
    return { ok: true, entry };
  }

  _botName(i) {
    const names = ['ShadowDriver', 'NeonDrifter', 'ApexHunter', 'TurboAlice', 'GhostRider', 'VelocityVex', 'MidnightMax', 'CrimsonClaire', 'BlazeBishop', 'PhantomPhil', 'StormSasha', 'RogueRachel', 'DriftKing', 'NitroNate', 'SerenitySue', 'TitanTom', 'VortexVic', 'EchoElena', 'SpecterSteve', 'MaverickMia', 'HavocHal', 'ZenithZoe', 'PulsePat', 'NovaNick', 'RaptorRay', 'SableSam', 'CometChris', 'TalonTaylor', 'ReaperRiley', 'BlazeBrook', 'OnyxOwen', 'QuillQuinn'];
    return names[i % names.length];
  }

  generateBracket() {
    if (!this._currentTournament) return;
    const players = [...this._currentTournament.signedUp];
    // Seed bracket (1 vs 32, 2 vs 31, etc.)
    const seeded = [];
    for (let i = 0; i < 16; i++) {
      seeded.push(players[i]);
      seeded.push(players[31 - i]);
    }
    this._currentTournament.bracket = [];
    for (let i = 0; i < 16; i++) {
      this._currentTournament.bracket.push({
        round: 1,
        match: i + 1,
        player1: seeded[i * 2],
        player2: seeded[i * 2 + 1],
        winner: null,
        status: 'pending'
      });
    }
    this._currentTournament.round = 1;
    this._save.set(`tournaments.${this._currentTournament.id}`, this._currentTournament);
  }

  simulateMatch(matchIdx) {
    const match = this._currentTournament.bracket[matchIdx];
    if (!match || match.status !== 'pending') return;
    // Bot vs bot: higher skill wins (with some randomness)
    // Player vs bot: player wins if skill > bot skill * 0.9, else loses
    const p1 = match.player1;
    const p2 = match.player2;
    let winner;
    if (p1.isPlayer) {
      winner = Math.random() < 0.6 + (1 - (p2.skill || 0.5)) * 0.3 ? p1 : p2;
    } else if (p2.isPlayer) {
      winner = Math.random() < 0.6 + (1 - (p1.skill || 0.5)) * 0.3 ? p2 : p1;
    } else {
      winner = (p1.skill || 0.5) > (p2.skill || 0.5) ? p1 : p2;
    }
    match.winner = winner;
    match.status = 'completed';
    const loser = winner === p1 ? p2 : p1;
    loser.eliminated = true;
    this._save.set(`tournaments.${this._currentTournament.id}`, this._currentTournament);
    EventBus.emit('tournament:matchComplete', { match, winner, loser });
  }

  advanceRound() {
    const completed = this._currentTournament.bracket.filter(m => m.status === 'completed' && m.round === this._currentTournament.round);
    if (completed.length < this._currentTournament.bracket.filter(m => m.round === this._currentTournament.round).length) return;
    const winners = completed.map(m => m.winner);
    if (winners.length === 1) {
      // Tournament over
      this._currentTournament.champion = winners[0];
      EventBus.emit('tournament:complete', { champion: winners[0] });
      return;
    }
    // Create next round
    const nextRound = this._currentTournament.round + 1;
    for (let i = 0; i < winners.length / 2; i++) {
      this._currentTournament.bracket.push({
        round: nextRound,
        match: i + 1,
        player1: winners[i * 2],
        player2: winners[i * 2 + 1],
        winner: null,
        status: 'pending'
      });
    }
    this._currentTournament.round = nextRound;
    this._save.set(`tournaments.${this._currentTournament.id}`, this._currentTournament);
  }

  getCurrentTournament() { return this._currentTournament; }
  getPlayerMatch(playerId) {
    return this._currentTournament?.bracket.find(m => m.status === 'pending' && (m.player1.id === playerId || m.player2.id === playerId));
  }
}

export const tournament = new TournamentSystem();
export default tournament;
