import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { InvitationPreviewReader, InvitationPreviewRecord } from '../../application/ports/invitation-preview-reader'
import { OrganizationInvitation } from './organization-invitation.entity'

@Injectable()
export class TypeOrmInvitationPreviewReader implements InvitationPreviewReader {
    constructor(private readonly dataSource: DataSource) {}

    async findByTokenHash(tokenHash: string): Promise<InvitationPreviewRecord | undefined> {
        return this.dataSource.manager
            .createQueryBuilder(OrganizationInvitation, 'invitation')
            .innerJoin('invitation.organization', 'organization')
            .select('organization.name', 'organizationName')
            .addSelect('invitation.email', 'email')
            .addSelect('invitation.role', 'role')
            .addSelect('invitation.expiresAt', 'expiresAt')
            .addSelect('invitation.status', 'status')
            .where('invitation.tokenHash = :tokenHash', { tokenHash })
            .getRawOne<InvitationPreviewRecord>()
    }
}
