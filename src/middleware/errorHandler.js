/**
 * Express Error Handling Middleware
 * Centralized error handling for Express routes
 */
const logger = require('../utils/logger');
const { ErrorHandler } = require('../utils/errors');

/**
 * Error handling middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const errorHandler = (error, req, res) => {
  // Log error
  logger.error('Request error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle different error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        name: 'ValidationError',
        message: error.message,
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: {
        name: 'CastError',
        message: 'Invalid data format',
        code: 'INVALID_FORMAT',
        statusCode: 400,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (error.code === 'ENOENT') {
    return res.status(404).json({
      error: {
        name: 'FileNotFoundError',
        message: 'Resource not found',
        code: 'FILE_NOT_FOUND',
        statusCode: 404,
        timestamp: new Date().toISOString()
      }
    });
  }

  if (error.code === 'EACCES') {
    return res.status(403).json({
      error: {
        name: 'PermissionError',
        message: 'Permission denied',
        code: 'PERMISSION_DENIED',
        statusCode: 403,
        timestamp: new Date().toISOString()
      }
    });
  }

  // Handle inventory-specific errors
  const errorResponse = ErrorHandler.handle(error);
  
  // Set status code
  res.status(errorResponse.error.statusCode || 500);
  
  // Send error response
  res.json(errorResponse);
};

/**
 * 404 handler for undefined routes
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const notFoundHandler = (req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  
  res.status(404).json({
    error: {
      name: 'NotFoundError',
      message: `Route not found: ${req.method} ${req.url}`,
      code: 'ROUTE_NOT_FOUND',
      statusCode: 404,
      timestamp: new Date().toISOString()
    }
  });
};

/**
 * Async error wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
