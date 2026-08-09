import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1776090761158 implements MigrationInterface {
    name = 'InitialSchema1776090761158'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."email_verifications_format_enum" AS ENUM('{first}', '{last}', '{first}.{last}', '{f}{last}', '{f}.{last}', '{first}{last}', '{first}{l}', '{first}.{l}', '{last}.{first}', '{first}_{last}', '{last}{f}', '{f}{l}', '{l}{first}', '{l}.{first}', '{last}{first}', '{first}-{last}')`);
        await queryRunner.query(`CREATE TYPE "public"."email_verifications_reason_enum" AS ENUM('accepted_email', 'rejected_email', 'timeout', 'temporarily_blocked', 'no_mx_records', 'unexpected_error', 'blacklisted', 'no_connect', 'exceeded_storage', 'sender_blocked', 'webmail', 'unknown')`);
        await queryRunner.query(`CREATE TABLE "email_verifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "domain" character varying NOT NULL, "localPart" character varying NOT NULL, "format" "public"."email_verifications_format_enum", "targetExchange" character varying, "mxDomain" character varying, "exists" boolean, "catchAll" boolean, "reason" "public"."email_verifications_reason_enum" NOT NULL, "sources" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "batchId" character varying, CONSTRAINT "PK_c1ea2921e767f83cd44c0af203f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ccb524831d7ed01177d13a8991" ON "email_verifications" ("email", "batchId") `);
        await queryRunner.query(`CREATE TYPE "public"."proxies_type_enum" AS ENUM('http', 'https', 'socks4', 'socks5')`);
        await queryRunner.query(`CREATE TABLE "proxies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."proxies_type_enum" NOT NULL, "host" character varying NOT NULL, "port" integer NOT NULL, "user" character varying, "password" character varying, "blacklists" text array, CONSTRAINT "PK_c66b4253ef600a915c610015093" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."emails_format_enum" AS ENUM('{first}', '{last}', '{first}.{last}', '{f}{last}', '{f}.{last}', '{first}{last}', '{first}{l}', '{first}.{l}', '{last}.{first}', '{first}_{last}', '{last}{f}', '{f}{l}', '{l}{first}', '{l}.{first}', '{last}{first}', '{first}-{last}')`);
        await queryRunner.query(`CREATE TABLE "emails" ("id" text NOT NULL, "username" character varying NOT NULL, "domain" character varying NOT NULL, "exists" boolean, "format" "public"."emails_format_enum", "lastVerificationId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastVerifiedAt" TIMESTAMP, CONSTRAINT "PK_a54dcebef8d05dca7e839749571" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."smtp_verifications_reason_enum" AS ENUM('accepted_email', 'rejected_email', 'timeout', 'temporarily_blocked', 'no_mx_records', 'unexpected_error', 'blacklisted', 'no_connect', 'exceeded_storage', 'sender_blocked', 'unknown')`);
        await queryRunner.query(`CREATE TABLE "smtp_verifications" ("id" text NOT NULL, "reason" "public"."smtp_verifications_reason_enum" NOT NULL, "exists" boolean, "targetExchange" character varying, "proxyId" character varying, CONSTRAINT "PK_0d20a3ffc8334319a6ef7364612" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "domains" ("id" text NOT NULL, "catchAllEnabled" boolean, "isFree" boolean NOT NULL DEFAULT false, "isDisposable" boolean NOT NULL DEFAULT false, "isVerificationForbidden" boolean NOT NULL DEFAULT false, "mxRecords" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_05a6b087662191c2ea7f7ddfc4d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "keys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token" character varying NOT NULL, "permissions" text NOT NULL, "description" character varying, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a00d5db78941c5d4fe6faba5ddc" UNIQUE ("token"), CONSTRAINT "PK_e63d5d51e0192635ab79aa49644" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a00d5db78941c5d4fe6faba5dd" ON "keys" ("token") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_a00d5db78941c5d4fe6faba5dd"`);
        await queryRunner.query(`DROP TABLE "keys"`);
        await queryRunner.query(`DROP TABLE "domains"`);
        await queryRunner.query(`DROP TABLE "smtp_verifications"`);
        await queryRunner.query(`DROP TYPE "public"."smtp_verifications_reason_enum"`);
        await queryRunner.query(`DROP TABLE "emails"`);
        await queryRunner.query(`DROP TYPE "public"."emails_format_enum"`);
        await queryRunner.query(`DROP TABLE "proxies"`);
        await queryRunner.query(`DROP TYPE "public"."proxies_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ccb524831d7ed01177d13a8991"`);
        await queryRunner.query(`DROP TABLE "email_verifications"`);
        await queryRunner.query(`DROP TYPE "public"."email_verifications_reason_enum"`);
        await queryRunner.query(`DROP TYPE "public"."email_verifications_format_enum"`);
    }

}
