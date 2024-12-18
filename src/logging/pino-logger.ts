import type { Logger } from './logger'
import type { Logger as Pino } from 'pino'

export class PinoLogger implements Logger {
    constructor(private readonly logger: Pino) {}

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

    child: (bindings: Record<string, unknown>) => Logger = bindings => {
        const childLogger = this.logger.child(bindings)
        return new PinoLogger(childLogger)
    }
}
