import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { loadSecrets } from '../../config/src/load-secrets'
import { createPostgresDataSourceOptions } from './typeorm-options'

const secrets = loadSecrets()
const postgresUrl = process.env.POSTGRES_URL ?? secrets.POSTGRES_URL

if (typeof postgresUrl !== 'string' || postgresUrl.length === 0) {
    throw new Error('POSTGRES_URL or POSTGRES_URL_FILE must be configured to run TypeORM migrations.')
}

export default new DataSource(createPostgresDataSourceOptions(postgresUrl))
