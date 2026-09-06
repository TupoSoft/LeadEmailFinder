import { Module } from '@nestjs/common'
import { SmtpModule } from './smtp'

@Module({
    imports: [SmtpModule],
    exports: [SmtpModule],
})
export class EmailVerifierModule {}
