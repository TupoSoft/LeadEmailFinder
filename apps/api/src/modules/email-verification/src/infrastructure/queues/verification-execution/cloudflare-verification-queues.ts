import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { setTimeout as sleep } from 'node:timers/promises'
import { parseVerificationResult } from '@tuposoft/lead-email-finder-verification-contracts'
import { CloudflareQueuesClient } from '@tuposoft/lead-email-finder-verification-contracts/queues'
import { TypeOrmVerificationQueueStore } from '../../persistence/typeorm-verification-queue.store'
import { VerificationSettlementService } from '../../../application/operations/verification-settlement.service'

/** The HTTP process owns publication/recovery and settlement; it never performs a probe. */
@Injectable()
export class CloudflareVerificationQueues implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CloudflareVerificationQueues.name)
    private readonly controller = new AbortController()
    private readonly client: CloudflareQueuesClient | null
    private readonly verificationQueueId: string
    private readonly resultsQueueId: string
    private loop: Promise<void> | undefined

    constructor(
        config: ConfigService,
        private readonly store: TypeOrmVerificationQueueStore,
        private readonly settlement: VerificationSettlementService,
    ) {
        const accountId = config.get<string>('CLOUDFLARE_ACCOUNT_ID')
        const apiToken = config.get<string>('CLOUDFLARE_API_TOKEN')
        this.verificationQueueId = config.get<string>('VERIFICATION_QUEUE_ID') ?? ''
        this.resultsQueueId = config.get<string>('VERIFICATION_RESULTS_QUEUE_ID') ?? ''

        if (
            !accountId &&
            !apiToken &&
            !this.verificationQueueId &&
            !this.resultsQueueId &&
            config.get<string>('NODE_ENV') === 'test'
        ) {
            this.client = null
            return
        }

        if (
            !accountId ||
            !apiToken ||
            !/^[a-f0-9]{32}$/i.test(this.verificationQueueId) ||
            !/^[a-f0-9]{32}$/i.test(this.resultsQueueId)
        ) {
            throw new Error('cloudflare_verification_queues_configuration_required')
        }

        this.client = new CloudflareQueuesClient({ accountId, apiToken })
    }

    onModuleInit(): void {
        if (this.client) {
            this.loop = this.run(this.client)
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.controller.abort()
        await this.loop
    }

    private async run(client: CloudflareQueuesClient): Promise<void> {
        // Each direction has its own loop: a slow input queue must never delay result settlement.
        const publicationLoop = this.poll(() => this.publishPending(client))
        const resultsLoop = this.poll(() => this.consumeResults(client))

        await Promise.all([publicationLoop, resultsLoop])
    }

    private async poll(work: () => Promise<void>): Promise<void> {
        const { signal } = this.controller

        while (!signal.aborted) {
            await work()

            await sleep(1000, undefined, { signal }).catch(() => {})
        }
    }

    private async publishPending(client: CloudflareQueuesClient): Promise<void> {
        try {
            const commands = await this.store.pendingCommands(100)

            for (const command of commands) {
                if (this.controller.signal.aborted) {
                    return
                }

                await client.publish(this.verificationQueueId, command, this.controller.signal)

                await this.store.markPublished(command.attemptId)
            }
        } catch {
            if (!this.controller.signal.aborted) {
                this.logger.error('verification_command_publication_failed')
            }
        }
    }

    private async consumeResults(client: CloudflareQueuesClient): Promise<void> {
        try {
            const messages = await client.pull(this.resultsQueueId, 10, 300_000, this.controller.signal)

            for (const message of messages) {
                if (this.controller.signal.aborted) {
                    return
                }

                try {
                    const result = parseVerificationResult(message.body)
                    const applied = await this.store.applyResult(result, new Date())

                    if (applied === 'settle') {
                        await this.settlement.settle(result.executionId, result.organizationId)
                    }

                    await client.ack(this.resultsQueueId, message.leaseId, this.controller.signal)
                } catch {
                    this.logger.error('verification_result_processing_failed')

                    await client.retry(this.resultsQueueId, message.leaseId, 10, this.controller.signal)
                }
            }
        } catch {
            if (!this.controller.signal.aborted) {
                this.logger.error('verification_result_intake_failed')
            }
        }
    }
}
