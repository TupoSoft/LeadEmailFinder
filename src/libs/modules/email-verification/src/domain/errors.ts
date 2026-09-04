export class EmailAlreadyExistsError extends Error {
    name = 'EmailAlreadyExistsError'

    constructor(readonly email: string) {
        super('Email already exists.')
    }
}

export class EmailNotFoundError extends Error {
    name = 'EmailNotFoundError'

    constructor(readonly email: string) {
        super('Email not found.')
    }
}

export class DomainNotFoundError extends Error {
    name = 'DomainNotFoundError'

    constructor(readonly domain: string) {
        super('Domain not found.')
    }
}

export class DomainVerificationForbiddenError extends Error {
    name = 'DomainVerificationForbiddenError'

    constructor(readonly domain: string) {
        super('Email verification is forbidden for this domain.')
    }
}
