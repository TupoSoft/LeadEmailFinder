import { DataSourceOptions } from 'typeorm'
import { join } from 'node:path'

export function createPostgresDataSourceOptions(url: string): DataSourceOptions {
    return {
        type: 'postgres',
        url,
        entities: [join(__dirname, 'entities', '*.entity{.js,.ts}')],
        migrations: [join(__dirname, 'migrations', '*{.js,.ts}')],
        synchronize: false,
    }
}
