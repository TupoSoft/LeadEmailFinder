import { Test } from '@nestjs/testing'
import { Logger } from '@nestjs/common'
import { StructuredLoggingAllocationObserver } from './structured-logging-allocation-observer'

describe('StructuredLoggingAllocationObserver', () => {
    let observer: StructuredLoggingAllocationObserver
    let mockedLogger: jest.Mocked<Logger>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                StructuredLoggingAllocationObserver,
                {
                    provide: Logger,
                    useValue: {
                        log: jest.fn(),
                        warn: jest.fn(),
                    },
                },
            ],
        }).compile()

        observer = moduleRef.get(StructuredLoggingAllocationObserver)
        mockedLogger = moduleRef.get(Logger)
    })

    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('onAllocation', () => {
        it('logs an acquired allocation at info level with proxy fields', () => {
            observer.onAllocation({
                outcome: 'acquired',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                proxyState: 'active',
                durationMs: 12,
            })

            expect(mockedLogger.log).toHaveBeenCalledWith('Proxy allocation acquired', {
                outcome: 'acquired',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                proxyState: 'active',
                durationMs: 12,
            })
            expect(mockedLogger.warn).not.toHaveBeenCalled()
        })

        it('logs an exhausted allocation at warn level without a proxy id', () => {
            observer.onAllocation({ outcome: 'exhausted', mxHost: 'mx.example.com', durationMs: 8 })

            expect(mockedLogger.warn).toHaveBeenCalledWith('Proxy allocation exhausted', {
                outcome: 'exhausted',
                mxHost: 'mx.example.com',
                durationMs: 8,
            })
            expect(mockedLogger.log).not.toHaveBeenCalled()
        })
    })

    describe('onConnectionOutcome', () => {
        it('logs a successful connection at info level', () => {
            observer.onConnectionOutcome({
                outcome: 'connected',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 30,
            })

            expect(mockedLogger.log).toHaveBeenCalledWith('SMTP connection outcome', {
                outcome: 'connected',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 30,
            })
        })

        it('logs a failed connection at warn level', () => {
            observer.onConnectionOutcome({
                outcome: 'failed',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 30,
            })

            expect(mockedLogger.warn).toHaveBeenCalledWith('SMTP connection outcome', {
                outcome: 'failed',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 30,
            })
        })
    })

    describe('onLeaseRelease', () => {
        it('logs a successful release at info level', () => {
            observer.onLeaseRelease({
                outcome: 'released',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 5,
            })

            expect(mockedLogger.log).toHaveBeenCalledWith('Proxy lease release outcome', {
                outcome: 'released',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 5,
            })
        })

        it('logs a failed release at warn level', () => {
            observer.onLeaseRelease({
                outcome: 'failed',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 5,
            })

            expect(mockedLogger.warn).toHaveBeenCalledWith('Proxy lease release outcome', {
                outcome: 'failed',
                mxHost: 'mx.example.com',
                proxyId: 'proxy-id',
                durationMs: 5,
            })
        })
    })

    it('never logs credential-shaped fields', () => {
        observer.onAllocation({
            outcome: 'acquired',
            mxHost: 'mx.example.com',
            proxyId: 'proxy-id',
            proxyState: 'active',
            durationMs: 1,
        })
        observer.onConnectionOutcome({ outcome: 'connected', mxHost: 'mx.example.com', proxyId: 'proxy-id', durationMs: 1 })
        observer.onLeaseRelease({ outcome: 'released', mxHost: 'mx.example.com', proxyId: 'proxy-id', durationMs: 1 })

        const allLoggedFields: unknown[] = [...mockedLogger.log.mock.calls, ...mockedLogger.warn.mock.calls].map(
            (call: unknown[]) => call[1],
        )

        for (const fields of allLoggedFields) {
            expect(fields).not.toHaveProperty('user')
            expect(fields).not.toHaveProperty('password')
            expect(fields).not.toHaveProperty('auth')
        }
    })
})
