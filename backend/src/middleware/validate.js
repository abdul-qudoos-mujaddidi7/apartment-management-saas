const AppError = require('../errors/AppError');

/**
 * Validate params/query/body against Zod schemas and expose the parsed
 * values on req.validated. Keeps controllers free of parsing logic.
 */
function validate(schemas = {}) {
  return function validationMiddleware(req, res, next) {
    const validated = {};

    for (const source of ['params', 'query', 'body']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);

      if (!result.success) {
        // Keep the { field: [messages] } shape the frontend's
        // applyServerErrors() already expects.
        const fieldErrors = result.error.flatten().fieldErrors;

        return next(
          new AppError(
            'The submitted data is invalid.',
            422,
            'VALIDATION_ERROR',
            fieldErrors,
          ),
        );
      }

      validated[source] = result.data;
    }

    req.validated = {
      ...(req.validated || {}),
      ...validated,
    };

    return next();
  };
}

module.exports = validate;
