import { HttpModuleOptions, HttpModuleOptionsFactory } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Injectable } from '@nestjs/common'

@Injectable()
export class CatchAllHttpModuleOptionsFactory implements HttpModuleOptionsFactory {
    private readonly catchAllHttpProxyUrl: URL

    constructor(configService: ConfigService<{ CATCH_ALL_HTTP_PROXY_URL: string }, true>) {
        const proxyUrlString = configService.get<string>('CATCH_ALL_HTTP_PROXY_URL')
        this.catchAllHttpProxyUrl = new URL(proxyUrlString)
    }

    createHttpOptions(): Promise<HttpModuleOptions> | HttpModuleOptions {
        const { protocol: scheme, hostname: host, port: portStr, username, password } = this.catchAllHttpProxyUrl

        const protocol = scheme.replace(':', '')
        const port = parseInt(portStr)

        return {
            proxy: {
                host,
                port,
                protocol,
                auth: {
                    username,
                    password,
                },
            },
        }
    }
}
