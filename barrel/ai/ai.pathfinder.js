// barrel/ai/ai.pathfinder.js
// Racing line calculation, corner detection, and overtaking zone identification
// Uses A*-inspired algorithm for optimal path generation

import * as THREE from 'three';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const PATHFINDER_CONFIG = {
  // Racing line resolution (points per track segment)
  LINE_RESOLUTION: 200,
  
  // Apex hunting parameters
  APEX_TARGET_OFFSET: 0.25,    // How far toward inside of corner for apex (0-0.5)
  ENTRY_OUTSIDE_OFFSET: 0.35,   // Start corners from outside
  EXIT_OUTSIDE_OFFSET: 0.30,    // End corners on outside
  
  // Corner detection thresholds
  CORNER_MIN_ANGLE: 15,         // Minimum angle change to be considered a corner (degrees)
  CORNER_SAMPLE_DISTANCE: 5,    // Distance between samples for curvature calculation
  
  // Overtaking zone parameters
  OVERTAKE_MIN_STRAIGHT_LENGTH: 20,  // Minimum straight length for overtaking zone
  OVERTAKE_WIDTH_REQUIREMENT: 0.6,   // Track width usage for safe overtake
  
  // Curvature weights for racing line optimization
  CURVATURE_WEIGHT: 0.6,        // Minimize curvature (smoother is better)
  SPEED_WEIGHT: 0.4,            // Maximize speed potential
};

// ============================================================================
// RACING LINE CALCULATION
// ============================================================================

/**
 * Calculate optimal racing line from track spline
 * @param {THREE.CatmullRomCurve3} curve - The track centerline curve
 * @param {number} trackWidth - Width of the track in world units
 * @returns {Array<{x: number, y: number, z: number}>} Array of optimal racing line points
 */
export function calculateRacingLine(curve, trackWidth = 12) {
  if (!curve) {
    console.warn('[AI.Pathfinder] No curve provided for racing line calculation');
    return [];
  }

  const points = [];
  const numPoints = PATHFINDER_CONFIG.LINE_RESOLUTION;
  
  // Sample points along the curve with tangents and normals
  const curveData = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    
    // Calculate normal (perpendicular to tangent in XZ plane)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    
    // Calculate curvature at this point
    const curvature = calculateCurvature(curve, t);
    
    curveData.push({
      point,
      tangent,
      normal,
      curvature,
      t
    });
  }
  
  // Detect corners and their properties
  const corners = detectCornersInternal(curveData);
  
  // Generate racing line by optimizing through corners
  for (let i = 0; i <= numPoints; i++) {
    const data = curveData[i];
    const offset = calculateRacingLineOffset(data, i, corners, curveData, trackWidth);
    
    // Apply offset to get racing line position
    const racingPoint = new THREE.Vector3().copy(data.point);
    racingPoint.addScaledVector(data.normal, offset * trackWidth / 2);
    
    points.push({
      x: racingPoint.x,
      y: racingPoint.y,
      z: racingPoint.z,
      curvature: data.curvature,
      optimalSpeed: calculateOptimalSpeed(data.curvature),
      isCorner: isNearCorner(i, corners, numPoints),
      cornerType: getCornerTypeAtIndex(i, corners, numPoints)
    });
  }
  
  return points;
}

/**
 * Calculate the lateral offset for racing line at a given point
 * Uses apex-hunting logic: outside -> inside (apex) -> outside
 */
function calculateRacingLineOffset(data, index, corners, curveData, trackWidth) {
  // Find if we're in a corner and which phase
  let currentCorner = null;
  let cornerPhase = null; // 'entry', 'apex', 'exit'
  let progressThroughCorner = 0;
  
  for (const corner of corners) {
    if (index >= corner.startIndex && index <= corner.endIndex) {
      currentCorner = corner;
      progressThroughCorner = (index - corner.startIndex) / Math.max(1, corner.endIndex - corner.startIndex);
      
      // Determine phase based on progress
      if (progressThroughCorner < 0.33) {
        cornerPhase = 'entry';
      } else if (progressThroughCorner < 0.67) {
        cornerPhase = 'apex';
      } else {
        cornerPhase = 'exit';
      }
      break;
    }
  }
  
  // If not in a corner, stay near center with slight optimization
  if (!currentCorner) {
    // Check proximity to upcoming or just-finished corner
    const nextCorner = findNextCorner(index, corners, curveData.length);
    const prevCorner = findPreviousCorner(index, corners, curveData.length);
    
    // Approach next corner from outside
    if (nextCorner && (nextCorner.startIndex - index) < 20) {
      const approachProgress = 1 - (nextCorner.startIndex - index) / 20;
      const direction = nextCorner.direction === 'left' ? 1 : -1;
      return direction * PATHFINDER_CONFIG.ENTRY_OUTSIDE_OFFSET * approachProgress;
    }
    
    // Exit previous corner to outside
    if (prevCorner && (index - prevCorner.endIndex) < 15) {
      const exitProgress = (index - prevCorner.endIndex) / 15;
      const direction = prevCorner.direction === 'left' ? -1 : 1;
      return direction * PATHFINDER_CONFIG.EXIT_OUTSIDE_OFFSET * (1 - exitProgress);
    }
    
    // On straight - stay near center (slight offset for variety between laps)
    return 0;
  }
  
  // In a corner - apply racing line logic
  const direction = currentCorner.direction === 'left' ? 1 : -1;
  
  switch (cornerPhase) {
    case 'entry':
      // Start from outside of corner
      return direction * lerp(PATHFINDER_CONFIG.ENTRY_OUTSIDE_OFFSET, PATHFINDER_CONFIG.APEX_TARGET_OFFSET, progressThroughCorner * 3);
      
    case 'apex':
      // Hit the apex (inside of corner)
      return -direction * PATHFINDER_CONFIG.APEX_TARGET_OFFSET;
      
    case 'exit':
      // Exit to outside
      return -direction * lerp(PATHFINDER_CONFIG.APEX_TARGET_OFFSET, PATHFINDER_CONFIG.EXIT_OUTSIDE_OFFSET, (progressThroughCorner - 0.67) * 3);
      
    default:
      return 0;
  }
}

/**
 * Calculate curvature at parameter t on curve
 */
function calculateCurvature(curve, t) {
  const delta = 0.001;
  const p1 = curve.getPoint(Math.max(0, t - delta));
  const p2 = curve.getPoint(t);
  const p3 = curve.getPoint(Math.min(1, t + delta));
  
  // Use Menger curvature approximation for 2D (XZ plane)
  const v1 = { x: p2.x - p1.x, z: p2.z - p1.z };
  const v2 = { x: p3.x - p2.x, z: p3.z - p2.z };
  
  const cross = v1.x * v2.z - v1.z * v2.x;
  const len1 = Math.sqrt(v1.x * v1.x + v1.z * v1.z);
  const len2 = Math.sqrt(v2.x * v2.x + v2.z * v2.z);
  
  if (len1 < 0.0001 || len2 < 0.0001) return 0;
  
  // Return signed curvature (positive = left turn, negative = right turn)
  return (2 * cross) / (len1 * len2 * (len1 + len2));
}

/**
 * Calculate optimal speed for a given curvature
 */
function calculateOptimalSpeed(curvature) {
  const absCurvature = Math.abs(curvature);
  
  // Base max speed and minimum cornering speed
  const maxSpeed = 120; // km/h equivalent
  const minSpeed = 25;  // Hairpin speed
  
  // Speed inversely proportional to curvature
  if (absCurvature < 0.01) return maxSpeed;
  
  const speed = maxSpeed - (absCurvature * 800);
  return Math.max(minSpeed, Math.min(maxSpeed, speed));
}

// ============================================================================
// CORNER DETECTION
// ============================================================================

/**
 * Detect all corners on the track
 * @param {THREE.CatmullRomCurve3} curve - Track curve
 * @returns {Array<Object>} Array of corner data
 */
export function detectCorners(curve) {
  if (!curve) return [];
  
  const numPoints = 100; // Lower resolution for detection
  const curveData = [];
  
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const curvature = calculateCurvature(curve, t);
    
    curveData.push({ point, tangent, curvature, t, index: i });
  }
  
  return detectCornersInternal(curveData.map(d => ({
    ...d,
    startIndex: d.index,
    endIndex: d.index
  })));
}

/**
 * Internal corner detection from pre-computed curve data
 */
function detectCornersInternal(curveData) {
  const corners = [];
  const minAngleRad = PATHFINDER_CONFIG.CORNER_MIN_ANGLE * Math.PI / 180;
  
  let inCorner = false;
  let cornerStart = 0;
  let maxCurvature = 0;
  let totalAngleChange = 0;
  let lastTangent = null;
  
  for (let i = 0; i < curveData.length; i++) {
    const data = curveData[i];
    const absCurvature = Math.abs(data.curvature);
    
    // Check if this point has significant curvature (is part of a corner)
    const isCornerPoint = absCurvature > 0.02;
    
    if (isCornerPoint && !inCorner) {
      // Starting a new corner
      inCorner = true;
      cornerStart = i;
      maxCurvature = absCurvature;
      totalAngleChange = 0;
      lastTangent = data.tangent.clone();
    } else if (isCornerPoint && inCorner) {
      // Continuing through corner
      maxCurvature = Math.max(maxCurvature, absCurvature);
      if (lastTangent) {
        const angleChange = Math.acos(
          Math.max(-1, Math.min(1, lastTangent.dot(data.tangent)))
        );
        totalAngleChange += angleChange;
      }
      lastTangent = data.tangent.clone();
    } else if (!isCornerPoint && inCorner) {
      // Ending a corner
      inCorner = false;
      
      // Only register as corner if significant total angle change
      if (totalAngleChange > minAngleRad) {
        const avgCurvature = calculateAverageCurvature(curveData, cornerStart, i);
        const direction = avgCurvature > 0 ? 'left' : 'right';
        
        corners.push({
          startIndex: cornerStart,
          endIndex: i,
          midpointIndex: Math.floor((cornerStart + i) / 2),
          sharpness: Math.min(1, totalAngleChange / Math.PI), // 0-1 scale
          totalAngle: totalAngleChange,
          direction,
          avgCurvature: avgCurvature,
          maxCurvature,
          // Position at corner entry for reference
          position: {
            x: curveData[cornerStart].point.x,
            y: curveData[cornerStart].point.y,
            z: curveData[cornerStart].point.z
          },
          // Waypoint index (scaled to full resolution)
          waypointIndex: Math.floor(cornerStart / curveData.length * PATHFINDER_CONFIG.LINE_RESOLUTION)
        });
      }
    }
  }
  
  // Handle wrap-around corner (track is closed loop)
  if (inCorner) {
    const i = curveData.length;
    if (totalAngleChange > minAngleRad) {
      const avgCurvature = calculateAverageCurvature(curveData, cornerStart, i);
      const direction = avgCurvature > 0 ? 'left' : 'right';
      
      corners.push({
        startIndex: cornerStart,
        endIndex: i,
        midpointIndex: Math.floor((cornerStart + i) / 2),
        sharpness: Math.min(1, totalAngleChange / Math.PI),
        totalAngle: totalAngleChange,
        direction,
        avgCurvature: avgCurvature,
        maxCurvature,
        position: {
          x: curveData[cornerStart].point.x,
          y: curveData[cornerStart].point.y,
          z: curveData[cornerStart].point.z
        },
        waypointIndex: Math.floor(cornerStart / curveData.length * PATHFINDER_CONFIG.LINE_RESOLUTION)
      });
    }
  }
  
  return corners;
}

/**
 * Calculate average curvature over a range of indices
 */
function calculateAverageCurvature(curveData, start, end) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    sum += curveData[i].curvature;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Classify a corner into specific type
 * @param {Object|string} corner - Corner object or type string
 * @returns {string} Corner classification
 */
export function classifyCorner(corner) {
  // If already a string type, validate and return
  if (typeof corner === 'string') {
    const validTypes = ['hairpin', 'sweeper', 'chicane', 's_curve', 'straight'];
    return validTypes.includes(corner) ? corner : 'straight';
  }
  
  if (!corner) return 'straight';
  
  const sharpness = corner.sharpness || 0;
  const totalAngle = corner.totalAngle || 0;
  const angleDeg = totalAngle * 180 / Math.PI;
  
  // Classification logic
  if (angleDeg > 120) {
    return 'hairpin';      // Very tight U-turn
  } else if (angleDeg > 90) {
    return 'hairpin';      // Sharp corner
  } else if (angleDeg > 45) {
    return 'sweeper';      // Gradual but significant corner
  } else if (angleDeg > 20 && sharpness > 0.4) {
    return 'chicane';      // Quick direction change
  } else if (angleDeg > 15) {
    return 's_curve';      // Gentle curve
  } else {
    return 'straight';     // Barely a corner
  }
}

// ============================================================================
// OVERTAKING ZONE IDENTIFICATION
// ============================================================================

/**
 * Find safe overtaking zones on the track
 * @param {Array} racingLine - Pre-computed racing line points
 * @param {Array} corners - Detected corners
 * @returns {Array<Object>} Array of overtaking zones
 */
export function findOvertakingZones(racingLine, corners) {
  if (!racingLine || racingLine.length === 0) return [];
  
  const zones = [];
  const lineLength = racingLine.length;
  let zoneStart = null;
  let minCurvatureInZone = Infinity;
  
  for (let i = 0; i < lineLength; i++) {
    const point = racingLine[i];
    const curvature = Math.abs(point.curvature || 0);
    const isInCorner = isNearCorner(i, corners, lineLength);
    
    // Check if this is a good overtaking spot (low curvature, not in corner)
    if (!isInCorner && curvature < 0.015) {
      if (zoneStart === null) {
        zoneStart = i;
        minCurvatureInZone = curvature;
      } else {
        minCurvatureInZone = Math.min(minCurvatureInZone, curvature);
      }
    } else {
      // End current zone if we have one
      if (zoneStart !== null) {
        const zoneLength = i - zoneStart;
        if (zoneLength >= PATHFINDER_CONFIG.OVERTAKE_MIN_STRAIGHT_LENGTH) {
          zones.push({
            startIndex: zoneStart,
            endIndex: i,
            length: zoneLength,
            midpointIndex: Math.floor((zoneStart + i) / 2),
            quality: evaluateZoneQuality(zoneLength, minCurvatureInZone, corners, zoneStart, i, lineLength),
            // Position info
            startPosition: racingLine[zoneStart],
            endPosition: racingLine[i],
            midPosition: racingLine[Math.floor((zoneStart + i) / 2)]
          });
        }
        zoneStart = null;
      }
    }
  }
  
  // Handle wrap-around zone
  if (zoneStart !== null) {
    const zoneLength = lineLength - zoneStart;
    if (zoneLength >= PATHFINDER_CONFIG.OVERTAKE_MIN_STRAIGHT_LENGTH) {
      zones.push({
        startIndex: zoneStart,
        endIndex: lineLength,
        length: zoneLength,
        midpointIndex: Math.floor((zoneStart + lineLength) / 2),
        quality: evaluateZoneQuality(zoneLength, minCurvatureInZone, corners, zoneStart, lineLength, lineLength),
        startPosition: racingLine[zoneStart],
        endPosition: racingLine[lineLength - 1],
        midPosition: racingLine[Math.floor((zoneStart + lineLength) / 2)]
      });
    }
  }
  
  // Sort by quality (best zones first)
  zones.sort((a, b) => b.quality - a.quality);
  
  return zones;
}

/**
 * Evaluate the quality of an overtaking zone
 * Higher score = better overtaking opportunity
 */
function evaluateZoneQuality(length, minCurvature, corners, startIdx, endIdx, totalLength) {
  let score = 0;
  
  // Length bonus (longer straights are better)
  score += Math.min(length / 50, 1) * 40;
  
  // Straightness bonus (lower curvature is better)
  score += (1 - Math.min(minCurvature * 20, 1)) * 30;
  
  // Exit corner bonus (zones exiting corners are prime overtaking spots)
  const exitCorner = findPreviousCorner(startIdx, corners, totalLength);
  if (exitCorner && (startIdx - exitCorner.endIndex) < 30) {
    score += 20; // Good acceleration zone after corner
    
    // Extra bonus if it's a slow corner (more overtaking potential)
    if (exitCorner.sharpness > 0.5) {
      score += 10;
    }
  }
  
  // Entry corner penalty (zones before corners are risky for overtaking)
  const entryCorner = findNextCorner(endIdx, corners, totalLength);
  if (entryCorner && (entryCorner.startIndex - endIdx) < 20) {
    score -= 10; // Need to brake soon after overtake
  }
  
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if an index is near a corner
 */
function isNearCorner(index, corners, totalIndices) {
  const threshold = 10; // indices
  for (const corner of corners) {
    const start = Math.floor(corner.startIndex / 100 * totalIndices);
    const end = Math.floor(corner.endIndex / 100 * totalIndices);
    if (index >= start - threshold && index <= end + threshold) {
      return true;
    }
  }
  return false;
}

/**
 * Get corner type at a specific index
 */
function getCornerTypeAtIndex(index, corners, totalIndices) {
  for (const corner of corners) {
    const start = Math.floor(corner.startIndex / 100 * totalIndices);
    const end = Math.floor(corner.endIndex / 100 * totalIndices);
    if (index >= start && index <= end) {
      return classifyCorner(corner);
    }
  }
  return 'straight';
}

/**
 * Find the next corner after an index
 */
function findNextCorner(index, corners, totalLength) {
  let best = null;
  let bestDist = Infinity;
  
  for (const corner of corners) {
    const cornerIdx = Math.floor(corner.startIndex / 100 * totalLength);
    let dist = cornerIdx - index;
    if (dist < 0) dist += totalLength; // Wrap around
    
    if (dist < bestDist) {
      bestDist = dist;
      best = corner;
    }
  }
  
  return best;
}

/**
 * Find the previous corner before an index
 */
function findPreviousCorner(index, corners, totalLength) {
  let best = null;
  let bestDist = Infinity;
  
  for (const corner of corners) {
    const cornerIdx = Math.floor(corner.endIndex / 100 * totalLength);
    let dist = index - cornerIdx;
    if (dist < 0) dist += totalLength; // Wrap around
    
    if (dist < bestDist) {
      bestDist = dist;
      best = corner;
    }
  }
  
  return best;
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Calculate distance between two 3D points (XZ plane only)
 */
export function distanceXZ(p1, p2) {
  const dx = p2.x - p1.x;
  const dz = (p2.z || 0) - (p1.z || 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Get point on racing line at given progress (0-1)
 */
export function getRacingLinePoint(racingLine, progress) {
  if (!racingLine || racingLine.length === 0) return null;
  
  const index = ((progress % 1 + 1) % 1) * (racingLine.length - 1);
  const i = Math.floor(index);
  const t = index - i;
  
  const p1 = racingLine[i];
  const p2 = racingLine[(i + 1) % racingLine.length];
  
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
    z: p1.z + (p2.z - p1.z) * t
  };
}

/**
 * Find the nearest point on racing line to a given position
 */
export function projectToRacingLine(racingLine, position) {
  if (!racingLine || racingLine.length === 0) return { index: 0, distance: 0, point: null };
  
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  
  for (let i = 0; i < racingLine.length; i++) {
    const point = racingLine[i];
    const dx = point.x - position.x;
    const dz = point.z - position.z;
    const dist = dx * dx + dz * dz; // Squared for comparison
    
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestIndex = i;
    }
  }
  
  return {
    index: nearestIndex,
    distance: Math.sqrt(nearestDistance),
    point: racingLine[nearestIndex],
    progress: nearestIndex / racingLine.length
  };
}

// Export all functions for external use
export default {
  calculateRacingLine,
  findOvertakingZones,
  detectCorners,
  classifyCorner,
  getRacingLinePoint,
  projectToRacingLine,
  distanceXZ
};
