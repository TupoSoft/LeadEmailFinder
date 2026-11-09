import { SessionRecord } from '../domain/session-record'

export const SESSION_STORE = Symbol('SESSION_STORE')

export class SessionMissingError extends Error {
    constructor() {
        super('Session is no longer available')
        this.name = 'SessionMissingError'
    }
}

export interface SessionStore {
    create(record: SessionRecord): Promise<string>
    replace(expectedSessionId: string, newSessionId: string, record: SessionRecord): Promise<boolean>
    get(sessionId: string): Promise<SessionRecord | undefined>
    save(sessionId: string, record: SessionRecord): Promise<void>
    delete(sessionId: string): Promise<void>
}
