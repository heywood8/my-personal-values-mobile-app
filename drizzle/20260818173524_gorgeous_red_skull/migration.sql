CREATE TABLE `alignment_checkins` (
	`id` text PRIMARY KEY,
	`checked_on` text NOT NULL CONSTRAINT `idx_alignment_checkins_date` UNIQUE,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alignment_ratings` (
	`id` text PRIMARY KEY,
	`checkin_id` text NOT NULL,
	`value_id` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_alignment_ratings_checkin_id_alignment_checkins_id_fk` FOREIGN KEY (`checkin_id`) REFERENCES `alignment_checkins`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_alignment_ratings_value_id_personal_values_id_fk` FOREIGN KEY (`value_id`) REFERENCES `personal_values`(`id`) ON DELETE CASCADE,
	CONSTRAINT `idx_alignment_ratings_checkin_value` UNIQUE(`checkin_id`,`value_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_alignment_ratings_checkin` ON `alignment_ratings` (`checkin_id`);--> statement-breakpoint
CREATE INDEX `idx_alignment_ratings_value` ON `alignment_ratings` (`value_id`);