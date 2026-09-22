const searchService = require('./search.service');

function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

async function search(req, res) {
  const { q } = req.query;
  const data = await searchService.globalSearch(getOrganizationId(req), q || '');
  return res.status(200).json({ success: true, ...data });
}

module.exports = { search };
