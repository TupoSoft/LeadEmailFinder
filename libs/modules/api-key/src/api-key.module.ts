import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { LoggerModule } from 'pino-nestjs'
import { ApiKeySchema, Key } from './models/api-key.schema'
import { ApiKeyGuard } from './application/api-key.guard'
import { ApiKeyService } from './application/api-key.service'

@Module({
    imports: [MongooseModule.forFeature([{ name: Key.name, schema: ApiKeySchema }]), LoggerModule.forRoot()],
    providers: [ApiKeyGuard, ApiKeyService],
    exports: [ApiKeyGuard, ApiKeyService],
})
export class ApiKeyModule {}
