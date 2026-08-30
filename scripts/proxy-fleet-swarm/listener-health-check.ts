import type { IProxy } from '@tuposoft/lead-email-finder/modules/proxy'
import { connect } from '@tuposoft/lead-email-finder/socket'

export interface ListenerEgressCheckTarget {
    readonly egressId: string
    readonly bindIp: string
    readonly port: number
    readonly egressIp: string
    readonly auth: { readonly user: string; readonly pass: string }
}

export interface SmtpProbeEndpoint {
    /** SMTP probe host, reachable through the listener at an allowed destination port. */
    readonly host: string
    readonly port: number
    /** HTTP status endpoint on the probe reporting the most recently observed connection's peer address. */
    readonly statusUrl: string
}

export type ListenerHealthCheck = (listener: ListenerEgressCheckTarget, probe: SmtpProbeEndpoint) => Promise<boolean>

/**
 * Authenticates through exactly the given listener, CONNECTs to the SMTP probe target, and asserts the
 * probe observed the listener's declared egress IP. Callers must run this sequentially, one listener at
 * a time: the probe only tracks its most recently accepted connection, so concurrent checks against the
 * same probe cannot be attributed to the right listener. This matches the reconcile engine's own
 * single-writer, one-listener-at-a-time design.
 */
export const verifyListenerEgress: ListenerHealthCheck = async (listener, probe) => {
    const proxy: IProxy = {
        id: listener.egressId,
        type: 'http',
        host: listener.bindIp,
        port: listener.port,
        user: listener.auth.user,
        password: listener.auth.pass,
    }

    try {
        const socket = await connect({ host: probe.host, port: probe.port, timeout: 5_000, proxy })
        socket.destroy()
    } catch {
        return false
    }

    const observedPeer = await fetchLastObservedPeer(probe.statusUrl)
    return observedPeer === listener.egressIp
}

async function fetchLastObservedPeer(statusUrl: string): Promise<string | undefined> {
    const response = await fetch(statusUrl)

    if (!response.ok) {
        return undefined
    }

    const payload = (await response.json()) as { peerAddress?: string }
    return payload.peerAddress
}
