import { setTimeout as delay } from 'node:timers/promises'
import {
    parseVerificationCommand,
    VerificationCommand,
    VerificationResult,
} from '@tuposoft/lead-email-finder-verification-contracts'
import { CloudflareQueuesClient, QueueMessage } from '@tuposoft/lead-email-finder-verification-contracts/queues'
import { loadConfiguration, smtpIdentity, WorkerConfiguration } from './configuration'
import { MailboxVerifier } from './mailbox-verifier'

function log(event: string, fields: { executionId?: string; attemptId?: string } = {}): void {
    process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`)
}

async function publishWithRetry(
    client: CloudflareQueuesClient,
    queueId: string,
    result: VerificationResult,
    signal: AbortSignal,
): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
        signal.throwIfAborted()

        try {
            await client.publish(queueId, result, signal)
            return
        } catch (error) {
            if (attempt >= 4 || signal.aborted) {
                throw error
            }

            const retryDelayMs = Math.min(1000 * 2 ** attempt, 8000)
            await delay(retryDelayMs, undefined, { signal })
        }
    }
}

async function processMessage(
    message: QueueMessage,
    client: CloudflareQueuesClient,
    verifier: MailboxVerifier,
    configuration: WorkerConfiguration,
    shutdown: AbortSignal,
): Promise<void> {
    let command: VerificationCommand

    try {
        command = parseVerificationCommand(message.body)
    } catch {
        log('verification_command_invalid')
        await client.retry(configuration.VERIFICATION_QUEUE_ID, message.leaseId, 10, shutdown)
        return
    }

    const identity = {
        executionId: command.executionId,
        attemptId: command.attemptId,
    }

    if (Date.parse(command.deadlineAt) <= Date.now()) {
        await client.ack(configuration.VERIFICATION_QUEUE_ID, message.leaseId, shutdown)
        log('verification_command_expired', identity)
        return
    }

    const remainingTimeMs = Date.parse(command.deadlineAt) - Date.now()
    const processingTimeoutMs = Math.min(240_000, remainingTimeMs)
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(processingTimeoutMs)])

    try {
        let result: VerificationResult

        try {
            result = await verifier.verify(command, signal)
        } catch {
            signal.throwIfAborted()

            result = {
                version: 1,
                ...identity,
                organizationId: command.organizationId,
                outcome: 'retryable-failure',
                failureReason: 'probe_failed',
            }
        }

        await publishWithRetry(client, configuration.VERIFICATION_RESULTS_QUEUE_ID, result, signal)
        await client.ack(configuration.VERIFICATION_QUEUE_ID, message.leaseId, signal)
        log('verification_result_published', identity)
    } catch {
        log(signal.aborted ? 'verification_attempt_canceled' : 'verification_attempt_failed', identity)

        // Publication/acknowledgment uncertainty leaves the command eligible for delivery again.
        if (!shutdown.aborted) {
            await client.retry(configuration.VERIFICATION_QUEUE_ID, message.leaseId, 10, shutdown).catch(() => {})
        }
    }
}

async function main(): Promise<void> {
    const configuration = loadConfiguration()
    const shutdown = new AbortController()
    const verifier = new MailboxVerifier(smtpIdentity(configuration))
    const client = new CloudflareQueuesClient({
        accountId: configuration.CLOUDFLARE_ACCOUNT_ID,
        apiToken: configuration.CLOUDFLARE_API_TOKEN,
    })

    const activeTasks = new Set<Promise<void>>()
    const stop = (): void => {
        shutdown.abort()
    }

    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)
    log('verification_worker_started')

    try {
        while (!shutdown.signal.aborted) {
            if (activeTasks.size === 5) {
                await Promise.race(activeTasks)
                continue
            }

            try {
                const messages = await client.pull(
                    configuration.VERIFICATION_QUEUE_ID,
                    5 - activeTasks.size,
                    300_000,
                    shutdown.signal,
                )

                for (const message of messages) {
                    if (shutdown.signal.aborted) {
                        break
                    }

                    const task = processMessage(message, client, verifier, configuration, shutdown.signal)
                        .catch(() => {
                            log('verification_message_processing_failed')
                        })
                        .finally(() => {
                            activeTasks.delete(task)
                        })

                    activeTasks.add(task)
                }

                if (!messages.length) {
                    await delay(1000, undefined, { signal: shutdown.signal })
                }
            } catch {
                if (!shutdown.signal.aborted) {
                    log('verification_queue_poll_failed')
                    await delay(5000, undefined, { signal: shutdown.signal }).catch(() => {})
                }
            }
        }
    } finally {
        shutdown.abort()
        await Promise.allSettled(activeTasks)

        process.removeListener('SIGTERM', stop)
        process.removeListener('SIGINT', stop)
        log('verification_worker_stopped')
    }
}

void main().catch(() => {
    log('verification_worker_startup_failed')
    process.exitCode = 1
})
