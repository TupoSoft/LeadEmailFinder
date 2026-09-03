export class DomainVerificationForbiddenException extends Error {
    name = 'DomainVerificationForbiddenException'

    constructor(_name: string) {
        super('Email verification is forbidden for this domain.')
    }
}
