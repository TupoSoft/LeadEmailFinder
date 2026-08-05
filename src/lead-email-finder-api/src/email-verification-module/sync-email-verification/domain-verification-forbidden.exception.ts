export class DomainVerificationForbiddenException extends Error {
    name = 'DomainVerificationForbiddenException'

    constructor(name: string) {
        super(`Email verification is forbidden for domain "${name}".`)
    }
}
