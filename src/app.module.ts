import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { EmailModule } from './email-module'
import secrets from './config/secrets.config'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { ParseConnectionStringOptionsFactory, RedisModule } from './redis'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [secrets],
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
        AutomapperModule.forRoot({
            strategyInitializer: classes(),
        }),
        RedisModule.registerAsync({
            imports: [ConfigModule],
            useClass: ParseConnectionStringOptionsFactory,
        }),
        EmailModule,
    ],
})
export class AppModule {}
