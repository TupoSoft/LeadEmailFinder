import { Module } from '@nestjs/common'
import { LoggerModule } from 'pino-nestjs'

@Module({
    imports: [LoggerModule.forRoot()],
})
export class ProxyModule {}
