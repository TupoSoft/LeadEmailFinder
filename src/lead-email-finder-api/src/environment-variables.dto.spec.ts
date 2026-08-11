import { plainToInstance } from 'class-transformer'
import { EnvironmentVariablesDto } from './environment-variables.dto'

describe('EnvironmentVariablesDto', (): void => {
    it.each([
        ['true', true],
        [true, true],
        ['false', false],
        [false, false],
    ])('parses boolean values when implicit conversion is enabled', (value, expected): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            {
                S3_FORCE_PATH_STYLE: value,
                TYPEORM_SYNCHRONIZE: value,
            },
            { enableImplicitConversion: true },
        )

        expect(environment.S3_FORCE_PATH_STYLE).toBe(expected)
        expect(environment.TYPEORM_SYNCHRONIZE).toBe(expected)
    })

    it('transforms proxy capacity values from environment variables', (): void => {
        const environment = plainToInstance(
            EnvironmentVariablesDto,
            {
                PROXY_MX_REQUESTS_PER_MINUTE: '10',
                PROXY_LEASE_TTL_MS: '60000',
            },
            { enableImplicitConversion: true },
        )

        expect(environment.PROXY_MX_REQUESTS_PER_MINUTE).toBe(10)
        expect(environment.PROXY_LEASE_TTL_MS).toBe(60000)
    })
})
