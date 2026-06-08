CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`path` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_assets_org_idx` ON `media_assets` (`org_id`);--> statement-breakpoint
CREATE TABLE `template_card_media` (
	`org_id` text NOT NULL,
	`template_name` text NOT NULL,
	`template_language` text NOT NULL,
	`card_index` integer NOT NULL,
	`asset_id` text NOT NULL,
	PRIMARY KEY(`org_id`, `template_name`, `template_language`, `card_index`),
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `template_type` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `component_plan_json` text;--> statement-breakpoint
ALTER TABLE `organization_settings` ADD `meta_app_id` text;