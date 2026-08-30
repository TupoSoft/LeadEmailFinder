import { ActiveServiceCredentialReader, ServiceCredentialRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { CredentialRejectedError } from './credential-authenticator'

export class ServiceCredentialResolver {
    constructor(private readonly activeServiceCredentialReader: ActiveServiceCredentialReader) {}

    async resolveActive(issuer: string, subject: string): Promise<ServiceCredentialRecord> {
        const credential = await this.activeServiceCredentialReader.findByIssuerAndSubject(issuer, subject)

        if (!credential || credential.status !== 'active') {
            throw new CredentialRejectedError('Service credential is unknown, disabled, or deleted')
        }

        return credential
    }
}
