CREATE TABLE `quick_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`shortcut` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quick_replies_org` ON `quick_replies` (`org_id`);