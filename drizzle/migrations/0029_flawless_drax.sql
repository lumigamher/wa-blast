PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversation_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_conversation_notes`("id", "org_id", "conversation_id", "author_user_id", "author_name", "body", "created_at") SELECT "id", "org_id", "conversation_id", "author_user_id", "author_name", "body", "created_at" FROM `conversation_notes`;--> statement-breakpoint
DROP TABLE `conversation_notes`;--> statement-breakpoint
ALTER TABLE `__new_conversation_notes` RENAME TO `conversation_notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `conversation_notes_conv` ON `conversation_notes` (`conversation_id`,`created_at`);