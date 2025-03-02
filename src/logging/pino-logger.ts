import type { ExtensibleLogger, LogMeta } from './logger'
import { type Logger as Pino, type LoggerOptions, pino } from 'pino'

interface PinoLoggerConstructorParams {
    logger?: Pino
    options?: LoggerOptions
}

export class PinoLogger implements ExtensibleLogger {
    private readonly logger: Pino

    constructor({ logger, options }: PinoLoggerConstructorParams = {}) {
        this.logger = logger ?? pino(options)
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

    child: (bindings: LogMeta) => PinoLogger = bindings => {
        const child = this.logger.child(bindings)
        return new PinoLogger({
            logger: child,
        })
    }
}
