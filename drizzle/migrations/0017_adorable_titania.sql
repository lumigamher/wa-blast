CREATE TABLE `agent_catalog` (
	`org_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'internal' NOT NULL,
	`credentials_enc` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`conversation_id` text,
	`contact_id` text,
	`items_json` text DEFAULT '[]' NOT NULL,
	`total_cop` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`payment_method` text,
	`comprobante_media_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `orders_org_idx` ON `orders` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`price_cop` integer DEFAULT 0 NOT NULL,
	`description` text,
	`sku` text,
	`available` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `products_org_idx` ON `products` (`org_id`);