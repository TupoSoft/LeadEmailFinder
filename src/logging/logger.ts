type Log = (message: string, meta?: Record<string, unknown>) => void

export interface Logger {
    info: Log
    warn: Log
    error: Log
    debug: Log
    child: (bindings: Record<string, unknown>) => Logger
}
