import type { FleetInventory } from './inventory'
import type { ListenerEgressCheckTarget, ListenerHealthCheck, SmtpProbeEndpoint } from './listener-health-check'
import {
    type DesiredProxyRecord,
    type OwnedProxyRecord,
    OWNED_DESCRIPTION_PREFIX,
    ownedDescriptionFor,
    type ProxyRecordPatch,
    type ProxyRegistryAdminPort,
    type ProxyState,
    PROXY_PROTOCOL_HTTP,
} from './proxy-registry-admin'

export interface DesiredFleetListener {
    readonly egressId: string
    readonly bindIp: string
    readonly port: number
    readonly egressIp: string
    readonly desiredState: 'active' | 'disabled'
    readonly weight: number
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
    readonly auth: { readonly user: string; readonly pass: string }
}

export class ReconcileError extends Error {}

/** Flattens the inventory into the reconcile engine's per-listener desired state, joined with credentials. */
export function desiredListenersFrom(
    inventory: FleetInventory,
    credentialsByNode: ReadonlyMap<string, Record<string, { user: string; pass: string }>>,
): DesiredFleetListener[] {
    const listeners: DesiredFleetListener[] = []

    for (const node of inventory.nodes) {
        const credentials = credentialsByNode.get(node.proxyNodeId)

        for (const listener of node.listeners) {
            const auth = credentials?.[listener.egressId]

            if (auth === undefined) {
                throw new ReconcileError(`missing staged credentials for ${node.proxyNodeId}/${listener.egressId}`)
            }

            listeners.push({
                egressId: listener.egressId,
                bindIp: listener.bindIp,
                port: listener.port,
                egressIp: listener.egressIp,
                desiredState: listener.desiredState,
                weight: listener.weight,
                maxConcurrent: listener.maxConcurrent,
                requestsPerMinute: listener.requestsPerMinute,
                auth,
            })
        }
    }

    return listeners
}

export type ReconcileAction =
    | { readonly type: 'created-disabled'; readonly egressId: string; readonly id: string }
    | { readonly type: 'activated'; readonly egressId: string; readonly id: string }
    | { readonly type: 'health-check-failed'; readonly egressId: string; readonly id: string; readonly previousState: ProxyState }
    | { readonly type: 'updated-fields'; readonly egressId: string; readonly id: string }
    | { readonly type: 'disabled'; readonly egressId: string; readonly id: string }
    | { readonly type: 'drained'; readonly egressId: string; readonly id: string }
    | { readonly type: 'unchanged'; readonly egressId: string; readonly id: string }

export interface ReconcileSummary {
    readonly actions: readonly ReconcileAction[]
}

export interface ReconcileOptions {
    readonly registry: ProxyRegistryAdminPort
    readonly healthCheck: ListenerHealthCheck
    readonly probe: SmtpProbeEndpoint
}

/**
 * Reconciles the registry's owned records (description prefixed `proxy-fleet:`) against the desired
 * listeners. Runs as a single writer: every listener is processed sequentially, one health check at a
 * time, because `verifyListenerEgress` can only attribute the probe's most recently observed connection
 * to the listener currently being checked. Never touches records without the owned description prefix.
 */
export async function reconcile(desired: readonly DesiredFleetListener[], options: ReconcileOptions): Promise<ReconcileSummary> {
    validateNoDuplicateDesiredEndpoints(desired)

    const owned = await options.registry.listOwnedProxies()
    validateOwnedRecords(owned)

    const desiredByEgressId = new Map(desired.map(listener => [listener.egressId, listener]))
    const ownedByEgressId = new Map(owned.map(record => [egressIdOf(record), record]))

    const actions: ReconcileAction[] = []

    for (const listener of desired) {
        const existing = ownedByEgressId.get(listener.egressId)
        const listenerActions =
            existing === undefined ? await createAndActivate(listener, options) : await syncExisting(listener, existing, options)
        actions.push(...listenerActions)
    }

    for (const record of owned) {
        const egressId = egressIdOf(record)

        if (!desiredByEgressId.has(egressId)) {
            actions.push(await drainIfNeeded(record, egressId, options))
        }
    }

    return { actions }
}

async function createAndActivate(listener: DesiredFleetListener, options: ReconcileOptions): Promise<ReconcileAction[]> {
    const created = await options.registry.createDisabled(toDesiredRecord(listener))
    const actions: ReconcileAction[] = [{ type: 'created-disabled', egressId: listener.egressId, id: created.id }]

    if (listener.desiredState !== 'active') {
        return actions
    }

    const healthy = await options.healthCheck(toHealthCheckTarget(listener), options.probe)

    if (healthy) {
        await options.registry.transitionState(created.id, 'active')
        actions.push({ type: 'activated', egressId: listener.egressId, id: created.id })
    } else {
        actions.push({ type: 'health-check-failed', egressId: listener.egressId, id: created.id, previousState: 'disabled' })
    }

    return actions
}

async function syncExisting(
    listener: DesiredFleetListener,
    existing: OwnedProxyRecord,
    options: ReconcileOptions,
): Promise<ReconcileAction[]> {
    const actions: ReconcileAction[] = []
    const fieldPatch = diffFields(listener, existing)

    if (Object.keys(fieldPatch).length > 0) {
        // Credentials can never be read back (ProxyDto excludes `auth`), so credential drift alone is not
        // observable. Bundling `auth` here keeps credentials in lockstep with inventory whenever some other
        // observable field already justified a mutation, without making credential sync itself trigger one.
        await options.registry.update(existing.id, { ...fieldPatch, auth: listener.auth })
        actions.push({ type: 'updated-fields', egressId: listener.egressId, id: existing.id })
    }

    if (listener.desiredState === 'disabled') {
        if (existing.state !== 'disabled') {
            await options.registry.transitionState(existing.id, 'disabled')
            actions.push({ type: 'disabled', egressId: listener.egressId, id: existing.id })
        } else if (actions.length === 0) {
            actions.push({ type: 'unchanged', egressId: listener.egressId, id: existing.id })
        }

        return actions
    }

    const healthy = await options.healthCheck(toHealthCheckTarget(listener), options.probe)

    if (healthy) {
        if (existing.state !== 'active') {
            await options.registry.transitionState(existing.id, 'active')
            actions.push({ type: 'activated', egressId: listener.egressId, id: existing.id })
        } else if (actions.length === 0) {
            actions.push({ type: 'unchanged', egressId: listener.egressId, id: existing.id })
        }

        return actions
    }

    const nextState: ProxyState = existing.state === 'active' ? 'draining' : 'disabled'

    if (existing.state !== nextState) {
        await options.registry.transitionState(existing.id, nextState)
    }

    actions.push({ type: 'health-check-failed', egressId: listener.egressId, id: existing.id, previousState: existing.state })

    return actions
}

async function drainIfNeeded(record: OwnedProxyRecord, egressId: string, options: ReconcileOptions): Promise<ReconcileAction> {
    if (record.state === 'draining') {
        return { type: 'unchanged', egressId, id: record.id }
    }

    await options.registry.transitionState(record.id, 'draining')
    return { type: 'drained', egressId, id: record.id }
}

function diffFields(listener: DesiredFleetListener, existing: OwnedProxyRecord): ProxyRecordPatch {
    const patch: { -readonly [K in keyof ProxyRecordPatch]?: ProxyRecordPatch[K] } = {}

    if (existing.protocol !== PROXY_PROTOCOL_HTTP) patch.protocol = PROXY_PROTOCOL_HTTP
    if (existing.host !== listener.bindIp) patch.host = listener.bindIp
    if (existing.port !== listener.port) patch.port = listener.port
    if (existing.weight !== listener.weight) patch.weight = listener.weight
    if (existing.maxConcurrent !== listener.maxConcurrent) patch.maxConcurrent = listener.maxConcurrent
    if (existing.requestsPerMinute !== listener.requestsPerMinute) patch.requestsPerMinute = listener.requestsPerMinute

    const description = ownedDescriptionFor(listener.egressId)
    if (existing.description !== description) patch.description = description

    return patch
}

function toDesiredRecord(listener: DesiredFleetListener): DesiredProxyRecord {
    return {
        egressId: listener.egressId,
        protocol: PROXY_PROTOCOL_HTTP,
        host: listener.bindIp,
        port: listener.port,
        auth: listener.auth,
        weight: listener.weight,
        maxConcurrent: listener.maxConcurrent,
        requestsPerMinute: listener.requestsPerMinute,
    }
}

function toHealthCheckTarget(listener: DesiredFleetListener): ListenerEgressCheckTarget {
    return {
        egressId: listener.egressId,
        bindIp: listener.bindIp,
        port: listener.port,
        egressIp: listener.egressIp,
        auth: listener.auth,
    }
}

function egressIdOf(record: OwnedProxyRecord): string {
    return record.description.slice(OWNED_DESCRIPTION_PREFIX.length)
}

function validateNoDuplicateDesiredEndpoints(desired: readonly DesiredFleetListener[]): void {
    const seen = new Set<string>()

    for (const listener of desired) {
        const key = `${listener.bindIp}:${listener.port}`

        if (seen.has(key)) {
            throw new ReconcileError(`duplicate desired endpoint ${key}`)
        }

        seen.add(key)
    }
}

function validateOwnedRecords(owned: readonly OwnedProxyRecord[]): void {
    const seenEndpoints = new Set<string>()
    const seenEgressIds = new Set<string>()

    for (const record of owned) {
        const endpoint = `${record.host}:${record.port}`

        if (seenEndpoints.has(endpoint)) {
            throw new ReconcileError(`duplicate owned registry endpoint ${endpoint}; resolve manually before reconciling`)
        }
        seenEndpoints.add(endpoint)

        const egressId = egressIdOf(record)

        if (seenEgressIds.has(egressId)) {
            throw new ReconcileError(`duplicate owned registry egressId ${egressId}; resolve manually before reconciling`)
        }
        seenEgressIds.add(egressId)
    }
}
