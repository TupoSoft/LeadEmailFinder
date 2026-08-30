import { PendingLoginState } from '../domain/pending-login-state'

export const PENDING_LOGIN_STATE_STORE = Symbol('PENDING_LOGIN_STATE_STORE')

export interface PendingLoginStateStore {
    create(state: string, pendingLoginState: PendingLoginState): Promise<void>
    consume(state: string): Promise<PendingLoginState | undefined>
}
