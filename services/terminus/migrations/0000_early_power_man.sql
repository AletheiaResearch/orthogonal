CREATE TABLE `provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text DEFAULT 'platform' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`provider` text NOT NULL,
	`credential_mode` text DEFAULT 'api_key' NOT NULL,
	`secret_encrypted` text NOT NULL,
	`expires_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "provider_credentials_tenant_owner_id" CHECK("provider_credentials"."owner_type" = 'platform' OR "provider_credentials"."owner_id" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_owner_provider` ON `provider_credentials` (`owner_type`,`owner_id`,`provider`);