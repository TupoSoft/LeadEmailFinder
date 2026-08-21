import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Proxy } from './proxy.entity'
import { ProxyProfile } from './proxy.profile'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ConfigModule } from '@nestjs/config'
import { ProxyLeaseService } from './proxy-lease.service'
import { ProxyAllocatorService } from './proxy-allocator.service'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_LEASE_SERVICE_TOKEN,
    PROXY_SERVICE_TOKEN,
} from '@tuposoft/lead-email-finder/common'
import { PROXY_CANDIDATE_REPOSITORY_TOKEN } from './proxy-candidate.repository'
import { TypeOrmProxyCandidateRepository } from './typeorm-proxy-candidate.repository'
import { StructuredLoggingAllocationObserver } from './structured-logging-allocation-observer'
import { ProxyRegistryService } from './proxy-registry.service'

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([Proxy]),
    ],
    providers: [
        ProxyProfile,
        ProxyService,
        ProxyLeaseService,
        ProxyAllocatorService,
        ProxyRegistryService,
        TypeOrmProxyCandidateRepository,
        StructuredLoggingAllocationObserver,
        RolePermissionPolicy,
        PermissionsGuard,
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
        {
            provide: PROXY_SERVICE_TOKEN,
            useExisting: ProxyRegistryService,
        },
    ],
    controllers: [ProxyController],
    exports: [PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN, PROXY_SERVICE_TOKEN],
})
export class ProxyModule {}
