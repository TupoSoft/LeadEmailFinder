import { Module } from '@nestjs/common'
import { LoggerModule } from 'pino-nestjs'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Environment, loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { EnvDto } from './env.dto'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Proxy } from './proxy.entity'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { ProxyProfile } from './proxy.profile'
import { AddProxyHandler } from './add-proxy/add-proxy.handler'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { CqrsModule } from '@nestjs/cqrs'

@Module({
    imports: [
        LoggerModule.forRoot(),
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvDto, config),
            cache: env.NODE_ENV === Environment.Production,
        }),
        TypeOrmModule.forRootAsync({
            name: 'proxy',
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                url: configService.get('POSTGRES_URL'),
                autoLoadEntities: true,
                synchronize: configService.get('TYPEORM_SYNCHRONIZE'),
            }),
            inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([Proxy], 'proxy'),
        AutomapperModule.forRoot({
            strategyInitializer: classes(),
        }),
        CqrsModule.forRoot(),
    ],
    providers: [ProxyProfile, ProxyService, AddProxyHandler],
    controllers: [ProxyController],
})
export class ProxyModule {}
