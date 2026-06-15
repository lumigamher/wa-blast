CREATE TABLE `conversation_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_notes_conv` ON `conversation_notes` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`target_wamid` text NOT NULL,
	`direction` text NOT NULL,
	`emoji` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reactions_target` ON `message_reactions` (`org_id`,`target_wamid`,`direction`);--> statement-breakpoint
CREATE INDEX `message_reactions_conv` ON `message_reactions` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `stickers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stickers_org` ON `stickers` (`org_id`);