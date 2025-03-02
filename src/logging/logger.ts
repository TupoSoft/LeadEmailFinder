export type LogMeta = Record<string, unknown>

type Log = (message: string, meta?: LogMeta) => void

export interface Logger {
    info: Log
    warn: Log
    error: Log
    debug: Log
}

export interface ExtensibleLogger extends Logger {
    child: (bindings: LogMeta) => ExtensibleLogger
}
