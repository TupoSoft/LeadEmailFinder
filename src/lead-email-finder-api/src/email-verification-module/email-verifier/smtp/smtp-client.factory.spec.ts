import { ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from '../../../environment-variables.dto'
import { SmtpClientFactory } from './smtp-client.factory'

describe('SmtpClientFactory', () => {
    it('creates SMTP clients on port 25 by default', () => {
        const factory = createFactory(undefined)

        expect(factory.create({ host: 'mx.example.com' })).toMatchObject({ exchange: 'mx.example.com', port: 25 })
    })

    it('creates SMTP clients on the configured port', () => {
        const factory = createFactory(2525)

        expect(factory.create({ host: 'mx.example.com' })).toMatchObject({ exchange: 'mx.example.com', port: 2525 })
    })
})

function createFactory(port: number | undefined): SmtpClientFactory {
    const configService = {
        get: jest.fn().mockReturnValue(port),
    } as unknown as ConfigService<EnvironmentVariablesDto, true>

    return new SmtpClientFactory(configService)
}
