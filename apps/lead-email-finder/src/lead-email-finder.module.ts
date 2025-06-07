import { Module } from '@nestjs/common'
import { LeadEmailFinderApiModule } from '../../lead-email-finder-api/src'
import { AsyncEmailVerificationWorkerModule } from '../../async-email-verification-worker/src'

@Module({
    imports: [LeadEmailFinderApiModule, AsyncEmailVerificationWorkerModule],
    controllers: [],
    providers: [],
})
export class LeadEmailFinderModule {}
