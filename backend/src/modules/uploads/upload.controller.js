const AppError = require('../../errors/AppError');
const {
  MAX_FILE_SIZE,
  UPLOAD_KINDS,
  publicUrl,
  removeUpload,
} = require('../../lib/uploads');

async function create(req, res) {
  if (!req.file) throw new AppError('No image was received.', 400, 'UPLOAD_MISSING_FILE');

  const kind = UPLOAD_KINDS[req.validated.query.kind];

  return res.status(201).json({
    success: true,
    upload: {
      url: publicUrl(kind.folder, req.file.filename),
      kind: req.validated.query.kind,
      mimeType: req.file.mimetype,
      size: req.file.size,
      maxSize: MAX_FILE_SIZE,
    },
  });
}

async function remove(req, res) {
  const deleted = removeUpload(req.validated.body.url);

  // A file that is already gone answers the same way as one just deleted: the
  // caller asked for it to be gone, and it is.
  return res.status(200).json({ success: true, deleted });
}

module.exports = { create, remove };
