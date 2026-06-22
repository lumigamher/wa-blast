CREATE TABLE `agent_shipping` (
	`org_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`credentials_enc` text,
	`config_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_address_json` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_quote_json` text;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `weight_grams` integer;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `length_cm` integer;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `width_cm` integer;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `height_cm` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `weight_grams` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `length_cm` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `width_cm` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `height_cm` integer;