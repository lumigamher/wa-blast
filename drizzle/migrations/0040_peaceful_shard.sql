CREATE TABLE `webhook_drops` (
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`raw_body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_drops_created_idx` ON `webhook_drops` (`created_at`);