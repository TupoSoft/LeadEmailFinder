import { SessionRecord } from '../domain/session-record'

export const SESSION_STORE = Symbol('SESSION_STORE')

export interface SessionStore {
    create(record: SessionRecord): Promise<string>
    get(sessionId: string): Promise<SessionRecord | undefined>
    save(sessionId: string, record: SessionRecord): Promise<void>
    delete(sessionId: string): Promise<void>
}
