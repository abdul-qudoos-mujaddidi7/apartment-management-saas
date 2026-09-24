-- A reversal is an equal-and-opposite POSTED journal. Keep its original
-- POSTED too so the pair cancels in account balances and financial reports.
UPDATE `Journal` AS `original`
INNER JOIN `Journal` AS `reversal`
  ON `reversal`.`organizationId` = `original`.`organizationId`
  AND `reversal`.`referenceId` = `original`.`referenceId`
  AND `reversal`.`referenceType` = CONCAT(`original`.`referenceType`, '_VOID')
SET
  `original`.`status` = 'POSTED',
  `original`.`voidedAt` = NULL,
  `original`.`voidReason` = NULL
WHERE `original`.`status` = 'VOIDED';
