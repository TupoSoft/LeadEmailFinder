import { Module } from '@nestjs/common'
import { LeadEmailFinderApiModule } from '../../lead-email-finder-api/src'
import { AsyncEmailVerificationWorkerModule } from '../../async-email-verification-worker/src'
import { ProxyModule } from '../../proxy/src/proxy.module'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [LeadEmailFinderApiModule, AsyncEmailVerificationWorkerModule, ApiKeyModule, ProxyModule],
    controllers: [],
    providers: [],
})
export class LeadEmailFinderModule {}
