const Joi = require('joi');

const validateRequest = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace the request property with the validated and sanitized value
    req[property] = value;
    next();
  };
};

const validateEmail = (email) => {
  const schema = Joi.string().email().required();
  const { error } = schema.validate(email);
  return !error;
};

const validateToken = (token) => {
  const schema = Joi.string().uuid().required();
  const { error } = schema.validate(token);
  return !error;
};

const sanitizeHtml = (html) => {
  // Basic HTML sanitization - in production, use a proper HTML sanitizer
  if (!html) return '';
  
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
};

const validatePagination = (req, res, next) => {
  const schema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    page: Joi.number().integer().min(1).default(1)
  });

  const { error, value } = schema.validate(req.query, {
    allowUnknown: true,
    stripUnknown: false
  });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid pagination parameters',
      details: error.details.map(detail => detail.message)
    });
  }

  // Convert page to offset if page is provided
  if (value.page && !req.query.offset) {
    value.offset = (value.page - 1) * value.limit;
  }

  // Update query parameters
  req.query.limit = value.limit;
  req.query.offset = value.offset;

  next();
};

module.exports = {
  validateRequest,
  validateEmail,
  validateToken,
  sanitizeHtml,
  validatePagination
}; 