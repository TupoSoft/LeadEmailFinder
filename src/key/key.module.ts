import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { KeyService } from './key.service'
import { KeyController } from './key.controller'
import { Key, KeySchema } from './key.schema'

@Module({
    imports: [MongooseModule.forFeature([{ name: Key.name, schema: KeySchema }])],
    controllers: [KeyController],
    providers: [KeyService],
    exports: [KeyService],
})
export class KeyModule {}
