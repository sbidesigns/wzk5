// server/auth/middleware.js — Authentication & Authorization Middleware
// Provides Express middleware for JWT verification, role-based access control,
// rate limiting, and Socket.io authentication handshake.
//
// Features:
// - JWT authentication middleware
// - Role-based authorization (player, moderator, admin)
// - Configurable rate limiting per endpoint type
// - Socket.io WebSocket authentication
// - Request logging and security headers
//
// @module auth/middleware

import { verifyToken, validateSession } from './AuthService.js';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load configuration
 * @private
 */
function loadConfig() {
  try {
    const configPath = join(__dirname, '../config/gameServer.config.json');
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

const CONFIG = loadConfig();

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

/**
 * User role hierarchy (higher number = more permissions)
 * @type {Object.<string, number>}
 * @constant
 */
export const ROLE_HIERARCHY = {
  player: 1,
  moderator: 2,
  admin: 3,
  superadmin: 4
};

/**
 * Check if user has required role or higher
 * 
 * @param {string} userRole - User's current role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean} True if authorized
 * @private
 */
function hasRequiredRole(userRole, requiredRole) {
  const userLevel = ROLE_HIERARCHY[userRole.toLowerCase()] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole.toLowerCase()] || 0;
  return userLevel >= requiredLevel;
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Express middleware to authenticate requests via JWT
 * Extracts token from Authorization header or query parameter
 * Attaches decoded user data to req.user
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * 
 * @example
 * app.get('/protected', authenticate, (req, res) => {
 *   res.json({ message: `Hello ${req.user.name}` });
 * });
 */
export function authenticate(req, res, next) {
  try {
    // Extract token from Authorization header
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Fallback to query parameter (for WebSocket upgrades)
    if (!token && req.query.token) {
      token = req.query.token;
    }

    // Fallback to cookie
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Verify token
    const payload = verifyToken(token);
    
    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user to request
    req.user = payload;
    req.authToken = token;

    next();
  } catch (error) {
    console.error('[AuthMiddleware] Authentication error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token present
 * Useful for endpoints that work with or without auth (with different behavior)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        req.user = payload;
        req.isAuthenticated = true;
      }
    }

    next();
  } catch (error) {
    // Continue without auth on error
    next();
  }
}

// ============================================================================
// AUTHORIZATION MIDDLEWARE (RBAC)
// ============================================================================

/**
 * Factory function to create role-based authorization middleware
 * Checks if authenticated user has the required role level
 * 
 * @param {string|string[]} roles - Required role(s) - user must have at least one
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Single role requirement
 * app.delete('/users/:id', authenticate, authorize('admin'), deleteUser);
 * 
 * // Multiple acceptable roles
 * app.post('/moderate', authenticate, authorize(['moderator', 'admin']), moderateContent);
 */
export function authorize(roles) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    // Ensure user is authenticated first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role || 'player';

    // Check if user has any of the required roles
    const hasAccess = requiredRoles.some(required => 
      hasRequiredRole(userRole, required)
    );

    if (!hasAccess) {
      console.warn(`[AuthMiddleware] Unauthorized access attempt: ${userRole} -> ${requiredRoles.join('|')}`);
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles,
        userRole
      });
    }

    next();
  };
}

/**
 * Pre-configured admin-only middleware
 * @type {Function}
 */
export const requireAdmin = authorize('admin');

/**
 * Pre-configured moderator+ middleware
 * @type {Function}
 */
export const requireModerator = authorize(['moderator', 'admin']);

/**
 * Resource ownership check middleware factory
 * Verifies that req.user.playerId matches the resource's owner
 * 
 * @param {Function} getOwnerId - Function that extracts owner ID from request
 * @returns {Function} Express middleware
 * 
 * @example
 * // Only allow users to update their own profile
 * app.put('/profile', authenticate, ownResource(req => req.params.playerId), updateProfile);
 */
export function ownResource(getOwnerId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const ownerId = getOwnerId(req);
    const isAdmin = hasRequiredRole(req.user.role || 'player', 'admin');

    if (ownerId !== req.user.playerId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not your resource',
        code: 'NOT_OWNER'
      });
    }

    next();
  };
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Create a rate limiter with custom options
 * 
 * @param {Object} options - Rate limit options
 * @param {number} [options.windowMs=60000] - Time window in milliseconds
 * @param {number} [options.max=100] - Max requests per window
 * @param {string} [options.message='Too many requests'] - Error message
 * @param {string} [options.prefix='rate_limit'] - Redis key prefix
 * @returns {RateLimit} Configured rate limiter
 * 
 * @example
 * const apiLimiter = createRateLimiter({ windowMs: 60000, max: 100 });
 * app.use('/api/', apiLimiter);
 */
export function createRateLimiter(options = {}) {
  const config = CONFIG.rateLimit || {};
  
  return rateLimit({
    windowMs: options.windowMs || config.windowMs || 60000,
    max: options.max || config.maxRequests || 100,
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    message: {
      success: false,
      error: options.message || 'Too many requests, please try again later',
      code: 'RATE_LIMITED'
    },
    keyGenerator: (req) => {
      // Use IP address as default key, but prefer user ID if authenticated
      if (req.user && req.user.playerId) {
        return `user:${req.user.playerId}`;
      }
      return `ip:${req.ip || req.connection.remoteAddress}`;
    },
    handler: (req, res) => {
      console.warn(`[RateLimit] Limit exceeded for ${req.ip || req.user?.playerId}`);
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((options.windowMs || 60000) / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting for admin users
      if (req.user && hasRequiredRole(req.user.role, 'admin')) {
        return true;
      }
      return options.skip ? options.skip(req) : false;
    }
  });
}

/**
 * Pre-configured general API rate limiter (100 req/min)
 * @type {RateLimit}
 */
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100
});

/**
 * Pre-configured authentication rate limiter (20 req/min)
 * Stricter limits to prevent brute force attacks
 * @type {RateLimit}
 */
export const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts, please try again later'
});

/**
 * Pre-configured strict rate limiter for sensitive operations (5 req/min)
 * @type {RateLimit}
 */
export const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many attempts on this action'
});

/**
 * Pre-configured matchmaking rate limiter (10 req/min)
 * @type {RateLimit}
 */
export const matchmakingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many matchmaking requests'
});

// ============================================================================
// SOCKET.IO AUTHENTICATION
// ============================================================================

/**
 * Socket.io authentication handshake middleware
 * Validates JWT token during WebSocket connection
 * Attaches user data to socket.handshake.auth
 * 
 * @param {Object} socket - Socket.io socket object
 * @param {Function} next - Callback to accept/reject connection
 * 
 * @example
 * io.use(socketAuth);
 * io.on('connection', (socket) => {
 *   console.log('Authenticated:', socket.handshake.auth.user.name);
 * });
 */
export function socketAuth(socket, next) {
  try {
    const { token } = socket.handshake.auth || {};
    const { token: queryToken } = socket.handshake.query || {};

    const authToken = token || queryToken;

    if (!authToken) {
      console.warn('[SocketAuth] Connection attempt without token');
      return next(new Error('Authentication token required'));
    }

    const payload = verifyToken(authToken);

    if (!payload) {
      console.warn('[SocketAuth] Invalid token in WebSocket connection');
      return next(new Error('Invalid authentication token'));
    }

    // Attach user data to socket
    socket.handshake.auth = {
      ...socket.handshake.auth,
      user: payload,
      isAuthenticated: true
    };

    // Store user reference on socket for easy access
    socket.user = payload;

    console.log(`[SocketAuth] User connected: ${payload.name} (${payload.playerId})`);
    next();
  } catch (error) {
    console.error('[SocketAuth] Socket auth error:', error.message);
    next(new Error('Authentication failed'));
  }
}

/**
 * Optional socket authentication - allows unauthenticated connections
 * but marks them as guests
 * 
 * @param {Object} socket - Socket.io socket object
 * @param {Function} next - Callback function
 */
export function optionalSocketAuth(socket, next) {
  try {
    const { token } = socket.handshake.auth || {};
    
    if (token) {
      const payload = verifyToken(token);
      if (payload) {
        socket.handshake.auth.user = payload;
        socket.handshake.auth.isAuthenticated = true;
        socket.user = payload;
      }
    }

    next();
  } catch (error) {
    // Allow connection even if auth fails
    next();
  }
}

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================

/**
 * Request logger middleware with structured logging
 * Logs method, path, status, response time, and user info
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || generateRequestId();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Log request on finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = req.user ? `${req.user.name} (${req.user.role})` : 'anonymous';
    
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      user
    };

    // Log warnings for slow requests or errors
    if (duration > 1000) {
      console.warn(`[SlowRequest]`, logData);
    } else if (res.statusCode >= 400) {
      console.warn(`[ErrorRequest]`, logData);
    } else {
      console.log(`[Request]`, logData);
    }
  });

  next();
}

/**
 * Generate unique request ID
 * @returns {string} Unique ID
 * @private
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

/**
 * Global error handling middleware
 * Catches errors thrown in routes and returns consistent JSON responses
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler]', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.requestId,
    path: req.path,
    user: req.user?.playerId
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message,
      code: 'VALIDATION_ERROR'
    });
  }

  if (err.name === 'UnauthorizedError' || err.message?.includes('token')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED'
    });
  }

  if (err.code === 'RATE_LIMITED') {
    return res.status(429).json({
      success: false,
      error: err.message || 'Too many requests',
      code: 'RATE_LIMITED'
    });
  }

  // Default server error
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * Not found handler for unmatched routes
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND'
  });
}

// ============================================================================
// SECURITY HEADERS MIDDLEWARE
// ============================================================================

/**
 * Add security-related headers to responses
 * Note: In production, use helmet() instead for comprehensive protection
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function securityHeaders(req, res, next) {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (relaxed for game assets)
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' wss: ws:; " +
    "font-src 'self' data:;"
  );
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=()'
  );

  next();
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================

/**
 * @namespace AuthMiddleware
 * @description Complete authentication and authorization middleware suite
 * 
 * Authentication:
 * - authenticate(req, res, next) - Required JWT authentication
 * - optionalAuth(req, res, next) - Optional JWT authentication
 * 
 * Authorization:
 * - authorize(roles) - Role-based access control
 * - requireAdmin - Admin-only shortcut
 * - requireModerator - Moderator+ shortcut
 * - ownResource(getOwnerId) - Resource ownership check
 * 
 * Rate Limiting:
 * - createRateLimiter(options) - Custom rate limiter
 * - apiLimiter - General API limiter (100/min)
 * - authLimiter - Auth endpoint limiter (20/min)
 * - strictLimiter - Sensitive operations (5/min)
 * - matchmakingLimiter - Matchmaking (10/min)
 * 
 * Socket.io:
 * - socketAuth(socket, next) - Required WS authentication
 * - optionalSocketAuth(socket, next) - Optional WS authentication
 * 
 * Utilities:
 * - requestLogger - Request logging
 * - errorHandler - Global error handler
 * - notFoundHandler - 404 handler
 * - securityHeaders - Security response headers
 */

export default {
  authenticate,
  optionalAuth,
  authorize,
  requireAdmin,
  requireModerator,
  ownResource,
  createRateLimiter,
  apiLimiter,
  authLimiter,
  strictLimiter,
  matchmakingLimiter,
  socketAuth,
  optionalSocketAuth,
  requestLogger,
  errorHandler,
  notFoundHandler,
  securityHeaders,
  ROLE_HIERARCHY
};
