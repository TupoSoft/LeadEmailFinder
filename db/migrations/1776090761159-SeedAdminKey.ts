import { MigrationInterface, QueryRunner } from 'typeorm'
import { readFileSync } from 'node:fs'

function getAdminKey(): string | undefined {
    const file = process.env['ADMIN_API_KEY_FILE']
    if (file) {
        try {
            return readFileSync(file, 'utf8').trim()
        } catch {
            // fall through
        }
    }
    return process.env['ADMIN_API_KEY']
}

export class SeedAdminKey1776090761159 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        const token = getAdminKey()
        if (!token) {
            console.warn('SeedAdminKey: ADMIN_API_KEY not set, skipping')
            return
        }

        await queryRunner.query(
            `INSERT INTO keys (id, token, permissions, description, "expiresAt", "createdAt", "updatedAt")
             VALUES (uuid_generate_v4(), $1, 'admin', 'Default admin key', NOW() + INTERVAL '365 days', NOW(), NOW())
             ON CONFLICT DO NOTHING`,
            [token],
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const token = getAdminKey()
        if (token) {
            await queryRunner.query(`DELETE FROM keys WHERE token = $1`, [token])
        }
    }
}
