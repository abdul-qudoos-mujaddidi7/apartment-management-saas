const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { uploadSingle } = require('../../lib/uploads');
const { requireAuth } = require('../auth/auth.middleware');
const uploadController = require('./upload.controller');
const { deleteUploadSchema, uploadQuerySchema } = require('./upload.validation');

const { requirePermission } = require('../../middleware/permission');
const prisma = require('../../lib/prisma');
const AppError = require('../../errors/AppError');
const router = express.Router();

router.use(requireAuth);

// One image per request, named `file`, with the document it belongs to chosen
// from a fixed list: POST /api/uploads?kind=tenant-id-front
router.post(
  '/',
  validate({ query: uploadQuerySchema }),
  (req, res, next) => req.validated.query.kind === 'guarantor-document' ? requirePermission('GUARANTOR_MANAGE')(req, res, next) : next(),
  uploadSingle('file'),
  asyncHandler(uploadController.create),
);

// Undo an upload that was never attached to anything — a picture picked by
// mistake and then dropped before the form was saved.
router.delete(
  '/',
  validate({ body: deleteUploadSchema }),
  asyncHandler(async (req,res,next) => {
    const url = req.validated.body.url;
    if (url.startsWith('/uploads/guarantors/')) {
      if (!url.startsWith('/uploads/guarantors/' + req.user.organizationId + '/')) throw new AppError('Document not found.',404,'DOCUMENT_NOT_FOUND');
      if (await prisma.guarantor.count({where:{documentUrl:url}})) throw new AppError('Document is attached to a guarantor.',409,'DOCUMENT_IN_USE');
      return requirePermission('GUARANTOR_MANAGE')(req,res,next);
    }
    next();
  }),
  asyncHandler(uploadController.remove),
);

module.exports = router;
