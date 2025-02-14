import type { ExtensibleLogger } from './logger'
import { type Logger as Pino, type LoggerOptions, pino } from 'pino'

export class PinoLogger implements ExtensibleLogger {
    private readonly logger: Pino

    constructor(options?: LoggerOptions) {
        this.logger = pino(options)
    }

    info: (message: string, meta?: Record<string, unknown>) => void = (message, meta) => {
        this.logger.info(meta, message)
    }
    warn: (message: string, meta?: Record<string, unknown>) => void = (message, meta) => {
        this.logger.warn(meta, message)
    }

    error: (message: string, meta?: Record<string, unknown>) => void = (message, meta) => {
        this.logger.error(meta, message)
    }

    debug: (message: string, meta?: Record<string, unknown>) => void = (message, meta) => {
        this.logger.debug(meta, message)
    }

    child: (bindings: Record<string, unknown>) => PinoLogger = bindings => {
        const childLogger = this.logger.child(bindings)
        return new PinoLogger(childLogger)
    }
}
