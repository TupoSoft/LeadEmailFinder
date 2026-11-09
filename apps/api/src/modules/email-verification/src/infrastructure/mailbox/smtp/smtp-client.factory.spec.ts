import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { SmtpConfiguration } from '../../../domain/email-verification-configuration'
import { SmtpClientFactory } from './smtp-client.factory'

const fixtureCaPath = resolve(__dirname, '../../../../../../../../../docker/smtp-dev/tls/ca.crt')

describe('SmtpClientFactory', () => {
    it('creates SMTP clients on port 25 by default without overriding Node trust', () => {
        const factory = createFactory({})

        expect(factory.create({ host: 'mx.example.com' })).toMatchObject({
            exchange: 'mx.example.com',
            port: 25,
            ca: undefined,
        })
    })

    it('creates SMTP clients on the configured port', () => {
        const factory = createFactory({ SMTP_PORT: 2525 })

        expect(factory.create({ host: 'mx.example.com' })).toMatchObject({ exchange: 'mx.example.com', port: 2525 })
    })

    it('loads the SMTP-only root once and threads the composed trust into each client', () => {
        const get = jest.fn((key: keyof SmtpConfiguration) => {
            const configuration: SmtpConfiguration = { SMTP_TLS_CA_FILE: fixtureCaPath }
            return configuration[key]
        })
        const factory = new SmtpClientFactory({ get } as unknown as ConfigService<SmtpConfiguration, true>)
        const first = factory.create({ host: 'mx.example.com' })
        const second = factory.create({ host: 'mx2.example.com' })
        const customCa = readFileSync(fixtureCaPath, 'utf8')

        expect(first).toMatchObject({ ca: expect.arrayContaining([customCa]) })
        expect(second).toMatchObject({ ca: expect.arrayContaining([customCa]) })
        expect(get).toHaveBeenCalledWith('SMTP_TLS_CA_FILE')
        expect(get.mock.calls.filter(([key]) => key === 'SMTP_TLS_CA_FILE')).toHaveLength(1)
    })
})

function createFactory(configuration: SmtpConfiguration): SmtpClientFactory {
    const configService = {
        get: jest.fn((key: keyof SmtpConfiguration) => configuration[key]),
    } as unknown as ConfigService<SmtpConfiguration, true>

    return new SmtpClientFactory(configService)
}
