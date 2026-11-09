export interface ConnectionTimeoutErrorOptions {
    host: string
    port: number
    timeoutMs: number
}

export class ConnectionTimeoutError extends Error {
    name = 'ConnectionTimeoutError'

    readonly host: string
    readonly port: number
    readonly timeoutMs: number

    constructor({ host, port, timeoutMs }: ConnectionTimeoutErrorOptions) {
        super(`Connection to ${host}:${port} timed out after ${timeoutMs}ms`)

        this.host = host
        this.port = port
        this.timeoutMs = timeoutMs
    }
}
