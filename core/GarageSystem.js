// core/GarageSystem.js
// Applies equipped parts to a vehicle's tuning profile.
// Each part has statMods — multipliers on the base profile values.
// Multiple parts in different slots stack multiplicatively.

class GarageSystem {
  constructor() {
    this._save = null;
    this._partsCatalog = null;
  }

  init(saveSystem, partsCatalog) {
    this._save = saveSystem;
    this._partsCatalog = partsCatalog || [];
  }

  setPartsCatalog(catalog) {
    this._partsCatalog = catalog;
  }

  getPart(partId) {
    return this._partsCatalog?.find(p => p.id === partId);
  }

  getPartsBySlot(slot) {
    return this._partsCatalog?.filter(p => p.slot === slot) || [];
  }

  getPartsByTier(tier) {
    return this._partsCatalog?.filter(p => p.tier === tier) || [];
  }

  getOwnedParts() {
    return this._save?.get('unlocks.parts') || [];
  }

  isOwned(partId) {
    return this.getOwnedParts().includes(partId);
  }

  buyPart(partId) {
    const part = this.getPart(partId);
    if (!part) return { ok: false, error: 'Part not found' };
    if (this.isOwned(partId)) return { ok: false, error: 'Already owned' };
    const credits = this._save.get('progression.credits') || 0;
    if (credits < part.price) return { ok: false, error: 'Insufficient credits' };
    this._save.set('progression.credits', credits - part.price);
    this._save.update('unlocks.parts', owned => [...(owned || []), partId]);
    return { ok: true, part };
  }

  equipPart(vehicleId, partId) {
    const part = this.getPart(partId);
    if (!part) return { ok: false, error: 'Part not found' };
    if (!this.isOwned(partId)) return { ok: false, error: 'Not owned' };
    const key = `garage.equippedParts.${vehicleId}.${part.slot}`;
    this._save.set(key, partId);
    return { ok: true, part };
  }

  unequipPart(vehicleId, slot) {
    const key = `garage.equippedParts.${vehicleId}.${slot}`;
    this._save.set(key, null);
  }

  getEquippedParts(vehicleId) {
    const equipped = this._save?.get(`garage.equippedParts.${vehicleId}`) || {};
    return equipped;
  }

  // Returns a modified tuning profile with all equipped parts applied
  applyPartsToProfile(vehicleId, baseProfile) {
    const equipped = this.getEquippedParts(vehicleId);
    const modified = { ...baseProfile };
    for (const [slot, partId] of Object.entries(equipped)) {
      if (!partId) continue;
      const part = this.getPart(partId);
      if (!part?.statMods) continue;
      for (const [key, mult] of Object.entries(part.statMods)) {
        if (typeof mult === 'number' && typeof modified[key] === 'number') {
          modified[key] *= mult;
        }
      }
    }
    return modified;
  }

  // Preview stat changes from equipping a part (without saving)
  previewStatChange(vehicleId, partId, baseProfile) {
    const part = this.getPart(partId);
    if (!part) return null;
    const current = this.applyPartsToProfile(vehicleId, baseProfile);
    const withNew = { ...current };
    // Replace the part in its slot
    for (const [key, mult] of Object.entries(part.statMods || {})) {
      if (typeof mult === 'number' && typeof withNew[key] === 'number') {
        withNew[key] *= mult;
      }
    }
    return { before: current, after: withNew, part };
  }

  setPaint(vehicleId, color) {
    this._save.set(`garage.paint.${vehicleId}`, color);
  }

  getPaint(vehicleId) {
    return this._save?.get(`garage.paint.${vehicleId}`);
  }
}

export const garage = new GarageSystem();
export default garage;
