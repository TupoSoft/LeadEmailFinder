import { Global, Module } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { BATCH_ADMISSION_STORE } from '../application/delivery/batch/batch-admission-store'
import { BatchAdmissionService } from '../application/delivery/batch/batch-admission.service'
import { BatchAdmissionRecoveryService } from '../application/delivery/batch/batch-admission-recovery.service'
import { BATCH_ADMISSION_RECOVERY } from '../application/ports/batch-admission-recovery'
import { VERIFICATION_CLOCK } from '../application/ports/verification-clock'
import { VERIFICATION_COOLDOWN_READER } from '../application/ports/verification-cooldown-reader'
import { VERIFICATION_EXECUTION_STORE } from '../application/ports/verification-execution-store'
import { VERIFICATION_REQUEST_STORE } from '../application/ports/verification-request-store'
import { VERIFICATION_RESULT_CACHE_READER } from '../application/ports/verification-result-cache-reader'
import { VERIFICATION_SETTLEMENT_STORE } from '../application/ports/verification-settlement-store'
import { VerificationExecutionRunner } from '../application/operations/verification-execution-runner'
import { VerificationReconciler } from '../application/operations/verification-reconciler'
import { VerificationSettlementService } from '../application/operations/verification-settlement.service'
import { BatchAdmissionModule } from './batch-admission.module'
import { EmailVerificationCoreModule } from './email-verification-core.module'
import { TypeOrmBatchAdmissionStore } from './persistence/typeorm-batch-admission.store'
import { BatchEmailVerificationModule } from './queues/batch-verification/batch-email-verification.module'
import { VerificationReconciliationModule } from './queues/verification-reconciliation/verification-reconciliation.module'

// The real core and credits modules need DNS, proxies, and PostgreSQL. These stubs export the same tokens, so the
// admission and reconciliation modules compose their actual providers against them.
jest.mock('./email-verification-core.module', () => {
    const { Module: NestModule } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    const ports: symbol[] = [
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-clock').VERIFICATION_CLOCK,
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-request-store')
            .VERIFICATION_REQUEST_STORE,
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-execution-store')
            .VERIFICATION_EXECUTION_STORE,
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-settlement-store')
            .VERIFICATION_SETTLEMENT_STORE,
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-result-cache-reader')
            .VERIFICATION_RESULT_CACHE_READER,
        jest.requireActual<Record<string, symbol>>('../application/ports/verification-cooldown-reader')
            .VERIFICATION_COOLDOWN_READER,
    ]
    const { VerificationSettlementService: Settlement } = jest.requireActual<
        typeof import('../application/operations/verification-settlement.service')
    >('../application/operations/verification-settlement.service')
    const { VerificationExecutionRunner: Runner } = jest.requireActual<
        typeof import('../application/operations/verification-execution-runner')
    >('../application/operations/verification-execution-runner')
    const providers = [
        ...ports.map(port => ({
            provide: port,
            useValue: { now: () => new Date(0), pageNonterminal: () => Promise.resolve([]) },
        })),
        { provide: Settlement, useValue: {} },
        { provide: Runner, useValue: {} },
    ]
    class EmailVerificationCoreModule {}
    NestModule({ providers, exports: providers.map(provider => provider.provide) })(EmailVerificationCoreModule)
    return { EmailVerificationCoreModule }
})

jest.mock('@nestjs/typeorm', () => {
    const actual = jest.requireActual<typeof import('@nestjs/typeorm')>('@nestjs/typeorm')
    return {
        ...actual,
        TypeOrmModule: { ...actual.TypeOrmModule, forFeature: () => ({ module: class TypeOrmFeatureStub {} }) },
    }
})

jest.mock('@nestjs/bullmq', () => {
    const actual = jest.requireActual<typeof import('@nestjs/bullmq')>('@nestjs/bullmq')
    return {
        ...actual,
        BullModule: {
            ...actual.BullModule,
            registerQueue: ({ name }: { name: string }) => ({
                module: class BullQueueStub {},
                providers: [{ provide: actual.getQueueToken(name), useValue: { upsertJobScheduler: jest.fn() } }],
                exports: [actual.getQueueToken(name)],
            }),
        },
    }
})

jest.mock('@tuposoft/lead-email-finder/modules/credits', () => {
    const actual = jest.requireActual<typeof import('@tuposoft/lead-email-finder/modules/credits')>(
        '@tuposoft/lead-email-finder/modules/credits',
    )
    const { Module: NestModule } = jest.requireActual<typeof import('@nestjs/common')>('@nestjs/common')
    class CreditsModule {}
    NestModule({
        providers: [{ provide: actual.CreditReservationService, useValue: {} }],
        exports: [actual.CreditReservationService],
    })(CreditsModule)
    return { ...actual, CreditsModule }
})

@Global()
@Module({ providers: [{ provide: DataSource, useValue: {} }], exports: [DataSource] })
class DataSourceStubModule {}

function importsOf(module: object): unknown[] {
    return (Reflect.getMetadata('imports', module) as unknown[] | undefined) ?? []
}

describe(BatchAdmissionModule.name, () => {
    const modules: TestingModule[] = []

    afterEach(async () => {
        await Promise.all(modules.splice(0).map(module => module.close()))
    })

    async function compile(module: object): Promise<TestingModule> {
        const compiled = await Test.createTestingModule({ imports: [DataSourceStubModule, module as never] }).compile()
        modules.push(compiled)
        return compiled
    }

    it('composes the admission store, service, and recovery port', async () => {
        const compiled = await compile(BatchAdmissionModule)

        expect(compiled.get(BATCH_ADMISSION_STORE)).toBeInstanceOf(TypeOrmBatchAdmissionStore)
        expect(compiled.get(BatchAdmissionService)).toBeInstanceOf(BatchAdmissionService)
        expect(compiled.get(BATCH_ADMISSION_RECOVERY)).toBeInstanceOf(BatchAdmissionRecoveryService)
    })

    it('wires group recovery into the reconciler without the batch queue module', async () => {
        const compiled = await compile(VerificationReconciliationModule)
        const reconciler = compiled.get(VerificationReconciler)
        const recovery = compiled.get(BATCH_ADMISSION_RECOVERY, { strict: false })
        const reconcile = jest
            .spyOn(recovery, 'reconcile')
            .mockResolvedValue({ groupsChecked: 0, groupsCompleted: 0, groupsFailed: 0 })
        Object.assign(compiled.get(VERIFICATION_EXECUTION_STORE, { strict: false }), {
            pageCanceledPendingCleanup: () => Promise.resolve([]),
        })
        Object.assign(compiled.get(VERIFICATION_SETTLEMENT_STORE, { strict: false }), {
            pagePendingIntentions: () => Promise.resolve([]),
        })

        await reconciler.reconcile(7)

        expect(reconcile).toHaveBeenCalledWith(7)
        expect(importsOf(VerificationReconciliationModule)).toContain(BatchAdmissionModule)
        expect(importsOf(VerificationReconciliationModule)).not.toContain(BatchEmailVerificationModule)
    })

    it('keeps the dependency graph acyclic: core never imports admission or queue modules', () => {
        expect(importsOf(BatchAdmissionModule)).toContain(EmailVerificationCoreModule)
        expect(importsOf(BatchAdmissionModule)).not.toContain(VerificationReconciliationModule)
        expect(importsOf(BatchAdmissionModule)).not.toContain(BatchEmailVerificationModule)
        expect(importsOf(BatchEmailVerificationModule)).toContain(BatchAdmissionModule)
    })

    it('leaves the reconciler to the reconciliation module and resolves the unchanged shared tokens', async () => {
        const compiled = await compile(BatchAdmissionModule)

        expect(() => compiled.get(VerificationReconciler, { strict: false })).toThrow()
        for (const token of [
            VERIFICATION_CLOCK,
            VERIFICATION_REQUEST_STORE,
            VERIFICATION_RESULT_CACHE_READER,
            VERIFICATION_COOLDOWN_READER,
            VerificationSettlementService,
            VerificationExecutionRunner,
            CreditReservationService,
        ]) {
            expect(compiled.get(token, { strict: false })).toBeDefined()
        }
    })
})
