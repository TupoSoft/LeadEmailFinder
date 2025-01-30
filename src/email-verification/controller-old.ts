import type { EmailVerificationService } from './service'
import { matchedData, validationResult } from 'express-validator'
import type { Request, Response } from 'express'
import { constants } from 'node:http2'
import type { EmailVerificationResult, EmailVerificationSource, LegacyEmailVerificationResult } from './dto'
import { CatchAllStatus, DeliveryStatus } from './enums'

function mapCatchAllStatus(sources: EmailVerificationSource[]): CatchAllStatus {
    if (sources.length === 0) {
        return CatchAllStatus.Unknown
    } else if (sources.includes('SMTP')) {
        return CatchAllStatus.Disabled
    } else {
        return CatchAllStatus.Enabled
    }
}

function mapDeliveryStatus(exists: boolean | null): DeliveryStatus {
    if (exists === null) {
        return DeliveryStatus.NotProcessed
    } else if (exists) {
        return DeliveryStatus.Accepted
    } else {
        return DeliveryStatus.Rejected
    }
}

export function toLegacyResult({
    email,
    localPart,
    domain,
    sources,
    exists,
    targetExchange,
    verifiedAt,
}: EmailVerificationResult): LegacyEmailVerificationResult {
    const catchAll = mapCatchAllStatus(sources)
    const deliveryStatus = mapDeliveryStatus(exists)

    return {
        catchAll,
        deliveryStatus,
        verifiedAt: verifiedAt ?? new Date(),
        email,
        localPart,
        domain,
        targetExchange,
    }
}

export class LegacyEmailVerificationController {
    constructor(private readonly emailVerificationService: EmailVerificationService) {}

    verify(req: Request, res: Response): void {
        const result = validationResult(req)

        if (result.isEmpty()) {
            const { email } = matchedData<{ email: string }>(req)
            this.emailVerificationService.verify({ email }).then(
                verificationData => res.json(toLegacyResult(verificationData)),
                (reason: unknown) => {
                    console.log('The error has occurred:', reason)
                    res.status(constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).send('Something went wrong...')
                },
            )

            return
        }

        res.status(constants.HTTP_STATUS_BAD_REQUEST).json({ errors: result.array() })
    }
}
