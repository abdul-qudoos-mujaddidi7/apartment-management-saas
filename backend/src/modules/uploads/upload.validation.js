const { z } = require('zod');

const { uploadKindNames, UPLOAD_URL_PATTERN } = require('../../lib/uploads');

/** Which document is being uploaded — an allowlist, not a path. */
const uploadQuerySchema = z.object({
  kind: z.enum(uploadKindNames),
});

/**
 * A stored file path: one of our own uploads and nothing else. A client may
 * only ever point a row at a file the API itself wrote.
 */
const uploadUrlSchema = z
  .preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .trim()
      .max(500)
      .regex(UPLOAD_URL_PATTERN, 'Choose a file that was uploaded to this server.')
      .nullable()
      .optional(),
  );

const deleteUploadSchema = z.object({
  url: z.string().trim().min(1).max(500).regex(UPLOAD_URL_PATTERN, 'Not an uploaded file.'),
});

module.exports = { deleteUploadSchema, uploadQuerySchema, uploadUrlSchema };
