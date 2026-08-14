import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Proxy } from './proxy.entity'
import { ProxyProfile } from './proxy.profile'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { ApiKeyModule } from '@tuposoft/lead-email-finder/modules/api-key'
import { ConfigModule } from '@nestjs/config'
import { ProxyLeaseService } from './proxy-lease.service'
import { ProxyAllocatorService } from './proxy-allocator.service'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_LEASE_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'
import { PROXY_CANDIDATE_REPOSITORY_TOKEN } from './proxy-candidate.repository'
import { TypeOrmProxyCandidateRepository } from './typeorm-proxy-candidate.repository'
import { StructuredLoggingAllocationObserver } from './structured-logging-allocation-observer'

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Proxy]),
        ApiKeyModule,
    ],
    providers: [
        ProxyProfile,
        ProxyService,
        ProxyLeaseService,
        ProxyAllocatorService,
        TypeOrmProxyCandidateRepository,
        StructuredLoggingAllocationObserver,
        {
            provide: PROXY_CANDIDATE_REPOSITORY_TOKEN,
            useExisting: TypeOrmProxyCandidateRepository,
        },
        {
            provide: PROXY_LEASE_SERVICE_TOKEN,
            useExisting: ProxyLeaseService,
        },
        {
            provide: PROXY_ALLOCATOR_TOKEN,
            useExisting: ProxyAllocatorService,
        },
        {
            provide: ALLOCATION_OBSERVER_TOKEN,
            useExisting: StructuredLoggingAllocationObserver,
        },
    ],
    controllers: [ProxyController],
    exports: [PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN],
})
export class ProxyModule {}
