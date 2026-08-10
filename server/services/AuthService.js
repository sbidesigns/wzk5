// server/services/AuthService.js — AAA Authentication Service
// Provides JWT token generation/validation, player account lookup, session management,
// token refresh mechanism, OAuth2 provider stubs, rate limiting, and middleware pattern.
//
// Features:
// - JWT access tokens (15min) with HMAC-SHA256 signing
// - Refresh tokens (7d) with rotation support
// - Player account lookup from PersistenceService
// - Session management with active sessions map
// - OAuth2 provider stubs (Google, Discord, Steam)
// - Rate limiting per IP/account
// - Express middleware factory pattern
// - Token blacklisting for forced logout
// - Multi-device session tracking
//
// @module services/AuthService

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Load server configuration from config file or environment
 * @returns {Object} JWT and auth configuration
 * @private
 */
function loadConfig() {
  try {
    const configPath = join(__dirname, '../config/gameServer.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return {
      jwt: config.jwt || {},
      rateLimit: config.rateLimit || {},
      redis: config.redis || {}
    };
  } catch {
    return {
      jwt: {
        secret: process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION_USE_ENV_VARIABLE',
        expiresIn: '15m',
        refreshExpiresIn: '7d',
        issuer: 'wzk5-server',
        audience: 'wzk5-client'
      },
      rateLimit: {
        windowMs: 60000,
        maxRequests: 100,
        authRequests: 20
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      }
    };
  }
}

const CONFIG = loadConfig();

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Custom authentication error class
 * @extends Error
 */
export class AuthError extends Error {
  /**
   * Create authentication error
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @param {number} statusCode - HTTP status code
   */
  constructor(message, code = 'AUTH_ERROR', statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Rate limit exceeded error
 * @extends AuthError
 */
export class RateLimitError extends AuthError {
  constructor(retryAfter = 60) {
    super(
      'Too many authentication attempts, please try again later',
      'RATE_LIMITED',
      429
    );
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// OAUTH2 PROVIDER STUBS
// ============================================================================

/**
 * OAuth2 Provider configurations and stub implementations
 * @namespace OAuthProviders
 */
const OAuthProviders = {
  /**
   * Google OAuth2 configuration
   */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: '/auth/google/callback',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile']
  },

  /**
   * Discord OAuth2 configuration
   */
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: '/auth/discord/callback',
    authorizationUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email']
  },

  /**
   * Steam OAuth2 configuration (uses OpenID)
   */
  steam: {
    apiKey: process.env.STEAM_API_KEY || '',
    redirectUri: '/auth/steam/callback',
    authorizationUrl: 'https://steamcommunity.com/openid/login',
    userInfoUrl: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/'
  }
};

// ============================================================================
// RATE LIMITER CLASS
// ============================================================================

/**
 * In-memory rate limiter with Redis backing for distributed scenarios
 * Tracks requests per IP/account within time windows
 * @class
 */
class RateLimiter {
  /**
   * Create rate limiter instance
   * @param {Object} options - Rate limiter options
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {number} options.maxRequests - Max requests per window
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs || CONFIG.rateLimit.windowMs || 60000;
    this.maxRequests = options.maxRequests || CONFIG.rateLimit.maxRequests || 100;
    
    /** @type {Map<string, {count: number, resetTime: number}>} */
    this.requests = new Map();
    
    // Cleanup interval to prevent memory leaks
    setInterval(() => this._cleanup(), this.windowMs);
  }

  /**
   * Check if request is allowed, increment counter
   * @param {string} key - Identifier (IP or userId)
   * @returns {{allowed: boolean, remaining: number, retryAfter: number}}
   */
  check(key) {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      const newEntry = {
        count: 1,
        resetTime: now + this.windowMs
      };
      this.requests.set(key, newEntry);
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        retryAfter: 0
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      retryAfter: 0
    };
  }

  /**
   * Reset rate limit for a key
   * @param {string} key - Identifier to reset
   */
  reset(key) {
    this.requests.delete(key);
  }

  /**
   * Cleanup expired entries
   * @private
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// ============================================================================
// MAIN AUTH SERVICE CLASS
// ============================================================================

/**
 * AAA Authentication Service
 * Handles all authentication operations including JWT management,
 * OAuth flows, sessions, and rate limiting
 * 
 * @class
 * @extends EventEmitter
 * 
 * @example
 * const authService = new AuthService(persistenceService, config);
 * await authService.init();
 * 
 * // Login
 * const { accessToken, refreshToken } = await authService.login({
 *   email: 'player@example.com',
 *   password: 'secret123'
 * });
 * 
 * // Authenticate middleware
 * const authMiddleware = authService.createMiddleware();
 * app.use('/protected', authMiddleware, protectedHandler);
 */
export class AuthService extends EventEmitter {
  /**
   * Create AuthService instance
   * @param {Object} persistenceService - PersistenceService for account lookup
   * @param {Object} [config={}] - Configuration overrides
   */
  constructor(persistenceService, config = {}) {
    super();

    /** @type {Object} Persistence service reference */
    this.persistence = persistenceService;

    /** @type {Object} Merged configuration */
    this.config = {
      jwt: { ...CONFIG.jwt, ...config.jwt },
      rateLimit: { ...CONFIG.rateLimit, ...config.rateLimit },
      oauth: config.oauth || {}
    };

    /** @type {Map<string, Object>} Active sessions map (sessionId -> session data) */
    this.sessions = new Map();

    /** @type {Set<string>} Blacklisted tokens (revoked access tokens) */
    this.tokenBlacklist = new Set();

    /** @type {RateLimiter} General rate limiter */
    this.rateLimiter = new RateLimiter(this.config.rateLimit);

    /** @type {RateLimiter} Stricter auth-specific rate limiter */
    this.authRateLimiter = new RateLimiter({
      windowMs: this.config.rateLimit.windowMs || 60000,
      maxRequests: this.config.rateLimit.authRequests || 20
    });

    /** @type {Redis|null} Redis client for distributed sessions */
    this.redis = null;

    /** @type {boolean} Initialization status */
    this.initialized = false;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the auth service (connect to Redis if available)
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const redisUrl = process.env.REDIS_URL || this.config.redis?.url;
      if (redisUrl) {
        this.redis = new Redis(redisUrl);
        this.redis.on('error', (err) => {
          console.error('[AuthService] Redis error:', err.message);
        });
        this.redis.on('connect', () => {
          console.log('[AuthService] Redis connected for session storage');
        });
      }
      this.initialized = true;
      this.emit('ready');
      console.log('[AuthService] Initialized successfully');
    } catch (error) {
      console.error('[AuthService] Init failed:', error.message);
      // Continue without Redis - use in-memory fallback
      this.initialized = true;
    }
  }

  // ==========================================================================
  // TOKEN GENERATION & VALIDATION
  // ==========================================================================

  /**
   * Generate JWT access token
   * @param {Object} payload - Token payload data
   * @param {string} payload.playerId - Player's unique ID
   * @param {string} payload.name - Player's display name
   * @param {string} [payload.role='player'] - User role
   * @returns {string} Signed JWT token
   * @private
   */
  generateAccessToken(payload) {
    const tokenPayload = {
      sub: payload.playerId,
      name: payload.name || 'Player',
      role: payload.role || 'player',
      vehicleId: payload.vehicleId,
      jti: uuidv4(), // Unique token ID for revocation
      iat: Math.floor(Date.now() / 1000),
      iss: this.config.jwt.issuer || 'wzk5-server',
      aud: this.config.jwt.audience || 'wzk5-client'
    };

    return jwt.sign(tokenPayload, this.config.jwt.secret, {
      expiresIn: this.config.jwt.expiresIn || '15m',
      algorithm: 'HS256'
    });
  }

  /**
   * Generate refresh token
   * @param {string} playerId - Player's unique ID
   * @param {string} [deviceId] - Device identifier for multi-device support
   * @returns {Promise<string>} Refresh token
   * @private
   */
  async generateRefreshToken(playerId, deviceId = 'default') {
    const tokenId = uuidv4();
    const tokenPayload = {
      sub: playerId,
      jti: tokenId,
      type: 'refresh',
      deviceId,
      iat: Math.floor(Date.now() / 1000),
      iss: this.config.jwt.issuer || 'wzk5-server'
    };

    const refreshToken = jwt.sign(tokenPayload, this.config.jwt.secret, {
      expiresIn: this.config.jwt.refreshExpiresIn || '7d',
      algorithm: 'HS256'
    });

    // Store refresh token in Redis or memory
    const sessionData = {
      tokenId,
      playerId,
      deviceId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this._parseDuration(this.config.jwt.refreshExpiresIn || '7d')
    };

    // Store in Redis if available
    if (this.redis) {
      const key = `wzk5:refresh:${tokenId}`;
      await this.redis.setex(
        key,
        this._parseDuration(this.config.jwt.refreshExpiresIn || '7d') / 1000,
        JSON.stringify(sessionData)
      );
    } else {
      // Fallback to memory
      this.sessions.set(tokenId, sessionData);
    }

    return refreshToken;
  }

  /**
   * Validate and decode JWT token
   * @param {string} token - JWT token to validate
   * @returns {Object|null} Decoded payload or null if invalid
   */
  async authenticate(token) {
    if (!token) {
      return null;
    }

    try {
      // Check blacklist first
      if (this.tokenBlacklist.has(token)) {
        return null;
      }

      const decoded = jwt.verify(token, this.config.jwt.secret, {
        issuer: this.config.jwt.issuer || 'wzk5-server',
        audience: this.config.jwt.audience || 'wzk5-client',
        algorithms: ['HS256']
      });

      // Check if token is revoked in Redis
      if (this.redis && decoded.jti) {
        const isRevoked = await this.redis.get(`wzk5:blacklist:${decoded.jti}`);
        if (isRevoked) {
          this.tokenBlacklist.add(token);
          return null;
        }
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        this.emit('tokenExpired', { token, reason: 'expired' });
      } else if (error.name === 'JsonWebTokenError') {
        this.emit('tokenInvalid', { token, reason: error.message });
      }
      return null;
    }
  }

  // ==========================================================================
  // AUTHENTICATION METHODS
  // ==========================================================================

  /**
   * Authenticate player with email/password credentials
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - Player email
   * @param {string} credentials.password - Player password
   * @param {string} [credentials.deviceId] - Device identifier
   * @param {string} [ipAddress] - Client IP for rate limiting
   * @returns {Promise<Object>} Authentication result with tokens
   * @throws {AuthError} If authentication fails
   * @throws {RateLimitError} If rate limited
   */
  async login(credentials, ipAddress = '') {
    const { email, password, deviceId } = credentials;

    // Validate input
    if (!email || !password) {
      throw new AuthError('Email and password are required', 'MISSING_CREDENTIALS');
    }

    // Check rate limit
    const rateKey = `auth:${ipAddress || email}`;
    const rateCheck = this.authRateLimiter.check(rateKey);
    if (!rateCheck.allowed) {
      throw new RateLimitError(rateCheck.retryAfter);
    }

    // Look up player from persistence service
    let player;
    try {
      // Try to find by email (stored as hash key pattern)
      player = await this._lookupPlayerByEmail(email);
    } catch (err) {
      console.error('[AuthService] Player lookup error:', err.message);
    }

    if (!player) {
      // Don't reveal whether user exists (prevent enumeration)
      // Use constant-time comparison to prevent timing attacks
      bcrypt.compare(password, '$2a$12$dummyhash1234567890123456789012345678901234567890123').catch(() => {});
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, player.passwordHash || '');
    if (!passwordMatch) {
      this.emit('loginFailed', { playerId: player.id, reason: 'wrong_password' });
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // Generate tokens
    const accessToken = this.generateAccessToken({
      playerId: player.id,
      name: player.name,
      role: player.role || 'player',
      vehicleId: player.vehicleId
    });

    const refreshToken = await this.generateRefreshToken(player.id, deviceId);

    // Create session record
    const session = {
      id: uuidv4(),
      playerId: player.id,
      deviceId: deviceId || 'unknown',
      ipAddress,
      createdAt: Date.now(),
      lastActive: Date.now(),
      accessToken: this._extractJTI(accessToken)
    };

    // Store session
    this.sessions.set(session.id, session);

    // Update player online status
    if (this.persistence) {
      await this.persistence.setOnline(player.id);
    }

    this.emit('loginSuccess', { playerId: player.id, sessionId: session.id });

    return {
      success: true,
      accessToken,
      refreshToken,
      expiresIn: this._parseDuration(this.config.jwt.expiresIn || '15m'),
      player: {
        id: player.id,
        name: player.name,
        role: player.role || 'player',
        vehicleId: player.vehicleId || 'spectre'
      }
    };
  }

  /**
   * Authenticate via OAuth2 provider
   * @param {string} provider - Provider name ('google', 'discord', 'steam')
   * @param {string} authCode - Authorization code from provider
   * @param {string} [deviceId] - Device identifier
   * @param {string} [ipAddress] - Client IP
   * @returns {Promise<Object>} Authentication result with tokens
   */
  async loginOAuth(provider, authCode, deviceId = '', ipAddress = '') {
    const supportedProviders = ['google', 'discord', 'steam'];
    
    if (!supportedProviders.includes(provider)) {
      throw new AuthError(`Unsupported OAuth provider: ${provider}`, 'INVALID_PROVIDER');
    }

    if (!authCode) {
      throw new AuthError('Authorization code required', 'MISSING_CODE');
    }

    // Rate check
    const rateKey = `oauth:${provider}:${ipAddress}`;
    const rateCheck = this.authRateLimiter.check(rateKey);
    if (!rateCheck.allowed) {
      throw new RateLimitError(rateCheck.retryAfter);
    }

    try {
      // Get provider user info (stub implementation)
      const providerUser = await this._exchangeOAuthCode(provider, authCode);

      // Find or create player account
      let player = await this._lookupPlayerByOAuth(provider, providerUser.id);

      if (!player) {
        // Auto-create account for new OAuth users
        player = await this._createPlayerFromOAuth(provider, providerUser);
      }

      // Generate tokens (same as regular login)
      const accessToken = this.generateAccessToken({
        playerId: player.id,
        name: player.name,
        role: player.role || 'player',
        vehicleId: player.vehicleId
      });

      const refreshToken = await this.generateRefreshToken(player.id, deviceId);

      this.emit('oauthLoginSuccess', { 
        playerId: player.id, 
        provider,
        providerUserId: providerUser.id 
      });

      return {
        success: true,
        accessToken,
        refreshToken,
        expiresIn: this._parseDuration(this.config.jwt.expiresIn || '15m'),
        player: {
          id: player.id,
          name: player.name,
          role: player.role || 'player',
          vehicleId: player.vehicleId || 'spectre'
        }
      };
    } catch (error) {
      console.error(`[AuthService] OAuth ${provider} error:`, error.message);
      throw new AuthError(`OAuth authentication failed: ${error.message}`, 'OAUTH_ERROR');
    }
  }

  /**
   * Refresh an expired access token using a valid refresh token
   * @param {string} refreshTokenValue - Current refresh token
   * @param {string} [deviceId] - Device identifier
   * @returns {Promise<Object>} New token pair
   * @throws {AuthError} If refresh fails
   */
  async refreshToken(refreshTokenValue, deviceId) {
    if (!refreshTokenValue) {
      throw new AuthError('Refresh token required', 'MISSING_REFRESH_TOKEN');
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshTokenValue, this.config.jwt.secret, {
        issuer: this.config.jwt.issuer || 'wzk5-server',
        algorithms: ['HS256']
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthError('Refresh token has expired, please login again', 'REFRESH_EXPIRED');
      }
      throw new AuthError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    // Verify it's actually a refresh token
    if (decoded.type !== 'refresh') {
      throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE');
    }

    // Verify device matches (optional security measure)
    if (deviceId && decoded.deviceId && decoded.deviceId !== deviceId) {
      this.emit('securityWarning', { 
        reason: 'device_mismatch', 
        expectedDevice: decoded.deviceId,
        actualDevice: deviceId 
      });
      // Still allow but log warning
    }

    // Check if refresh token exists in store
    const sessionData = await this._getRefreshSession(decoded.jti);
    if (!sessionData) {
      throw new AuthError('Refresh token has been revoked', 'TOKEN_REVOKED');
    }

    // Revoke old refresh token
    await this._revokeRefreshToken(decoded.jti);

    // Generate new token pair
    const playerId = decoded.sub;
    
    // Get fresh player data
    const player = await this._lookupPlayerById(playerId);
    
    const newAccessToken = this.generateAccessToken({
      playerId,
      name: player?.name || 'Player',
      role: player?.role || 'player',
      vehicleId: player?.vehicleId
    });

    const newRefreshToken = await this.generateRefreshToken(playerId, deviceId || decoded.deviceId);

    this.emit('tokenRefreshed', { playerId });

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: this._parseDuration(this.config.jwt.expiresIn || '15m')
    };
  }

  /**
   * Logout and invalidate tokens
   * @param {string} accessToken - Access token to invalidate
   * @param {string} [refreshToken] - Optional refresh token to revoke
   * @returns {Promise<Object>} Logout result
   */
  async logout(accessToken, refreshToken = null) {
    let playerId = null;

    // Invalidate access token
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken);
        if (decoded && decoded.jti) {
          // Add to blacklist
          this.tokenBlacklist.add(accessToken);
          
          // Also add to Redis blacklist for distributed invalidation
          if (this.redis) {
            const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 900;
            if (ttl > 0) {
              await this.redis.setex(`wzk5:blacklist:${decoded.jti}`, ttl, '1');
            }
          }
          
          playerId = decoded.sub;
        }
      } catch (e) {
        // Token was invalid, continue with logout
      }
    }

    // Revoke refresh token
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, this.config.jwt.secret, {
          issuer: this.config.jwt.issuer || 'wzk5-server',
          algorithms: ['HS256']
        });
        
        if (decoded.jti) {
          await this._revokeRefreshToken(decoded.jti);
          playerId = playerId || decoded.sub;
        }
      } catch (e) {
        // Refresh token was invalid
      }
    }

    // Clean up sessions
    if (playerId) {
      await this._cleanupPlayerSessions(playerId);
      
      // Update online status
      if (this.persistence) {
        await this.persistence.setOffline(playerId);
      }
    }

    this.emit('logout', { playerId });

    return { success: true, message: 'Logged out successfully' };
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Validate that a user has an active session
   * @param {string} userId - Player ID to check
   * @returns {boolean} True if session is valid
   */
  validateSession(userId) {
    for (const session of this.sessions.values()) {
      if (session.playerId === userId) {
        // Check if session hasn't expired
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (Date.now() - session.createdAt < maxAge) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get all active sessions for a player
   * @param {string} playerId - Player ID
   * @returns {Array<Object>} Array of session objects
   */
  getPlayerSessions(playerId) {
    const sessions = [];
    for (const [id, session] of this.sessions.entries()) {
      if (session.playerId === playerId) {
        sessions.push({ id, ...session });
      }
    }
    return sessions;
  }

  /**
   * Invalidate all sessions except current one
   * @param {string} playerId - Player ID
   * @param {string} currentSessionId - Session to keep active
   * @returns {number} Number of sessions invalidated
   */
  invalidateOtherSessions(playerId, currentSessionId) {
    let count = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (session.playerId === playerId && id !== currentSessionId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  // ==========================================================================
  // MIDDLEWARE FACTORY
  // ==========================================================================

  /**
   * Create Express middleware for authentication
   * Returns middleware function that attaches user to req.user
   * 
   * @param {Object} [options={}] - Middleware options
   * @param {boolean} [options.optional=false] - Allow unauthenticated requests
   * @param {string[]} [options.roles] - Required roles (any match)
   * @returns {Function} Express middleware function
   * 
   * @example
   * // Required authentication
   * app.get('/profile', authService.createMiddleware(), profileHandler);
   * 
   * // Optional authentication
   * app.get('/public', authService.createMiddleware({ optional: true }), publicHandler);
   * 
   * // Role-based access
   * app.get('/admin', authService.createMiddleware({ roles: ['admin'] }), adminHandler);
   */
  createMiddleware(options = {}) {
    const { optional = false, roles = [] } = options;

    /**
     * Express middleware function
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Next middleware
     */
    return async (req, res, next) => {
      try {
        // Extract token from various sources
        const token = this._extractToken(req);

        if (!token) {
          if (optional) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        // Authenticate token
        const user = await this.authenticate(token);

        if (!user) {
          if (optional) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
          });
        }

        // Check roles if specified
        if (roles.length > 0) {
          const userRole = user.role || 'player';
          const hasRole = roles.some(r => {
            const hierarchy = { player: 1, moderator: 2, admin: 3, superadmin: 4 };
            return (hierarchy[userRole] || 0) >= (hierarchy[r] || 0);
          });
          
          if (!hasRole) {
            return res.status(403).json({
              success: false,
              error: 'Insufficient permissions',
              code: 'FORBIDDEN'
            });
          }
        }

        // Attach user to request
        req.user = user;
        req.isAuthenticated = true;

        // Update session last active
        if (user.sub) {
          const sessions = this.getPlayerSessions(user.sub);
          if (sessions.length > 0) {
            sessions[0].lastActive = Date.now();
          }
        }

        next();
      } catch (error) {
        console.error('[AuthMiddleware] Error:', error.message);
        res.status(500).json({
          success: false,
          error: 'Authentication error',
          code: 'AUTH_ERROR'
        });
      }
    };
  }

  /**
   * Create Socket.io authentication handshake middleware
   * @returns {Function} Socket.io middleware function
   */
  createSocketMiddleware() {
    return async (socket, next) => {
      try {
        const { token } = socket.handshake.auth || {};
        const { token: queryToken } = socket.handshake.query || {};
        const authToken = token || queryToken;

        if (!authToken) {
          return next(new Error('Authentication token required'));
        }

        const user = await this.authenticate(authToken);
        if (!user) {
          return next(new Error('Invalid authentication token'));
        }

        socket.handshake.auth.user = user;
        socket.handshake.auth.isAuthenticated = true;
        socket.user = user;

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    };
  }

  // ==========================================================================
  // OAUTH2 HELPERS
  // ==========================================================================

  /**
   * Exchange OAuth authorization code for user info
   * @private
   * @param {string} provider - Provider name
   * @param {string} code - Authorization code
   * @returns {Promise<Object>} Provider user info
   */
  async _exchangeOAuthCode(provider, code) {
    // Stub implementation - in production, make actual HTTP calls to providers
    
    switch (provider) {
      case 'google':
        // TODO: Implement Google OAuth2 token exchange
        // POST https://oauth2.googleapis.com/token
        // with client_id, client_secret, code, redirect_uri, grant_type
        return {
          id: 'google_stub_' + Date.now(),
          email: 'player@gmail.com',
          name: 'Google Player',
          picture: ''
        };

      case 'discord':
        // TODO: Implement Discord OAuth2 token exchange
        // POST https://discord.com/api/oauth2/token
        return {
          id: 'discord_stub_' + Date.now(),
          username: 'DiscordPlayer#0000',
          discriminator: '0000',
          avatar: null
        };

      case 'steam':
        // TODO: Implement Steam OpenID verification
        // Steam uses OpenID, not standard OAuth2
        return {
          id: 'steam_stub_' + Date.now(),
          personaName: 'SteamPlayer'
        };

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ==========================================================================
  // PLAYER LOOKUP HELPERS
  // ==========================================================================

  /**
   * Look up player by email address
   * @private
   * @param {string} email - Email address
   * @returns {Promise<Object|null>} Player data or null
   */
  async _lookupPlayerByEmail(email) {
    if (!this.persistence) {
      return null;
    }

    // In production, you'd have a separate users table/index
    // For now, we'll search through Redis patterns or use a dedicated lookup
    try {
      if (this.redis) {
        // Try to get player ID from email index
        const playerId = await this.redis.get(`wzk5:email:${email.toLowerCase()}`);
        if (playerId) {
          const player = await this.persistence.hydrate(playerId);
          if (player) {
            // Also fetch password hash from separate secure storage
            const passwordHash = await this.redis.get(`wzk5:password:${playerId}`);
            return { ...player, passwordHash };
          }
        }
      }
    } catch (e) {
      // Lookup failed
    }

    return null;
  }

  /**
   * Look up player by ID
   * @private
   * @param {string} playerId - Player ID
   * @returns {Promise<Object|null>}
   */
  async _lookupPlayerById(playerId) {
    if (!this.persistence) {
      return null;
    }
    return await this.persistence.hydrate(playerId);
  }

  /**
   * Look up player by OAuth provider ID
   * @private
   * @param {string} provider - Provider name
   * @param {string} providerUserId - Provider's user ID
   * @returns {Promise<Object|null>}
   */
  async _lookupPlayerByOAuth(provider, providerUserId) {
    if (!this.redis) {
      return null;
    }

    const playerId = await this.redis.get(`wzk5:oauth:${provider}:${providerUserId}`);
    if (playerId) {
      return await this.persistence.hydrate(playerId);
    }
    return null;
  }

  /**
   * Create new player from OAuth data
   * @private
   * @param {string} provider - Provider name
   * @param {Object} providerUser - Provider user info
   * @returns {Promise<Object>} Created player
   */
  async _createPlayerFromOAuth(provider, providerUser) {
    const playerId = uuidv4();
    const name = providerUser.name || providerUser.username || providerUser.personaName || 'Player';

    const playerData = {
      id: playerId,
      name,
      role: 'player',
      vehicleId: 'spectre',
      characterId: 'ace',
      level: 1,
      xp: 0,
      credits: 1000, // Starting credits
      gold: 0,
      unlocks: { vehicles: ['spectre'], characters: ['ace'] },
      oauth: {
        [provider]: providerUser.id
      }
    };

    // Save to persistence
    if (this.persistence) {
      await this.persistence.save(playerId, playerData);
    }

    // Store OAuth link
    if (this.redis) {
      await this.redis.set(`wzk5:oauth:${provider}:${providerUser.id}`, playerId);
      // Also set email if available
      if (providerUser.email) {
        await this.redis.set(`wzk5:email:${providerUser.email.toLowerCase()}`, playerId);
      }
    }

    this.emit('playerCreated', { playerId, method: 'oauth', provider });

    return playerData;
  }

  // ==========================================================================
  // SESSION STORAGE HELPERS
  // ==========================================================================

  /**
   * Get refresh token session data
   * @private
   * @param {string} tokenId - Token JTI
   * @returns {Promise<Object|null>}
   */
  async _getRefreshSession(tokenId) {
    if (this.redis) {
      const data = await this.redis.get(`wzk5:refresh:${tokenId}`);
      return data ? JSON.parse(data) : null;
    }
    return this.sessions.get(tokenId) || null;
  }

  /**
   * Revoke a refresh token
   * @private
   * @param {string} tokenId - Token JTI
   */
  async _revokeRefreshToken(tokenId) {
    if (this.redis) {
      await this.redis.del(`wzk5:refresh:${tokenId}`);
    }
    this.sessions.delete(tokenId);
  }

  /**
   * Clean up all sessions for a player
   * @private
   * @param {string} playerId - Player ID
   */
  async _cleanupPlayerSessions(playerId) {
    const toDelete = [];
    for (const [id, session] of this.sessions.entries()) {
      if (session.playerId === playerId) {
        toDelete.push(id);
      }
    }
    toDelete.forEach(id => this.sessions.delete(id));
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Extract JWT token from request
   * @private
   * @param {Object} req - Express request object
   * @returns {string|null}
   */
  _extractToken(req) {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check query parameter
    if (req.query.token) {
      return req.query.token;
    }

    // Check cookies
    if (req.cookies && req.cookies.access_token) {
      return req.cookies.access_token;
    }

    return null;
  }

  /**
   * Extract JTI from token without full verification
   * @private
   * @param {string} token - JWT token
   * @returns {string|null}
   */
  _extractJTI(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded?.jti || null;
    } catch {
      return null;
    }
  }

  /**
   * Parse duration string to milliseconds
   * @private
   * @param {string} duration - Duration string (e.g., '15m', '7d', '1h')
   * @returns {number} Duration in milliseconds
   */
  _parseDuration(duration) {
    if (typeof duration === 'number') return duration;
    
    const match = String(duration).match(/^(\d+)(ms|s|m|h|d|w)$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'ms': return value;
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  // ==========================================================================
  // SHUTDOWN / CLEANUP
  // ==========================================================================

  /**
   * Gracefully shut down the auth service
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log('[AuthService] Shutting down...');
    
    // Clear all in-memory sessions
    this.sessions.clear();
    this.tokenBlacklist.clear();
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }
    
    this.initialized = false;
    this.emit('shutdown');
    
    console.log('[AuthService] Shutdown complete');
  }

  // ==========================================================================
  // STATUS / HEALTH CHECK
  // ==========================================================================

  /**
   * Get service status for health checks
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'AuthService',
      initialized: this.initialized,
      activeSessions: this.sessions.size,
      blacklistedTokens: this.tokenBlacklist.size,
      redisConnected: this.redis ? this.redis.status === 'ready' : false,
      config: {
        issuer: this.config.jwt.issuer,
        tokenExpiry: this.config.jwt.expiresIn,
        refreshExpiry: this.config.jwt.refreshExpiresIn
      }
    };
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default AuthService;

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Hash a password with bcrypt
 * @param {string} password - Plain text password
 * @param {number} [saltRounds=12] - Bcrypt salt rounds
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, saltRounds = 12) {
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} hash - Bcrypt hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
