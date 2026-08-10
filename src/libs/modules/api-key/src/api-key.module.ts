import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LoggerModule } from 'pino-nestjs'
import { Key } from './models/key.entity'
import { ApiKeyGuard } from './application/api-key.guard'
import { ApiKeyService } from './application/api-key.service'
import { AdminKeySeeder } from './application/admin-key-seeder.service'

@Module({
    imports: [TypeOrmModule.forFeature([Key]), LoggerModule.forRoot()],
    providers: [ApiKeyGuard, ApiKeyService, AdminKeySeeder],
    exports: [ApiKeyGuard, ApiKeyService],
})
export class ApiKeyModule {}
