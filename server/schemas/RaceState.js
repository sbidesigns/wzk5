// server/schemas/RaceState.js — Colyseus state schema for race room
// Auto-syncs to all clients at patch rate.

import { Schema, MapSchema, type } from '@colyseus/schema';

class Vec3 extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
}

class Quaternion extends Schema {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') w = 1;
}

class Player extends Schema {
  @type('string') id;
  @type('string') name;
  @type('string') vehicleId;
  @type('string') characterId;
  @type(Vec3) position = new Vec3();
  @type(Quaternion) rotation = new Quaternion();
  @type(Vec3) velocity = new Vec3();
  @type('number') speedKmh = 0;
  @type('boolean') ready = false;
  @type('int32') lap = 0;
  @type('int32') checkpoint = 0;
  @type('boolean') finished = false;
  @type('number') finishTime = 0;
  @type('boolean') isBot = false;
  @type('int32') ping = 0;
  @type('int32') inputSequence = 0;
}

export class RaceState extends Schema {
  @type('string') trackId;
  @type('string') modeId;
  @type('string') phase = 'waiting'; // waiting, countdown, racing, finished
  @type('int32') countdown = 3;
  @type('number') raceTime = 0;
  @type('number') raceStartTime = 0;
  @type({ map: Player }) players = new MapSchema();
}
