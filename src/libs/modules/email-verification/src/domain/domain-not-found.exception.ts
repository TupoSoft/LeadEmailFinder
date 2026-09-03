export class DomainNotFoundException extends Error {
    name = 'DomainNotFoundException'

    constructor(_name: string) {
        super('Domain not found.')
    }
}
