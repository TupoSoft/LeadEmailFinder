export class ProxyNotFoundException extends Error {
    name = 'ProxyNotFoundException'

    constructor(id: string) {
        super(`Proxy with id "${id}" not found.`)
    }
}
