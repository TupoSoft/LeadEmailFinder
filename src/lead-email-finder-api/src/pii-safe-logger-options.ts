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

function isEmailAdministrationValue(
    decodedSegments: readonly DecodedPathSegment[],
    index: number,
    rawSegment: string,
): boolean {
    if (rawSegment.length === 0 || index === 0) {
        return false
    }

    const precedingSegment = decodedSegments[index - 1]
    return precedingSegment.completelyDecoded && precedingSegment.value.toLowerCase() === 'emails'
}

function isSensitivePathSegment(
    decodedSegments: readonly DecodedPathSegment[],
    index: number,
    rawSegment: string,
): boolean {
    const decodedSegment = decodedSegments[index]

    return (
        !decodedSegment.completelyDecoded ||
        decodedSegment.value.includes('@') ||
        EMAIL_SEGMENT_PATTERN.test(decodedSegment.value) ||
        isEmailAdministrationValue(decodedSegments, index, rawSegment)
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

    const requestIdFor = (request: IncomingMessage): string => {
        const existingRequestId = requestIds.get(request)
        if (existingRequestId) {
            return existingRequestId
        }

        const requestId = randomUUID()
        requestIds.set(request, requestId)
        return requestId
    }

    return {
        genReqId: request => requestIdFor(request),
        wrapSerializers: false,
        serializers: {
            req: (request: ExpressIncomingMessage) => {
                const id = requestIdFor(request)
                request.id = id

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
