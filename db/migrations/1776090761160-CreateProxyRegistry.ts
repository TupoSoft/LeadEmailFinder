import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateProxyRegistry1776090761160 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "proxy_registry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "protocol" integer NOT NULL, "host" character varying NOT NULL, "port" integer NOT NULL, "auth" jsonb, "weight" integer NOT NULL DEFAULT 1, "description" character varying, "enabled" boolean NOT NULL DEFAULT true, "blacklists" text array, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_proxy_registry" PRIMARY KEY ("id"))`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE "proxy_registry"')
    }
}
