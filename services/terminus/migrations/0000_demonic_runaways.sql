CREATE TABLE `policies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text DEFAULT 'platform' NOT NULL,
	`owner_id` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "policies_tenant_owner_id" CHECK("policies"."owner_type" = 'platform' OR "policies"."owner_id" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policies_owner_name` ON `policies` (`owner_type`,`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`version` integer NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policy_versions_policy_version` ON `policy_versions` (`policy_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `policy_versions_active` ON `policy_versions` (`policy_id`) WHERE "policy_versions"."is_active" = 1;--> statement-breakpoint
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
	`label` text DEFAULT 'default' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`cooldown_until_ms` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "provider_credentials_tenant_owner_id" CHECK("provider_credentials"."owner_type" = 'platform' OR "provider_credentials"."owner_id" <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_owner_provider_label` ON `provider_credentials` (`owner_type`,`owner_id`,`provider`,`label`);