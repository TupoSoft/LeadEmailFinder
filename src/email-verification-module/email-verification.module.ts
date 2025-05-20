import { Module } from '@nestjs/common'
import { SmtpModule } from '../smtp-module'
import { CatchAllModule } from '../catch-all'

@Module({
    imports: [SmtpModule, CatchAllModule],
})
export class EmailVerificationModule {}
