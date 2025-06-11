import { loadSecrets } from './load-secrets'
import { existsSync, readFileSync } from 'node:fs'
import { afterEach } from '@jest/globals'

jest.mock('node:fs')
jest.mock('node:console')

jest.spyOn(console, 'error').mockImplementation(() => {})
jest.spyOn(console, 'warn').mockImplementation(() => {})

describe('loadSecrets', () => {
    const existsSyncMock = existsSync as jest.MockedFunction<typeof existsSync>
    const readFileSyncMock = readFileSync as jest.MockedFunction<typeof readFileSync>

    const mockProcessEnv = (env: NodeJS.ProcessEnv) => {
        process.env = { ...env }
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should load secrets from files specified in environment variables', () => {
        mockProcessEnv({
            SECRET_API_KEY_FILE: '/path/to/secret-key',
        })

        existsSyncMock.mockReturnValue(true)
        readFileSyncMock.mockReturnValue('dummy-secret-key')

        const secrets = loadSecrets()

        expect(secrets).toEqual({
            SECRET_API_KEY: 'dummy-secret-key',
        })
        expect(readFileSync).toHaveBeenCalledWith('/path/to/secret-key', 'utf8')
    })

    it('should skip loading if the environment variable does not end with _FILE', () => {
        mockProcessEnv({
            SECRET_API_KEY: '/path/to/secret-key',
        })

        const secrets = loadSecrets()

        expect(secrets).toEqual({})
        expect(readFileSync).not.toHaveBeenCalled()
    })

    it('should skip loading if the file does not exist', () => {
        mockProcessEnv({
            SECRET_API_KEY_FILE: '/path/to/secret-key',
        })
        existsSyncMock.mockReturnValue(false)

        const secrets = loadSecrets()

        expect(secrets).toEqual({})
        expect(readFileSync).not.toHaveBeenCalled()
    })

    it('should parse JSON content if the file has a .json extension', () => {
        mockProcessEnv({
            SECRET_CONFIG_FILE: '/path/to/config.json',
        })

        existsSyncMock.mockReturnValue(true)
        readFileSyncMock.mockReturnValue('{"key":"value"}')

        const secrets = loadSecrets()

        expect(secrets).toEqual({
            SECRET_CONFIG: { key: 'value' },
        })
    })

    it('should use raw string if JSON parsing fails', () => {
        mockProcessEnv({
            SECRET_CONFIG_FILE: '/path/to/config.json',
        })

        existsSyncMock.mockReturnValue(true)
        readFileSyncMock.mockReturnValue('INVALID_JSON')

        const secrets = loadSecrets()

        expect(secrets).toEqual({
            SECRET_CONFIG: 'INVALID_JSON',
        })
        expect(console.error).toHaveBeenCalled()
        expect(console.warn).toHaveBeenCalledWith(
            'Secret-file loader: failed to parse JSON from /path/to/config.json; using raw string.',
        )
    })
})
