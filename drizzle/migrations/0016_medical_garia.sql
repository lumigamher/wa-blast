CREATE TABLE `agent_calendar` (
	`org_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'calcom' NOT NULL,
	`credentials_enc` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
