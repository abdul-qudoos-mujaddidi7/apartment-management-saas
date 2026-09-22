const financialAccountService = require('./financial-account.service');

function organizationId(req) {
  return req.user.organizationId;
}

async function list(req, res, next) {
  try {
    const accounts = await financialAccountService.listFinancialAccounts(organizationId(req));
    return res.status(200).json({ success: true, items: accounts });
  } catch (error) {
    return next(error);
  }
}

module.exports = { list };
