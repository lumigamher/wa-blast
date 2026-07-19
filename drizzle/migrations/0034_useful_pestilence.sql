-- Dedup existing rows: keep first occurrence per (org_id, wacid), delete others
DELETE FROM `calls` WHERE `rowid` NOT IN (SELECT MIN(`rowid`) FROM `calls` GROUP BY `org_id`, `wacid`);--> statement-breakpoint
DROP INDEX `calls_org_wacid`;--> statement-breakpoint
CREATE UNIQUE INDEX `calls_org_wacid_unique` ON `calls` (`org_id`,`wacid`);