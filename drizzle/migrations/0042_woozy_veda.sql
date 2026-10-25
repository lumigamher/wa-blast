CREATE TABLE `agent_jobs` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`recipient_json` text NOT NULL,
	`due_at` integer NOT NULL,
	`locked_until` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_jobs_due_idx` ON `agent_jobs` (`due_at`);