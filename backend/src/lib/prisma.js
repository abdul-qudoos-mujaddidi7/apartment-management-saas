const { PrismaClient } = require('@prisma/client');

// One client per process. Every PrismaClient owns its own connection pool and
// query engine, so a copy per module multiplies the MySQL connections this API
// holds open and can leave requests queued behind a saturated pool.
module.exports = new PrismaClient();
