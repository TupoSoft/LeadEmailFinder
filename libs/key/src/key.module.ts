import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { KeyService } from './key.service'
import { KeyController } from './key.controller'
import { Key, KeySchema } from './key.schema'
import { UserModule } from '../user/user.module'

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Key.name, schema: KeySchema }]),
        forwardRef(() => UserModule), // Use forwardRef to avoid circular dependency
    ],
    controllers: [KeyController],
    providers: [KeyService],
    exports: [KeyService],
})
export class KeyModule {}
