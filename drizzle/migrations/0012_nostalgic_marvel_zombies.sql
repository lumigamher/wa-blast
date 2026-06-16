ALTER TABLE `calls` ADD `answer_sdp` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `call_permission_status` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `call_permission_expires_at` integer;