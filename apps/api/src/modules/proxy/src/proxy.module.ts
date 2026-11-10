import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { ProxyAllocatorService } from './application/proxy-allocator.service'
import { ProxyLeaseService } from './application/proxy-lease.service'
import { ProxyRegistryService } from './application/proxy-registry.service'
import { ProxyService } from './application/proxy.service'
import { PROXY_CANDIDATE_REPOSITORY_TOKEN, ProxyCandidateRepository } from './application/ports/proxy-candidate-repository'
import { PROXY_LEASE_STORE, ProxyLeaseStore } from './application/ports/proxy-lease-store'
import { PROXY_REPOSITORY, ProxyRepository } from './application/ports/proxy-repository'
import {
    ALLOCATION_OBSERVER_TOKEN,
    PROXY_ALLOCATOR_TOKEN,
    PROXY_LEASE_SERVICE_TOKEN,
    PROXY_SERVICE_TOKEN,
} from './domain/proxy.tokens'
import { IAllocationObserver } from './domain/allocation-observer.interface'
import { IProxyLeaseService } from './domain/proxy-lease.interface'
import { StructuredLoggingAllocationObserver } from './infrastructure/observability/structured-logging-allocation-observer'
import { Proxy } from './infrastructure/persistence/proxy.entity'
import { TypeOrmProxyCandidateRepository } from './infrastructure/persistence/typeorm-proxy-candidate.repository'
import { TypeOrmProxyRepository } from './infrastructure/persistence/typeorm-proxy-repository'
import { RedisProxyLeaseStore } from './infrastructure/redis/redis-proxy-lease-store'

const DEFAULT_MX_REQUESTS_PER_MINUTE = 10
const DEFAULT_LEASE_TTL_MS = 60_000

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([Proxy])],
    providers: [
        RolePermissionPolicy,
        PermissionsGuard,
        TypeOrmProxyRepository,
        TypeOrmProxyCandidateRepository,
        RedisProxyLeaseStore,
        StructuredLoggingAllocationObserver,
        { provide: PROXY_REPOSITORY, useExisting: TypeOrmProxyRepository },
        { provide: PROXY_CANDIDATE_REPOSITORY_TOKEN, useExisting: TypeOrmProxyCandidateRepository },
        { provide: PROXY_LEASE_STORE, useExisting: RedisProxyLeaseStore },
        { provide: ALLOCATION_OBSERVER_TOKEN, useExisting: StructuredLoggingAllocationObserver },
        {
            provide: ProxyService,
            useFactory: (repository: ProxyRepository) => new ProxyService(repository),
            inject: [PROXY_REPOSITORY],
        },
        {
            provide: ProxyRegistryService,
            useFactory: (repository: ProxyRepository) => new ProxyRegistryService(repository),
            inject: [PROXY_REPOSITORY],
        },
        {
            provide: ProxyLeaseService,
            useFactory: (store: ProxyLeaseStore, configService: ConfigService) =>
                new ProxyLeaseService(
                    store,
                    configService.get<number>('PROXY_MX_REQUESTS_PER_MINUTE') ?? DEFAULT_MX_REQUESTS_PER_MINUTE,
                    configService.get<number>('PROXY_LEASE_TTL_MS') ?? DEFAULT_LEASE_TTL_MS,
                ),
            inject: [PROXY_LEASE_STORE, ConfigService],
        },
        {
            provide: ProxyAllocatorService,
            useFactory: (
                candidateRepository: ProxyCandidateRepository,
                proxyLeaseService: IProxyLeaseService,
                observer: IAllocationObserver,
            ) => new ProxyAllocatorService(candidateRepository, proxyLeaseService, observer),
            inject: [PROXY_CANDIDATE_REPOSITORY_TOKEN, ProxyLeaseService, ALLOCATION_OBSERVER_TOKEN],
        },
        { provide: PROXY_LEASE_SERVICE_TOKEN, useExisting: ProxyLeaseService },
        { provide: PROXY_ALLOCATOR_TOKEN, useExisting: ProxyAllocatorService },
        { provide: PROXY_SERVICE_TOKEN, useExisting: ProxyRegistryService },
    ],
    exports: [PROXY_ALLOCATOR_TOKEN, ALLOCATION_OBSERVER_TOKEN, PROXY_SERVICE_TOKEN],
})
export class ProxyModule {}
