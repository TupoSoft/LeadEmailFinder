import type { ExtensibleLogger, LogMeta } from './logger'
import { type Logger as Pino, type LoggerOptions, pino } from 'pino'

export class PinoLogger implements ExtensibleLogger {
    private readonly logger: Pino

    constructor(options?: LoggerOptions) {
        this.logger = pino(options)
    }

    info: (message: string, meta?: LogMeta) => void = (message, meta) => {
        this.logger.info(meta, message)
    }

    warn: (message: string, meta?: LogMeta) => void = (message, meta) => {
        this.logger.warn(meta, message)
    }

    error: (message: string, meta?: LogMeta) => void = (message, meta) => {
        this.logger.error(meta, message)
    }

    debug: (message: string, meta?: LogMeta) => void = (message, meta) => {
        this.logger.debug(meta, message)
    }

    child: (bindings: LogMeta) => PinoLogger = bindings =>
        new PinoLogger({
            base: { ...this.logger.bindings(), ...bindings },
        })
}
