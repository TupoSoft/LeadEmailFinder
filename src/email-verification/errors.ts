export class JobNotFoundError extends Error {
    name = 'JobNotFoundError'

    constructor(id: string) {
        super(`The job ${id} does not exist`)
    }
}

export class DomainVerificationForbiddenError extends Error {
    name = 'DomainVerificationForbiddenError'

    constructor(domain: string) {
        super(`The domain ${domain} verification is forbidden`)
    }
}
