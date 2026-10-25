DROP INDEX `messages_org_wamid`;--> statement-breakpoint
CREATE UNIQUE INDEX `messages_org_wamid` ON `messages` (`org_id`,`wamid`) WHERE wamid is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `member_user_org` ON `member` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `conversations_org_last_msg` ON `conversations` (`org_id`,`last_message_at`);