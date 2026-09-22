const { z } = require('zod');
const service = require('./financial-account.service');

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
const organizationId = (req) => req.user.organizationId;

async function list(req, res, next) { try { return res.json({ success: true, items: await service.listAccountsWithBalances(organizationId(req)) }); } catch (error) { return next(error); } }
async function get(req, res, next) { try { return res.json({ success: true, account: await service.getAccount(organizationId(req), req.params.id) }); } catch (error) { return next(error); } }
async function ledger(req, res, next) { try { const result = pageSchema.safeParse(req.query); if (!result.success) return res.status(400).json({ success: false, errors: z.flattenError(result.error).fieldErrors }); return res.json({ success: true, ...(await service.getAccountLedger(organizationId(req), req.params.id, result.data)) }); } catch (error) { return next(error); } }
module.exports = { get, ledger, list };
