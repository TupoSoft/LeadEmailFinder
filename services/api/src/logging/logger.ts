type Log = (message: string, meta?: Record<string, unknown>) => void

export interface Logger {
    info: Log
    warn: Log
    error: Log
    debug: Log
}

export interface ExtensibleLogger extends Logger {
    child: (bindings: Record<string, unknown>) => ExtensibleLogger
}
