const { z } = require('zod');
const service = require('./tenant-account.service');
const { listSchema } = require('./tenant-account.validation');

const organizationId = (req) => req.user.organizationId;
const invalid = (res, result) => res.status(400).json({ success: false, message: 'Invalid tenant account request.', errors: z.flattenError(result.error).fieldErrors });

async function list(req, res, next) { try { const result = listSchema.safeParse(req.query); if (!result.success) return invalid(res, result); return res.json({ success: true, ...(await service.listTenantAccounts(organizationId(req), result.data)) }); } catch (error) { return next(error); } }
async function get(req, res, next) { try { return res.json({ success: true, account: await service.getTenantAccount(organizationId(req), req.params.tenantId) }); } catch (error) { return next(error); } }
async function ledger(req, res, next) { try { const result = listSchema.pick({ page: true, pageSize: true }).safeParse(req.query); if (!result.success) return invalid(res, result); return res.json({ success: true, ...(await service.getTenantLedger(organizationId(req), req.params.tenantId, result.data)) }); } catch (error) { return next(error); } }
module.exports = { get, ledger, list };
