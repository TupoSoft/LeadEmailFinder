import { Module } from '@nestjs/common'
import { LeadEmailFinderApiModule } from '../../lead-email-finder-api/src'
import { AsyncEmailVerificationWorkerModule } from '../../async-email-verification-worker/src'
import { ApiKeyModule } from '../../api-key/src/api-key.module'

@Module({
    imports: [LeadEmailFinderApiModule, AsyncEmailVerificationWorkerModule, ApiKeyModule],
    controllers: [],
    providers: [],
})
export class LeadEmailFinderModule {}
