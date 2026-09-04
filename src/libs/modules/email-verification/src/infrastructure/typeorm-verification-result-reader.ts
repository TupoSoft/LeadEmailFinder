import { Repository } from 'typeorm'
import { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { VerificationResultLookup, VerificationResultReader } from '../application/verification-result-reader'

type StoredVerificationResult = IEmailVerificationResponseDto & { organizationId: string }

export class TypeOrmVerificationResultReader implements VerificationResultReader {
    constructor(private readonly repository: Pick<Repository<StoredVerificationResult>, 'findOneBy'>) {}

    async findOwned({ id, organizationId }: VerificationResultLookup): Promise<IEmailVerificationResponseDto | null> {
        const result = await this.repository.findOneBy({ id, organizationId })
        if (!result) return null

        return {
            id: result.id,
            email: result.email,
            domain: result.domain,
            localPart: result.localPart,
            format: result.format,
            mxDomain: result.mxDomain,
            targetExchange: result.targetExchange,
            sources: result.sources,
            exists: result.exists,
            catchAll: result.catchAll,
            reason: result.reason,
            createdAt: result.createdAt,
        }
    }
}
