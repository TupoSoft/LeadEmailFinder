import { type HttpLogger, type Options, pinoHttp } from 'pino-http'
import { type LoggerOptions, pino } from 'pino'

export function loggingMiddleware(loggerOptions?: LoggerOptions, middlewareOptions?: Options): HttpLogger {
    return pinoHttp({
        ...middlewareOptions,
        logger: pino(loggerOptions),
    })
}
