// server/server.js — Colyseus multiplayer server for WZK5
// Run: node server/server.js (requires 'colyseus' and '@colyseus/core' installed)
// Deploy to Railway/Fly.io/Render for production.
//
// This is the authoritative server for online races (8-16 players per room).
// Client connects via NetworkManager.js, sends inputs, receives state patches at 20Hz.

import { Server } from 'colyseus';
import { createServer } from 'http';
import express from 'express';
import { RaceRoom } from './rooms/RaceRoom.js';
import { LobbyRoom } from './rooms/LobbyRoom.js';
import { HubRoom } from './rooms/HubRoom.js';

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 8080;

// Colyseus server
const gameServer = new Server({
  server: httpServer,
  express: app
});

// Define rooms
gameServer.define('lobby', LobbyRoom);
gameServer.define('race', RaceRoom);
gameServer.define('hub', HubRoom);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), rooms: gameServer.rooms.size });
});

// Matchmaking endpoint
app.post('/matchmake', (req, res) => {
  // Find or create a race room with available slots
  // Returns room ID for client to join
  res.json({ matchmaking: 'placeholder' });
});

// Start server
gameServer.listen(port).then(() => {
  console.log(`[WZK5 Server] Listening on port ${port}`);
  console.log(`[WZK5 Server] Rooms: lobby, race, hub`);
  console.log(`[WZK5 Server] Health: http://localhost:${port}/health`);
});

export { gameServer };
