export class DomainNotFoundException extends Error {
    name = 'DomainNotFoundException'

    constructor(name: string) {
        super(`Domain ${name} not found`)
    }
}
