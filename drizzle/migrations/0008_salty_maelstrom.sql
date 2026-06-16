CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`phone` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`wacid` text NOT NULL,
	`duration_sec` integer,
	`started_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `calls_org_created` ON `calls` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `calls_conv` ON `calls` (`conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `calls_org_wacid` ON `calls` (`org_id`,`wacid`);