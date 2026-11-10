import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Options } from 'pino-http'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'

const INVALID_REQUEST_TARGET = '/invalid-request-target'
const REQUEST_TARGET_BASE = 'http://request.local'
const SENSITIVE_PATH_SEGMENT = ':sensitive'
const SAFE_ERROR_MESSAGE = 'application_error'
const MAX_PATH_DECODE_PASSES = 5
const EMAIL_SEGMENT_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u
const UUID_PATH_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const VERIFICATION_ID_ROUTES = new Set(['email-verifications', 'verifications', 'verifyasync', 'verifybatch'])
const SENSITIVE_VALUE_ROUTES = new Set(['emails', 'invitations', 'accept-invitation'])

type ExpressIncomingMessage = IncomingMessage & { originalUrl?: string }

interface DecodedPathSegment {
    value: string
    completelyDecoded: boolean
}

interface SafeErrorLog {
    type: string
}

function decodePathSegment(segment: string): DecodedPathSegment {
    let value = segment

    for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
        const decoded = decodeURIComponent(value)
        if (decoded === value) {
            return { value, completelyDecoded: true }
        }
        value = decoded
    }

    return { value, completelyDecoded: false }
}

function isInvalidVerificationValue(route: string, value: string): boolean {
    return (
        VERIFICATION_ID_ROUTES.has(route) &&
        value.length > 0 &&
        !(route === 'verifybatch' && value === 'csv') &&
        !UUID_PATH_SEGMENT_PATTERN.test(value)
    )
}

function isSensitivePathSegment(
    decodedSegments: readonly DecodedPathSegment[],
    index: number,
    rawSegment: string,
): boolean {
    const decodedSegment = decodedSegments[index]
    const precedingSegment = decodedSegments[index - 1]
    const parentRoute = precedingSegment?.value.toLowerCase()
    const decodedPathParts = decodedSegment.value.split('/').filter(Boolean)
    const parentPathPart = parentRoute?.split('/').filter(Boolean).at(-1) ?? ''
    const isSensitiveRouteValue =
        rawSegment.length > 0 &&
        ((precedingSegment?.completelyDecoded && SENSITIVE_VALUE_ROUTES.has(parentPathPart)) ||
            decodedPathParts.some(
                (part, partIndex) =>
                    SENSITIVE_VALUE_ROUTES.has(part.toLowerCase()) && partIndex < decodedPathParts.length - 1,
            ))
    const isInvalidVerificationId =
        rawSegment.length > 0 &&
        ((precedingSegment?.completelyDecoded && isInvalidVerificationValue(parentPathPart, decodedSegment.value)) ||
            decodedPathParts.some((part, partIndex) =>
                isInvalidVerificationValue(part.toLowerCase(), decodedPathParts[partIndex + 1] ?? ''),
            ))

    return (
        !decodedSegment.completelyDecoded ||
        decodedSegment.value.includes('@') ||
        isSensitiveRouteValue ||
        EMAIL_SEGMENT_PATTERN.test(decodedSegment.value) ||
        isInvalidVerificationId
    )
}

export function sanitizeRequestTarget(rawUrl: string): string {
    if (rawUrl.trim().length === 0) {
        return INVALID_REQUEST_TARGET
    }

    try {
        const pathname = new URL(rawUrl, REQUEST_TARGET_BASE).pathname
        if (!pathname.startsWith('/')) {
            return INVALID_REQUEST_TARGET
        }

        const rawSegments = pathname.split('/')
        const decodedSegments = rawSegments.map(decodePathSegment)
        const sanitizedSegments = rawSegments.map((segment, index) =>
            isSensitivePathSegment(decodedSegments, index, segment) ? SENSITIVE_PATH_SEGMENT : segment,
        )

        return sanitizedSegments.join('/') || '/'
    } catch {
        return INVALID_REQUEST_TARGET
    }
}

function serializeError(error: unknown): SafeErrorLog {
    return { type: safeErrorType(error) }
}

function hasOwnErrorBinding(value: unknown): boolean {
    return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'err')
}

export function createPiiSafePinoHttpOptions(): Options {
    const requestIds = new WeakMap<IncomingMessage, string>()

    const requestIdFor = (request: IncomingMessage, response?: ServerResponse): string => {
        const requestId = requestIds.get(request) ?? randomUUID()
        requestIds.set(request, requestId)
        request.id = requestId
        if (response && !response.headersSent) {
            response.setHeader('X-Request-ID', requestId)
        }
        return requestId
    }

    return {
        genReqId: (request, response) => requestIdFor(request, response),
        customProps: (request, response) => {
            // Pino skips genReqId when earlier middleware has assigned request.id.
            // Always restore the private server ID before application handlers run.
            requestIdFor(request, response)
            return {}
        },
        wrapSerializers: false,
        serializers: {
            req: (request: ExpressIncomingMessage) => {
                const id = requestIdFor(request)

                return {
                    id,
                    method: request.method ?? 'UNKNOWN',
                    path: sanitizeRequestTarget(request.originalUrl ?? request.url ?? ''),
                }
            },
            res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
            err: serializeError,
        },
        hooks: {
            logMethod(args, method) {
                const firstArgument: unknown = args[0]

                if (firstArgument instanceof Error) {
                    const safeArguments = [{ err: firstArgument }, SAFE_ERROR_MESSAGE] as unknown as Parameters<
                        typeof method
                    >
                    method.apply(this, safeArguments)
                    return
                }

                if (hasOwnErrorBinding(firstArgument)) {
                    args.splice(1, args.length - 1, SAFE_ERROR_MESSAGE)
                }

                method.apply(this, args)
            },
        },
    }
}
