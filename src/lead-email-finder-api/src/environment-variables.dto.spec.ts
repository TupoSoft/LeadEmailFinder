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
})
