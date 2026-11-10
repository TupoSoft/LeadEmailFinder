import { z } from 'zod'

export interface QueueMessage {
    id: string
    leaseId: string
    body: unknown
}

interface QueueClientOptions {
    accountId: string
    apiToken: string
    fetch?: typeof fetch
}

const responseSchema = z.object({
    success: z.boolean(),
    result: z.unknown().optional(),
})

const pullResultSchema = z.object({
    messages: z.array(
        z.object({
            id: z.string(),
            lease_id: z.string(),
            body: z.unknown(),
            metadata: z.record(z.string(), z.unknown()).optional(),
        }),
    ),
})

function decodeMessageBody(body: unknown, contentType: unknown): unknown {
    if (contentType === 'v8') {
        return null
    }

    if (typeof body !== 'string' || (contentType !== 'json' && contentType !== 'text')) {
        return body
    }

    try {
        return JSON.parse(body) as unknown
    } catch {
        if (contentType !== 'json') {
            return null
        }
    }

    try {
        const decodedBody = Buffer.from(body, 'base64').toString('utf8')

        return JSON.parse(decodedBody) as unknown
    } catch {
        // Keep the receipt so consumers can retry this message without losing healthy siblings.
        return null
    }
}

export class CloudflareQueuesError extends Error {
    constructor(readonly status: number) {
        super('cloudflare_queues_request_failed')
    }
}

export class CloudflareQueuesClient {
    private readonly accountId: string
    private readonly apiToken: string
    private readonly request: typeof fetch

    constructor(options: QueueClientOptions) {
        if (!/^[a-fA-F0-9]{32}$/.test(options.accountId) || !options.apiToken) {
            throw new Error('cloudflare_queues_configuration_invalid')
        }

        this.accountId = options.accountId
        this.apiToken = options.apiToken
        this.request = options.fetch ?? fetch
    }

    async publish(queueId: string, body: unknown, signal?: AbortSignal): Promise<void> {
        await this.post(queueId, '', { body, content_type: 'json' }, signal)
    }

    async pull(
        queueId: string,
        batchSize: number,
        visibilityTimeoutMs = 300_000,
        signal?: AbortSignal,
    ): Promise<QueueMessage[]> {
        if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
            throw new Error('queue_batch_size_invalid')
        }

        const response = await this.post(
            queueId,
            '/pull',
            {
                batch_size: batchSize,
                visibility_timeout_ms: visibilityTimeoutMs,
            },
            signal,
        )

        const result = pullResultSchema.parse(response)

        return result.messages.map(message => {
            const contentType = message.metadata?.['CF-Content-Type'] ?? 'json'
            const body = decodeMessageBody(message.body, contentType)

            return {
                id: message.id,
                leaseId: message.lease_id,
                body,
            }
        })
    }

    async ack(queueId: string, leaseId: string, signal?: AbortSignal): Promise<void> {
        const acknowledgment = {
            acks: [{ lease_id: leaseId }],
            retries: [],
        }

        await this.post(queueId, '/ack', acknowledgment, signal)
    }

    async retry(queueId: string, leaseId: string, delaySeconds = 10, signal?: AbortSignal): Promise<void> {
        const retry = {
            lease_id: leaseId,
            delay_seconds: delaySeconds,
        }

        const acknowledgment = {
            acks: [],
            retries: [retry],
        }

        await this.post(queueId, '/ack', acknowledgment, signal)
    }

    private async post(queueId: string, action: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
        if (!/^[a-fA-F0-9]{32}$/.test(queueId)) {
            throw new Error('cloudflare_queue_id_invalid')
        }

        const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/queues/${queueId}/messages${action}`
        const timeout = AbortSignal.timeout(10_000)
        let requestSignal = timeout

        if (signal) {
            requestSignal = AbortSignal.any([signal, timeout])
        }

        const response = await this.request(endpoint, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${this.apiToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: requestSignal,
        })

        if (!response.ok) {
            await response.body?.cancel()

            throw new CloudflareQueuesError(response.status)
        }

        const responseBody: unknown = await response.json()
        const parsedResponse = responseSchema.parse(responseBody)

        if (!parsedResponse.success) {
            throw new CloudflareQueuesError(response.status)
        }

        return parsedResponse.result
    }
}
