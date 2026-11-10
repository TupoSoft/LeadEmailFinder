import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { getCACertificates } from 'node:tls'
import { loadSmtpTlsCa } from './smtp-trust'

type TlsModule = typeof import('node:tls')

jest.mock('node:tls', () => ({
    ...jest.requireActual<TlsModule>('node:tls'),
    getCACertificates: jest.fn(),
}))

const getCACertificatesMock = jest.mocked(getCACertificates)
const fixtureCaPath = resolve(__dirname, '../../api/test/fixtures/smtp-tls/ca.crt')

describe('loadSmtpTlsCa', () => {
    beforeEach(() => {
        getCACertificatesMock.mockReset()
    })

    it('omits ca when no SMTP-only root is configured', () => {
        expect(loadSmtpTlsCa(undefined)).toBeUndefined()
        expect(getCACertificatesMock).not.toHaveBeenCalled()
    })

    it('preserves the effective default trust set before appending the configured SMTP-only root', () => {
        const customCaPem = readFileSync(fixtureCaPath, 'utf8')
        getCACertificatesMock.mockReturnValue(['recognizable-default-root'])

        expect(loadSmtpTlsCa(fixtureCaPath)).toEqual(['recognizable-default-root', customCaPem])
        expect(getCACertificatesMock).toHaveBeenCalledWith('default')
    })

    it('rejects malformed custom CA material during startup loading', () => {
        const directory = mkdtempSync(resolve(tmpdir(), 'lef-smtp-ca-'))
        const malformedPath = resolve(directory, 'malformed.pem')
        writeFileSync(malformedPath, 'not a certificate')

        expect(() => loadSmtpTlsCa(malformedPath)).toThrow()
    })
})
