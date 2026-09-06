import { ConfigService } from '@nestjs/config'
import { HttpModuleOptionsFactoryImpl } from './http-module-options.factory'

describe('HttpModuleOptionsFactoryImpl', () => {
    it('redacts malformed proxy credentials from thrown errors', () => {
        const sentinel = 'proxy-credential-sentinel@example.test'
        const proxyUrl = `http://${sentinel}:${encodeURIComponent(sentinel)}@[invalid-host`
        const configService = {
            get: jest.fn().mockReturnValue(proxyUrl),
        } as unknown as ConfigService<{ CATCH_ALL_HTTP_PROXY_URL?: string }, true>
        let caught: unknown

        try {
            new HttpModuleOptionsFactoryImpl(configService)
        } catch (error) {
            caught = error
        }

        expect(caught).toMatchObject({ message: 'account-discovery-proxy-configuration-invalid' })
        expect(caught).not.toHaveProperty('cause')
        expect(caught).not.toHaveProperty('input')
        expect(String(caught)).not.toContain(sentinel)
        expect(String(caught)).not.toContain(encodeURIComponent(sentinel))
        expect(JSON.stringify(caught)).not.toContain(sentinel)
        expect(JSON.stringify(caught)).not.toContain(encodeURIComponent(sentinel))
    })

    it('does not configure a proxy when CATCH_ALL_HTTP_PROXY_URL is absent', () => {
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService<{ CATCH_ALL_HTTP_PROXY_URL?: string }, true>

        const factory = new HttpModuleOptionsFactoryImpl(configService)

        expect(factory.createHttpOptions()).toEqual({})
    })

    it('configures Axios with the supplied proxy URL', () => {
        const configService = {
            get: jest.fn().mockReturnValue('http://username:password@proxy.example:8080'),
        } as unknown as ConfigService<{ CATCH_ALL_HTTP_PROXY_URL?: string }, true>

        const factory = new HttpModuleOptionsFactoryImpl(configService)

        expect(factory.createHttpOptions()).toEqual({
            proxy: {
                host: 'proxy.example',
                port: 8080,
                protocol: 'http',
                auth: { username: 'username', password: 'password' },
            },
        })
    })
})
