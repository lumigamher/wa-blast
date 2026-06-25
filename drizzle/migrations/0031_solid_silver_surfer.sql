ALTER TABLE `orders` ADD `numero` integer;
--> statement-breakpoint
UPDATE `orders` SET `numero` = (
  SELECT COUNT(*) FROM `orders` o2
  WHERE o2.`org_id` = `orders`.`org_id` AND (o2.`created_at` < `orders`.`created_at` OR (o2.`created_at` = `orders`.`created_at` AND o2.`id` <= `orders`.`id`))
) WHERE `numero` IS NULL;