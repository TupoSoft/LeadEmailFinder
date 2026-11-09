import { generateSessionId } from '../../application/pkce'
import { SessionMissingError, SessionStore } from '../../application/session-store'
import { SessionRecord } from '../../domain/session-record'

/** Disposable adapter for contract tests; production composition uses Redis. */
export class InMemorySessionStore implements SessionStore {
    private readonly records = new Map<string, { record: SessionRecord; expiresAt: number }>()

    constructor(private readonly idleTimeoutMs = 28_800_000) {}

    create(record: SessionRecord): Promise<string> {
        const sessionId = generateSessionId()
        this.records.set(sessionId, this.entry(record))
        return Promise.resolve(sessionId)
    }

    replace(expectedSessionId: string, newSessionId: string, record: SessionRecord): Promise<boolean> {
        const entry = this.entry(record)
        if (!this.read(expectedSessionId) || this.read(newSessionId)) return Promise.resolve(false)
        this.records.set(newSessionId, entry)
        this.records.delete(expectedSessionId)
        return Promise.resolve(true)
    }

    get(sessionId: string): Promise<SessionRecord | undefined> {
        return Promise.resolve(this.read(sessionId))
    }

    save(sessionId: string, record: SessionRecord): Promise<void> {
        if (!this.read(sessionId)) return Promise.reject(new SessionMissingError())
        this.records.set(sessionId, this.entry(record))
        return Promise.resolve()
    }

    delete(sessionId: string): Promise<void> {
        this.records.delete(sessionId)
        return Promise.resolve()
    }

    private read(sessionId: string): SessionRecord | undefined {
        const entry = this.records.get(sessionId)
        if (!entry || entry.expiresAt <= Date.now()) {
            this.records.delete(sessionId)
            return undefined
        }
        return structuredClone(entry.record)
    }

    private entry(record: SessionRecord): { record: SessionRecord; expiresAt: number } {
        const expiresAt = Math.min(Date.now() + this.idleTimeoutMs, record.absoluteExpiresAt)
        if (expiresAt <= Date.now()) throw new SessionMissingError()
        return { record: structuredClone(record), expiresAt }
    }
}
