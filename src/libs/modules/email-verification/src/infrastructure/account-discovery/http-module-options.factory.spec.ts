import { ConfigService } from '@nestjs/config'
import { HttpModuleOptionsFactoryImpl } from './http-module-options.factory'

describe('HttpModuleOptionsFactoryImpl', () => {
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
