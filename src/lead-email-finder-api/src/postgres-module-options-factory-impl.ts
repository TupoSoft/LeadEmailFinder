import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm'
import { Environment } from '@tuposoft/lead-email-finder/config'
import type { TlsOptions } from 'node:tls'
import { EnvironmentVariablesDto } from './environment-variables.dto'

const POSTGRES_TLS_QUERY_PARAMETERS = new Set(['ssl', 'sslcert', 'sslkey', 'sslmode', 'sslrootcert'])

@Injectable()
export class PostgresModuleOptionsFactoryImpl implements TypeOrmOptionsFactory {
    constructor(private readonly configService: ConfigService<EnvironmentVariablesDto, true>) {}

    createTypeOrmOptions(): TypeOrmModuleOptions {
        const environment = this.configService.get<Environment>('NODE_ENV')
        const url = this.configService.get<string>('POSTGRES_URL')
        const synchronize = this.configService.get<boolean>('TYPEORM_SYNCHRONIZE')

        if (environment !== Environment.Production) {
            return this.createOptions(url, synchronize)
        }

        this.assertNoTlsOverrides(url)

        const ca = this.configService.get<string | undefined>('POSTGRES_TLS_CA')

        return this.createOptions(url, synchronize, {
            rejectUnauthorized: true,
            ...(ca ? { ca } : {}),
        })
    }

    private createOptions(url: string, synchronize: boolean, ssl?: TlsOptions): TypeOrmModuleOptions {
        return {
            type: 'postgres',
            url,
            autoLoadEntities: true,
            synchronize,
            ...(ssl ? { ssl } : {}),
        }
    }

    private assertNoTlsOverrides(url: string): void {
        let parsedUrl: URL

        try {
            parsedUrl = new URL(url)
        } catch {
            throw new Error('POSTGRES_URL: invalid-url')
        }

        const hasTlsOverride = [...parsedUrl.searchParams.keys()].some(parameter =>
            POSTGRES_TLS_QUERY_PARAMETERS.has(parameter.toLowerCase()),
        )

        if (hasTlsOverride) {
            throw new Error('POSTGRES_URL: tls-override-not-allowed')
        }
    }
}
