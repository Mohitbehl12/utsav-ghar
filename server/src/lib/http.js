import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse & validate with a zod schema; throws 400 with field errors. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] = i.message;
    throw new HttpError(400, 'Please check the highlighted fields.', { fields });
  }
  return r.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) err = new HttpError(400, 'Invalid input');
  if (err?.code === 'LIMIT_FILE_SIZE') err = new HttpError(413, 'File is too large (max 5 MB).');
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') err = new HttpError(409, 'That value is already in use.');
  // body-parser errors: never echo parser internals back to the browser
  if (err?.type === 'entity.parse.failed') err = new HttpError(400, 'We could not read that request. Please refresh the page and try again.');
  if (err?.type === 'entity.too.large') err = new HttpError(413, 'This request is too large.');
  if (err?.code === 'LIMIT_UNEXPECTED_FILE' || err?.code === 'LIMIT_FILE_COUNT') err = new HttpError(400, 'Too many files, or a file in the wrong field.');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Please try again.' : err instanceof HttpError ? err.message : 'This request could not be processed.',
    ...(err instanceof HttpError ? err.details || {} : {}),
  });
}
