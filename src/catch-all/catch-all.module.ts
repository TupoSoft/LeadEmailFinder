import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { CatchAllHttpModuleOptionsFactory } from './catch-all-http-module-options.factory'

@Module({
    imports: [
        HttpModule.registerAsync({
            useClass: CatchAllHttpModuleOptionsFactory,
        }),
    ],
})
export class CatchAllModule {}
