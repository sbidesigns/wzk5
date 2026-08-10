// server/auth/AuthService.js — AAA Authentication Service
// Provides JWT token generation/validation, password hashing, OAuth2 abstraction,
// player account management, and session handling for WZK5 game server.
//
// Features:
// - JWT access tokens (15min) and refresh tokens (7d)
// - bcrypt password hashing with salt rounds
// - OAuth2 provider abstraction (Google, Discord, Steam)
// - Session management with Redis backing
// - Token refresh rotation
//
// @module auth/AuthService

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load server configuration
 * @private
 */
function loadConfig() {
  try {
    const configPath = join(__dirname, '../config/gameServer.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.jwt || {
      secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
      expiresIn: '15m',
      refreshExpiresIn: '7d'
    };
  } catch {
    return {
      secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION',
      expiresIn: '15m',
      refreshExpiresIn: '7d'
    };
  }
}

const JWT_CONFIG = loadConfig();

/**
 * Redis client for session storage
 * @type {Redis}
 * @private
 */
let _redis = null;

/**
 * Initialize Redis connection for session storage
 * @param {string} [redisUrl] - Redis connection URL
 * @returns {Promise<void>}
 */
export async function initAuthRedis(redisUrl) {
  if (!_redis) {
    _redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    _redis.on('error', (err) => console.error('[AuthService] Redis error:', err.message));
  }
}

/**
 * Get Redis instance
 * @returns {Redis}
 * @private
 */
function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return _redis;
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Create a JWT access token for authenticated user
 * 
 * @param {Object} payload - User data to encode in token
 * @param {string} payload.playerId - Unique player identifier
 * @param {string} payload.name - Player display name
 * @param {string} [payload.role] - User role (player, moderator, admin)
 * @param {number} [payload.level] - Player level
 * @param {Object} [options] - Token options override
 * @returns {string} Signed JWT token
 * 
 * @example
 * const token = createToken({ playerId: 'abc123', name: 'SpeedRacer', role: 'player' });
 */
export function createToken(payload, options = {}) {
  const tokenPayload = {
    jti: uuidv4(), // Unique token ID for revocation tracking
    iat: Math.floor(Date.now() / 1000),
    ...payload
  };

  return jwt.sign(tokenPayload, JWT_CONFIG.secret, {
    expiresIn: options.expiresIn || JWT_CONFIG.expiresIn,
    issuer: 'wzk5-server',
    audience: 'wzk5-client'
  });
}

/**
 * Create a refresh token for token renewal
 * Refresh tokens have longer expiry and are stored in Redis for revocation
 * 
 * @param {string} playerId - Player identifier
 * @returns {Promise<string>} Refresh token string
 */
export async function createRefreshToken(playerId) {
  const tokenId = uuidv4();
  const refreshToken = jwt.sign(
    { playerId, jti: tokenId, type: 'refresh' },
    JWT_CONFIG.secret,
    { expiresIn: JWT_CONFIG.refreshExpiresIn }
  );

  // Store in Redis for revocation support
  const redis = getRedis();
  await redis.setex(
    `wzk5:refresh:${tokenId}`,
    7 * 24 * 60 * 60, // 7 days in seconds
    playerId
  );

  return refreshToken;
}

/**
 * Verify and decode a JWT access token
 * 
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 * 
 * @example
 * const user = verifyToken(token);
 * if (user) { console.log('Authenticated:', user.name); }
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.secret, {
      issuer: 'wzk5-server',
      audience: 'wzk5-client'
    });
    return decoded;
  } catch (error) {
    // Log specific error types for debugging
    if (error.name === 'TokenExpiredError') {
      console.log('[AuthService] Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      console.warn('[AuthService] Invalid token:', error.message);
    }
    return null;
  }
}

/**
 * Verify a refresh token and check against Redis store
 * 
 * @param {string} token - Refresh token to verify
 * @returns {Promise<Object|null>} Decoded payload or null if invalid/revoked
 */
export async function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_CONFIG.secret);
    
    if (decoded.type !== 'refresh') {
      console.warn('[AuthService] Non-refresh token used as refresh');
      return null;
    }

    // Check if token is still valid in Redis (not revoked)
    const redis = getRedis();
    const storedPlayerId = await redis.get(`wzk5:refresh:${decoded.jti}`);
    
    if (!storedPlayerId || storedPlayerId !== decoded.playerId) {
      console.warn('[AuthService] Revoked or invalid refresh token');
      return null;
    }

    return decoded;
  } catch (error) {
    console.warn('[AuthService] Refresh token verification failed:', error.message);
    return null;
  }
}

/**
 * Revoke a refresh token (logout)
 * 
 * @param {string} tokenId - Token JTI to revoke
 * @returns {Promise<boolean>} True if revoked successfully
 */
export async function revokeRefreshToken(tokenId) {
  try {
    const redis = getRedis();
    const result = await redis.del(`wzk5:refresh:${tokenId}`);
    return result > 0;
  } catch (error) {
    console.error('[AuthService] Error revoking token:', error.message);
    return false;
  }
}

/**
 * Revoke all refresh tokens for a player (full logout)
 * 
 * @param {string} playerId - Player whose sessions to revoke
 * @returns {Promise<number>} Number of tokens revoked
 */
export async function revokeAllPlayerTokens(playerId) {
  try {
    const redis = getRedis();
    const pattern = `wzk5:refresh:*`;
    const keys = await redis.keys(pattern);
    let revoked = 0;

    for (const key of keys) {
      const storedId = await redis.get(key);
      if (storedId === playerId) {
        await redis.del(key);
        revoked++;
      }
    }

    return revoked;
  } catch (error) {
    console.error('[AuthService] Error revoking player tokens:', error.message);
    return 0;
  }
}

// ============================================================================
// PASSWORD MANAGEMENT
// ============================================================================

/**
 * Hash a plaintext password using bcrypt
 * 
 * @param {string} password - Plain text password
 * @param {number} [saltRounds=12] - Bcrypt salt rounds (higher = more secure but slower)
 * @returns {Promise<string>} Hashed password
 * 
 * @example
 * const hash = await hashPassword('MySecurePass123!');
 */
export async function hashPassword(password, saltRounds = 12) {
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('[AuthService] Password hashing failed:', error.message);
    throw new Error('Password hashing failed');
  }
}

/**
 * Compare a plaintext password against a stored hash
 * 
 * @param {string} password - Plain text password to check
 * @param {string} hashedPassword - Stored bcrypt hash
 * @returns {Promise<boolean>} True if passwords match
 * 
 * @example
 * const isValid = await comparePassword(input, storedHash);
 */
export async function comparePassword(password, hashedPassword) {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('[AuthService] Password comparison failed:', error.message);
    return false;
  }
}

// ============================================================================
// ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Validate password strength requirements
 * @private
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with valid flag and errors array
 */
function validatePasswordStrength(password) {
  const errors = [];
  
  if (password.length < 8) errors.push('Password must be at least 8 characters');
  if (password.length > 128) errors.push('Password must be less than 128 characters');
  if (!/[a-z]/.test(password)) errors.push('Password must contain lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain number');
  if (![^a-zA-Z0-9]/.test(password)) errors.push('Password must contain special character');

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate username format
 * @private
 * @param {string} username - Username to validate
 * @returns {Object} Validation result
 */
function validateUsername(username) {
  const errors = [];
  
  if (!username || username.length < 3) errors.push('Username must be at least 3 characters');
  if (username.length > 20) errors.push('Username must be less than 20 characters');
  if (!/^[a-zA-Z0-9_]+$/.test(username)) errors.push('Username can only contain letters, numbers, and underscores');
  if (/^\d+$/.test(username)) errors.push('Username cannot be only numbers');

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create a new player account
 * 
 * @param {Object} accountData - Account information
 * @param {string} accountData.username - Desired username
 * @param {string} accountData.password - Plain text password
 * @param {string} [accountData.email] - Email address (optional)
 * @param {string} [accountData.displayName] - Display name (defaults to username)
 * @param {Redis} [redis] - Redis instance (uses default if not provided)
 * @returns {Promise<Object>} Created account data with tokens
 * @throws {Error} If validation fails or username exists
 * 
 * @example
 * const result = await createAccount({
 *   username: 'speedracer99',
 *   password: 'SecurePass123!',
 *   email: 'player@example.com'
 * });
 */
export async function createAccount(accountData, redis) {
  const r = redis || getRedis();
  const { username, password, email, displayName } = accountData;

  // Validate inputs
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    throw new Error(`Invalid username: ${usernameValidation.errors.join(', ')}`);
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    throw new Error(`Weak password: ${passwordValidation.errors.join(', ')}`);
  }

  // Check if username already exists
  const existingAccount = await r.hgetall(`wzk5:account:${username.toLowerCase()}`);
  if (existingAccount && Object.keys(existingAccount).length > 0) {
    throw new Error('Username already exists');
  }

  // Check if email already registered (if provided)
  if (email) {
    const emailExists = await r.get(`wzk5:email:${email.toLowerCase()}`);
    if (emailExists) {
      throw new Error('Email already registered');
    }
  }

  // Generate player ID and hash password
  const playerId = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  // Store account data
  const accountKey = `wzk5:account:${username.toLowerCase()}`;
  await r.hset(accountKey, {
    playerId,
    username: username.toLowerCase(),
    displayName: displayName || username,
    email: email || '',
    passwordHash,
    role: 'player',
    createdAt: now,
    lastLogin: now,
    loginCount: '0',
    isBanned: 'false',
    banReason: ''
  });

  // Index by email if provided
  if (email) {
    await r.set(`wzk5:email:${email.toLowerCase()}`, playerId);
  }

  // Index playerId -> username mapping
  await r.set(`wzk5:playerid:${playerId}`, username.toLowerCase());

  // Log account creation
  console.log(`[AuthService] Account created: ${username} (${playerId})`);

  // Generate authentication tokens
  const accessToken = createToken({
    playerId,
    name: displayName || username,
    role: 'player'
  });
  const refreshToken = await createRefreshToken(playerId);

  return {
    success: true,
    playerId,
    username: username.toLowerCase(),
    displayName: displayName || username,
    accessToken,
    refreshToken,
    createdAt: now
  };
}

/**
 * Authenticate a player with username/password
 * 
 * @param {string} username - Player username
 * @param {string} password - Plain text password
 * @returns {Promise<Object>} Login result with tokens and user data
 * @throws {Error} If credentials are invalid or account is banned
 * 
 * @example
 * const session = await login('speedracer99', 'SecurePass123!');
 * console.log(session.accessToken);
 */
export async function login(username, password) {
  const r = getRedis();

  // Fetch account
  const accountKey = `wzk5:account:${username.toLowerCase()}`;
  const account = await r.hgetall(accountKey);

  if (!account || Object.keys(account).length === 0) {
    throw new Error('Invalid username or password');
  }

  // Check if banned
  if (account.isBanned === 'true') {
    console.warn(`[AuthService] Banned user login attempt: ${username}`);
    throw new Error(`Account suspended: ${account.banReason || 'Contact support'}`);
  }

  // Verify password
  const isValid = await comparePassword(password, account.passwordHash);
  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  // Update last login stats
  const now = new Date().toISOString();
  const loginCount = parseInt(account.loginCount || '0') + 1;
  await r.hset(accountKey, {
    lastLogin: now,
    loginCount: loginCount.toString()
  });

  // Generate tokens
  const accessToken = createToken({
    playerId: account.playerId,
    name: account.displayName || account.username,
    role: account.role || 'player',
    level: parseInt(account.level || '1')
  });
  const refreshToken = await createRefreshToken(account.playerId);

  console.log(`[AuthService] User logged in: ${username}`);

  return {
    success: true,
    playerId: account.playerId,
    username: account.username,
    displayName: account.displayName || account.username,
    role: account.role || 'player',
    level: parseInt(account.level || '1'),
    accessToken,
    refreshToken,
    lastLogin: now,
    loginCount
  };
}

/**
 * Refresh an expired access token using a valid refresh token
 * 
 * @param {string} refreshTokenString - Current refresh token
 * @returns {Promise<Object>} New token pair
 * @throws {Error} If refresh token is invalid
 */
export async function refreshAccessToken(refreshTokenString) {
  const decoded = await verifyRefreshToken(refreshTokenString);
  
  if (!decoded) {
    throw new Error('Invalid or expired refresh token');
  }

  // Get current user data
  const r = getRedis();
  const username = await r.get(`wzk5:playerid:${decoded.playerId}`);
  
  if (!username) {
    throw new Error('User not found');
  }

  const account = await r.hgetall(`wzk5:account:${username}`);

  // Revoke old refresh token
  await revokeRefreshToken(decoded.jti);

  // Generate new token pair (token rotation)
  const newAccessToken = createToken({
    playerId: account.playerId,
    name: account.displayName || account.username,
    role: account.role || 'player',
    level: parseInt(account.level || '1')
  });
  const newRefreshToken = await createRefreshToken(decoded.playerId);

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  };
}

// ============================================================================
// OAUTH2 PROVIDER ABSTRACTION
// ============================================================================

/**
 * Supported OAuth2 providers configuration
 * @type {Object.<string, Object>}
 * @private
 */
const OAUTH_PROVIDERS = {
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['profile', 'email']
  },
  discord: {
    authorizationUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email']
  },
  steam: {
    // Steam uses OpenID, not standard OAuth2
    authorizationUrl: 'https://steamcommunity.com/openid/login',
    // Token exchange handled differently for Steam
    scopes: []
  }
};

/**
 * Get OAuth2 provider configuration
 * 
 * @param {string} provider - Provider name ('google', 'discord', 'steam')
 * @returns {Object|null} Provider config or null if unsupported
 */
export function getOAuthProvider(provider) {
  return OAUTH_PROVIDERS[provider.toLowerCase()] || null;
}

/**
 * Get OAuth2 authorization URL for redirect
 * 
 * @param {string} provider - Provider name
 * @param {string} state - CSRF protection state parameter
 * @param {string} redirectUri - Post-auth redirect URI
 * @returns {string|null} Authorization URL or null if unsupported
 */
export function getOAuthAuthorizationUrl(provider, state, redirectUri) {
  const config = getOAuthProvider(provider);
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`] || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: state
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange OAuth2 code for user info and create/link account
 * 
 * @param {string} provider - Provider name
 * @param {string} code - Authorization code from callback
 * @param {string} redirectUri - Redirect URI used in initial request
 * @returns {Promise<Object>} User data with auth tokens
 * @throws {Error} If exchange fails
 */
async function exchangeOAuthCode(provider, code, redirectUri) {
  const config = getOAuthProvider(provider);
  if (!config) throw new Error(`Unsupported OAuth provider: ${provider}`);

  // This would make HTTP requests to provider APIs
  // Simplified implementation - in production use proper HTTP client
  console.log(`[AuthService] OAuth exchange for ${provider}`);
  
  // Placeholder - actual implementation would:
  // 1. POST to tokenUrl with code + client_secret
  // 2. GET userInfoUrl with access_token
  // 3. Return normalized user info
  
  throw new Error('OAuth exchange not fully implemented - requires HTTP client setup');
}

/**
 * Link OAuth identity to existing account
 * 
 * @param {string} playerId - Player ID to link
 * @param {string} provider - Provider name
 * @param {string} providerUserId - Provider's user ID
 * @returns {Promise<boolean>} True if linked successfully
 */
export async function linkOAuthAccount(playerId, provider, providerUserId) {
  try {
    const r = getRedis();
    const key = `wzk5:oauth:${provider}:${providerUserId}`;
    
    // Check if already linked to another account
    const existingPlayerId = await r.get(key);
    if (existingPlayerId && existingPlayerId !== playerId) {
      throw new Error('This OAuth account is already linked to another user');
    }

    await r.set(key, playerId);
    await r.sadd(`wzk5:oauth:${playerId}`, `${provider}:${providerUserId}`);
    
    console.log(`[AuthService] Linked ${provider} account for player ${playerId}`);
    return true;
  } catch (error) {
    console.error('[AuthService] OAuth link failed:', error.message);
    throw error;
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new player session
 * 
 * @param {string} playerId - Player identifier
 * @param {Object} sessionData - Additional session data
 * @param {string} [sessionData.ipAddress] - Client IP address
 * @param {string} [sessionData.userAgent] - Client user agent
 * @param {string} [sessionData.deviceFingerprint] - Hardware fingerprint
 * @returns {Promise<string>} Session ID
 */
export async function createSession(playerId, sessionData = {}) {
  const r = getRedis();
  const sessionId = uuidv4();
  const sessionKey = `wzk5:session:${sessionId}`;
  const now = Date.now();

  const session = {
    playerId,
    sessionId,
    ipAddress: sessionData.ipAddress || '',
    userAgent: sessionData.userAgent || '',
    deviceFingerprint: sessionData.deviceFingerprint || '',
    createdAt: now,
    lastActivity: now,
    isActive: true
  };

  await r.hset(sessionKey, ...Object.entries(session).flat());
  await r.expire(sessionKey, 7 * 24 * 60 * 60); // 7 day expiry

  // Add to player's active sessions
  await r.sadd(`wzk5:sessions:${playerId}`, sessionId);

  console.log(`[AuthService] Session created: ${sessionId} for player ${playerId}`);
  return sessionId;
}

/**
 * Validate and update session activity
 * 
 * @param {string} sessionId - Session ID to validate
 * @returns {Promise<Object|null>} Session data or null if invalid
 */
export async function validateSession(sessionId) {
  const r = getRedis();
  const sessionKey = `wzk5:session:${sessionId}`;
  const session = await r.hgetall(sessionKey);

  if (!session || Object.keys(session).length === 0) {
    return null;
  }

  if (session.isActive !== 'true') {
    return null;
  }

  // Update last activity
  await r.hset(sessionKey, 'lastActivity', Date.now());

  return session;
}

/**
 * Destroy a session (logout)
 * 
 * @param {string} sessionId - Session to destroy
 * @returns {Promise<boolean>} True if destroyed
 */
export async function destroySession(sessionId) {
  const r = getRedis();
  const sessionKey = `wzk5:session:${sessionId}`;
  const session = await r.hgetall(sessionKey);

  if (!session || Object.keys(session).length === 0) {
    return false;
  }

  // Remove from player's sessions set
  await r.srem(`wzk5:sessions:${session.playerId}`, sessionId);
  
  // Delete session data
  await r.del(sessionKey);

  console.log(`[AuthService] Session destroyed: ${sessionId}`);
  return true;
}

/**
 * Get all active sessions for a player
 * 
 * @param {string} playerId - Player ID
 * @returns {Promise<Array<Object>>} Array of session objects
 */
export async function getPlayerSessions(playerId) {
  const r = getRedis();
  const sessionIds = await r.smembers(`wzk5:sessions:${playerId}`);
  const sessions = [];

  for (const sessionId of sessionIds) {
    const session = await r.hgetall(`wzk5:session:${sessionId}`);
    if (session && session.isActive === 'true') {
      sessions.push(session);
    }
  }

  return sessions;
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================

/**
 * @namespace AuthService
 * @description Complete authentication service for WZK5 game server
 * 
 * Token Management:
 * - createToken(payload, options?) - Create JWT access token
 * - createRefreshToken(playerId) - Create refresh token
 * - verifyToken(token) - Verify access token
 * - verifyRefreshToken(token) - Verify refresh token
 * - revokeRefreshToken(tokenId) - Revoke single refresh token
 * - revokeAllPlayerTokens(playerId) - Revoke all player tokens
 * 
 * Password Management:
 * - hashPassword(password, saltRounds?) - Hash password
 * - comparePassword(password, hash) - Compare password
 * 
 * Account Management:
 * - createAccount(data) - Create new account
 * - login(username, password) - Authenticate user
 * - refreshAccessToken(refreshToken) - Renew tokens
 * 
 * OAuth2:
 * - getOAuthProvider(provider) - Get provider config
 * - getOAuthAuthorizationUrl(provider, state, redirectUri) - Get auth URL
 * - linkOAuthAccount(playerId, provider, providerUserId) - Link OAuth
 * 
 * Sessions:
 * - createSession(playerId, data) - Create session
 * - validateSession(sessionId) - Validate session
 * - destroySession(sessionId) - Destroy session
 * - getPlayerSessions(playerId) - Get player sessions
 */

export default {
  createToken,
  verifyToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllPlayerTokens,
  hashPassword,
  comparePassword,
  createAccount,
  login,
  refreshAccessToken,
  getOAuthProvider,
  getOAuthAuthorizationUrl,
  linkOAuthAccount,
  createSession,
  validateSession,
  destroySession,
  getPlayerSessions,
  initAuthRedis
};
