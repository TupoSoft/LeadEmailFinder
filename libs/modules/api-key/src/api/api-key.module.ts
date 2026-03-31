import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ApiKeySchema, Key } from '../models/api-key.schema'
import { ApiKeyService } from '../api-key.service'

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Key.name, schema: ApiKeySchema }], 'api-key'),
    ],
    providers: [ApiKeyService],
    exports: [ApiKeyService],
})
export class ApiKeyModule {}
