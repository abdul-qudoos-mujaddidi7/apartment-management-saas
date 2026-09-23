const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const multer = require('multer');

const AppError = require('../errors/AppError');

/**
 * Uploaded images live on disk beside the API, and the database keeps only the
 * file's path. That keeps a tenant row small — a list of ten tenants does not
 * carry ten photographs — and lets the same row stay valid however many files
 * are attached to it.
 *
 * A stored path is always relative to the API's own origin, e.g.
 * `/uploads/tenants/photo-mf3k2a-9f21c4d8.jpg`. Never an absolute URL: the
 * client turns it into a full address using the API origin it is already
 * calling, so the row survives a move from localhost to a real host.
 */
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
const PUBLIC_PREFIX = '/uploads';

/** The only path a caller may store: one of our own files, nothing else. */
const UPLOAD_URL_PATTERN = /^\/uploads\/[a-z0-9][a-z0-9/_-]*\.(?:jpg|jpeg|png|webp)$/i;

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * The folders a file may be written to, named by the *kind* of document rather
 * than by a path from the request. Callers pick from this list; they cannot
 * choose a directory, which is what stops `?kind=../../.env` from meaning
 * anything.
 */
const UPLOAD_KINDS = {
  'tenant-photo': { folder: 'tenants', prefix: 'photo' },
  'tenant-id-front': { folder: 'tenants', prefix: 'id-front' },
  'tenant-id-back': { folder: 'tenants', prefix: 'id-back' },
};

const uploadKindNames = Object.keys(UPLOAD_KINDS);

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

/** The public path of a file that was just written. */
function publicUrl(folder, filename) {
  return `${PUBLIC_PREFIX}/${folder}/${filename}`;
}

/**
 * An absolute path for one of our own stored paths, or null for anything else.
 * Refuses absolute URLs, other directories and any path that climbs out of the
 * upload root — the check is on the *resolved* path, so `..` cannot win.
 */
function resolveUpload(url) {
  if (typeof url !== 'string' || !url.startsWith(`${PUBLIC_PREFIX}/`)) return null;
  if (!UPLOAD_URL_PATTERN.test(url)) return null;

  const absolute = path.resolve(UPLOAD_ROOT, url.slice(PUBLIC_PREFIX.length + 1));
  const root = `${path.resolve(UPLOAD_ROOT)}${path.sep}`;

  return absolute.startsWith(root) ? absolute : null;
}

/**
 * Best-effort deletion of a file we wrote. A missing file is not an error: the
 * caller is usually replacing a document, and the row is what matters.
 */
function removeUpload(url) {
  const absolute = resolveUpload(url);
  if (!absolute) return false;

  try {
    fs.unlinkSync(absolute);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not delete upload:', absolute, error.message);
    return false;
  }
}

function uploadKindOf(kind) {
  return UPLOAD_KINDS[kind] || null;
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    const kind = uploadKindOf(req.validated?.query?.kind);
    if (!kind) return callback(new AppError('Unknown upload kind.', 400, 'UPLOAD_KIND_INVALID'));

    const directory = path.join(UPLOAD_ROOT, kind.folder);
    fs.mkdirSync(directory, { recursive: true });
    return callback(null, directory);
  },
  filename(req, file, callback) {
    const kind = uploadKindOf(req.validated?.query?.kind);
    const extension = ALLOWED_MIME_TYPES[file.mimetype] || 'jpg';
    const unique = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;

    // The name is built here, never taken from the upload: a client-supplied
    // filename is a path in disguise.
    return callback(null, `${kind.prefix}-${unique}.${extension}`);
  },
});

const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return callback(
        new AppError('Only JPEG, PNG or WebP images can be uploaded.', 400, 'UPLOAD_TYPE_NOT_ALLOWED'),
      );
    }
    return callback(null, true);
  },
});

/**
 * multer's own errors carry no HTTP status, so they are translated here rather
 * than leaking a 500 for a file that is simply too big.
 */
function uploadSingle(field = 'file') {
  const middleware = imageUpload.single(field);

  return (req, res, next) =>
    middleware(req, res, (error) => {
      if (!error) return next();

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Images must be 5 MB or smaller.', 413, 'UPLOAD_TOO_LARGE'));
        }
        return next(new AppError('Send exactly one image in the "file" field.', 400, 'UPLOAD_INVALID'));
      }

      return next(error);
    });
}

module.exports = {
  MAX_FILE_SIZE,
  PUBLIC_PREFIX,
  UPLOAD_KINDS,
  UPLOAD_ROOT,
  UPLOAD_URL_PATTERN,
  ensureUploadRoot,
  publicUrl,
  removeUpload,
  resolveUpload,
  uploadKindNames,
  uploadSingle,
};
