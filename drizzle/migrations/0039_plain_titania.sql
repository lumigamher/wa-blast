PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_id` text,
	`phone` text,
	`bsuid` text,
	`name` text,
	`params` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`wamid` text,
	`error` text,
	`sent_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_campaign_recipients`("id", "campaign_id", "contact_id", "phone", "bsuid", "name", "params", "status", "wamid", "error", "sent_at") SELECT "id", "campaign_id", "contact_id", "phone", NULL, "name", "params", "status", "wamid", "error", "sent_at" FROM `campaign_recipients`;--> statement-breakpoint
DROP TABLE `campaign_recipients`;--> statement-breakpoint
ALTER TABLE `__new_campaign_recipients` RENAME TO `campaign_recipients`;--> statement-breakpoint
CREATE INDEX `recipients_campaign_idx` ON `campaign_recipients` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `recipients_wamid_idx` ON `campaign_recipients` (`wamid`);--> statement-breakpoint
CREATE TABLE `__new_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`phone` text,
	`bsuid` text,
	`username` text,
	`name` text,
	`email` text,
	`company` text,
	`notes` text,
	`birthday` text,
	`city` text,
	`data_json` text DEFAULT '{}' NOT NULL,
	`call_permission_status` text,
	`call_permission_expires_at` integer,
	`custom_fields` text DEFAULT '{}' NOT NULL,
	`opt_out_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_contacts`("id", "org_id", "phone", "bsuid", "username", "name", "email", "company", "notes", "birthday", "city", "data_json", "call_permission_status", "call_permission_expires_at", "custom_fields", "opt_out_at", "created_at", "updated_at") SELECT "id", "org_id", "phone", NULL, NULL, "name", "email", "company", "notes", "birthday", "city", "data_json", "call_permission_status", "call_permission_expires_at", "custom_fields", "opt_out_at", "created_at", "updated_at" FROM `contacts`;--> statement-breakpoint
DROP TABLE `contacts`;--> statement-breakpoint
ALTER TABLE `__new_contacts` RENAME TO `contacts`;--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_org_phone_unique` ON `contacts` (`org_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_org_bsuid_unique` ON `contacts` (`org_id`,`bsuid`);--> statement-breakpoint
CREATE INDEX `contacts_org_idx` ON `contacts` (`org_id`);--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`phone` text,
	`bsuid` text,
	`username` text,
	`contact_id` text,
	`last_message_at` integer NOT NULL,
	`last_incoming_at` integer,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`agent_paused` integer DEFAULT false NOT NULL,
	`agent_typing_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("id", "org_id", "phone", "bsuid", "username", "contact_id", "last_message_at", "last_incoming_at", "unread_count", "status", "agent_paused", "agent_typing_until", "created_at") SELECT "id", "org_id", "phone", NULL, NULL, "contact_id", "last_message_at", "last_incoming_at", "unread_count", "status", "agent_paused", "agent_typing_until", "created_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_org_phone` ON `conversations` (`org_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_org_bsuid` ON `conversations` (`org_id`,`bsuid`);--> statement-breakpoint
CREATE TABLE `__new_flow_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text,
	`contact_id` text,
	`phone` text,
	`bsuid` text,
	`contact_name` text,
	`flow_name` text,
	`wamid` text,
	`fields_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_flow_responses`("id", "org_id", "conversation_id", "contact_id", "phone", "bsuid", "contact_name", "flow_name", "wamid", "fields_json", "created_at") SELECT "id", "org_id", "conversation_id", "contact_id", "phone", NULL, "contact_name", "flow_name", "wamid", "fields_json", "created_at" FROM `flow_responses`;--> statement-breakpoint
DROP TABLE `flow_responses`;--> statement-breakpoint
ALTER TABLE `__new_flow_responses` RENAME TO `flow_responses`;--> statement-breakpoint
CREATE INDEX `flow_responses_org_idx` ON `flow_responses` (`org_id`,`created_at`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;