export class ProxyNotFoundError extends Error {
    constructor(id: string) {
        super(`Proxy with id "${id}" not found.`)
        this.name = 'ProxyNotFoundError'
    }
}
