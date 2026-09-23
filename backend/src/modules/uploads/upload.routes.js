const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { uploadSingle } = require('../../lib/uploads');
const { requireAuth } = require('../auth/auth.middleware');
const uploadController = require('./upload.controller');
const { deleteUploadSchema, uploadQuerySchema } = require('./upload.validation');

const router = express.Router();

router.use(requireAuth);

// One image per request, named `file`, with the document it belongs to chosen
// from a fixed list: POST /api/uploads?kind=tenant-id-front
router.post(
  '/',
  validate({ query: uploadQuerySchema }),
  uploadSingle('file'),
  asyncHandler(uploadController.create),
);

// Undo an upload that was never attached to anything — a picture picked by
// mistake and then dropped before the form was saved.
router.delete(
  '/',
  validate({ body: deleteUploadSchema }),
  asyncHandler(uploadController.remove),
);

module.exports = router;
