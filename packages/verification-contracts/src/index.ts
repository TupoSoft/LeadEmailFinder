import { z } from 'zod'
import { MailboxEvidence } from './evidence'

export * from './evidence'

const verificationIdentity = {
    version: z.literal(1),
    executionId: z.uuid(),
    organizationId: z.uuid(),
    attemptId: z.uuid(),
}

const utcInstantSchema = z.iso.datetime({ offset: false })

const recipientEvidence = {
    observedAt: utcInstantSchema,
    policyVersion: z.literal(1),
    origin: z.enum(['fresh', 'stored']),
    stage: z.literal('rcpt_to'),
    verifiedTransport: z.literal(true),
    senderAccepted: z.literal(true),
}

export const wireMailboxEvidenceSchema = z.discriminatedUnion('kind', [
    z.strictObject({
        kind: z.literal('none'),
    }),
    z.strictObject({
        ...recipientEvidence,
        kind: z.literal('smtp_recipient_accepted'),
        code: z.literal(250),
        enhancedCode: z.string().max(32).optional(),
    }),
    z.strictObject({
        ...recipientEvidence,
        kind: z.literal('smtp_recipient_missing'),
        code: z.number().int().min(500).max(599),
        enhancedCode: z.literal('5.1.1'),
    }),
])

export type WireMailboxEvidence = z.infer<typeof wireMailboxEvidenceSchema>

export const verificationEmailSchema = z.email().max(320)

export const verificationCommandSchema = z.strictObject({
    ...verificationIdentity,
    email: verificationEmailSchema,
    deadlineAt: utcInstantSchema,
})

export const verificationResultSchema = z.discriminatedUnion('outcome', [
    z.strictObject({
        ...verificationIdentity,
        outcome: z.literal('completed'),
        result: z.strictObject({
            exists: z.boolean().nullable(),
            catchAll: z.boolean().nullable(),
            reason: z.enum([
                'accepted_email',
                'rejected_email',
                'timeout',
                'temporarily_blocked',
                'no_mx_records',
                'unexpected_error',
                'blacklisted',
                'no_connect',
                'exceeded_storage',
                'sender_blocked',
                'secure_transport_unavailable',
                'webmail',
                'unknown',
            ]),
            sources: z.array(z.enum(['mx', 'microsoft_1', 'microsoft_2', 'microsoft_4', 'mimecast'])).max(5),
            targetExchange: z.string().max(253).optional(),
            mxDomain: z.string().max(253).optional(),
            targetEvidence: wireMailboxEvidenceSchema,
            controlEvidence: wireMailboxEvidenceSchema,
        }),
    }),
    z.strictObject({
        ...verificationIdentity,
        outcome: z.literal('retryable-failure'),
        failureReason: z.enum(['temporarily_blocked', 'probe_failed']),
    }),
])

export type VerificationCommand = z.infer<typeof verificationCommandSchema>
export type VerificationResult = z.infer<typeof verificationResultSchema>
export type CompletedVerificationResult = Extract<VerificationResult, { outcome: 'completed' }>['result']

export function parseVerificationCommand(value: unknown): VerificationCommand {
    return verificationCommandSchema.parse(value)
}

export function parseVerificationResult(value: unknown): VerificationResult {
    return verificationResultSchema.parse(value)
}

export function serializeMailboxEvidence(evidence: MailboxEvidence): WireMailboxEvidence {
    if (evidence.kind === 'none') {
        return { kind: 'none' }
    }

    const serializedEvidence = {
        ...evidence,
        observedAt: evidence.observedAt.toISOString(),
    }

    return wireMailboxEvidenceSchema.parse(serializedEvidence)
}

export function deserializeMailboxEvidence(evidence: WireMailboxEvidence): MailboxEvidence {
    const parsedEvidence = wireMailboxEvidenceSchema.parse(evidence)

    if (parsedEvidence.kind === 'none') {
        return parsedEvidence
    }

    return {
        ...parsedEvidence,
        observedAt: new Date(parsedEvidence.observedAt),
    }
}
