import { DataSource } from 'typeorm'
import { readFileSync } from 'node:fs'

function getPostgresUrl(): string {
    const fileVar = process.env['POSTGRES_URL_FILE']
    if (fileVar) return readFileSync(fileVar, 'utf8').trim()
    const url = process.env['POSTGRES_URL']
    if (url) return url
    throw new Error('POSTGRES_URL or POSTGRES_URL_FILE is required')
}

export default new DataSource({
    type: 'postgres',
    url: getPostgresUrl(),
    entities: ['src/lead-email-finder-api/src/**/*.entity.ts', 'src/libs/modules/api-key/src/**/*.entity.ts'],
    migrations: ['db/migrations/*.ts'],
})
