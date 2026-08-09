import { createPostgresDataSourceOptions } from './typeorm-options'

describe('createPostgresDataSourceOptions', () => {
    it('configures PostgreSQL with migrations and synchronization disabled', () => {
        const options = createPostgresDataSourceOptions('postgresql://postgres:postgres@localhost:5432/lead_email_finder')

        expect(options).toMatchObject({
            type: 'postgres',
            url: 'postgresql://postgres:postgres@localhost:5432/lead_email_finder',
            synchronize: false,
        })
        expect(options.entities).toEqual([expect.stringContaining('entities')])
        expect(options.migrations).toEqual([expect.stringContaining('migrations')])
    })
})
