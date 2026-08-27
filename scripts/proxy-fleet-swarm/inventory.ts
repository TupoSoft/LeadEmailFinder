/**
 * Parses and validates the fleet topology consumed by the stack renderer and the reconcile engine.
 * The input is the JSON produced by `ansible-inventory --list` against
 * `deploy/proxy-fleet/ansible/inventory/<file>.yml` (see that plan's README). Mirrors the cross-host
 * uniqueness checks in `deploy/proxy-fleet/ansible/playbooks/validate-inventory.yml` so both tools
 * reject the same malformed inventory the same way.
 */

export type ProxyDesiredState = 'active' | 'disabled'

export interface ProxyListenerSpec {
    readonly egressId: string
    readonly bindIp: string
    readonly port: number
    readonly egressIp: string
    readonly maxConnections: number
    readonly maxConcurrent: number
    readonly requestsPerMinute: number
    readonly weight: number
    readonly desiredState: ProxyDesiredState
}

export interface ProxyFleetNode {
    readonly hostname: string
    readonly proxyNodeId: string
    readonly egressInterface: string
    readonly wireguardAddress: string
    readonly listeners: readonly ProxyListenerSpec[]
}

export interface FleetInventory {
    readonly nodes: readonly ProxyFleetNode[]
    readonly workerCidrs: readonly string[]
    readonly allowedDestinationPorts: readonly number[]
}

export class FleetInventoryValidationError extends Error {
    constructor(readonly issues: readonly string[]) {
        super(`Invalid proxy-fleet inventory:\n- ${issues.join('\n- ')}`)
        this.name = 'FleetInventoryValidationError'
    }
}

export function parseFleetInventory(raw: unknown): FleetInventory {
    const document = asRecord(raw) ?? {}
    const hostvars = asRecord(asRecord(document._meta)?.hostvars) ?? {}
    const hostnames = asStringArray(asRecord(document.proxy_nodes)?.hosts) ?? []

    if (hostnames.length === 0) {
        throw new FleetInventoryValidationError(['inventory declares no proxy_nodes hosts'])
    }

    const issues: string[] = []
    const nodes: ProxyFleetNode[] = []

    for (const hostname of hostnames) {
        const vars = asRecord(hostvars[hostname])

        if (vars === undefined) {
            issues.push(`${hostname}: missing hostvars`)
            continue
        }

        const node = parseNode(hostname, vars, issues)

        if (node !== undefined) {
            nodes.push(node)
        }
    }

    const sharedVars = nodes.length > 0 ? asRecord(hostvars[nodes[0].hostname]) : undefined
    const workerCidrs = sharedVars ? asStringArray(sharedVars.proxy_fleet_worker_cidrs) : undefined
    const allowedDestinationPorts = sharedVars ? asNumberArray(sharedVars.proxy_fleet_allowed_destination_ports) : undefined

    if (workerCidrs === undefined || workerCidrs.length === 0) {
        issues.push('proxy_fleet_worker_cidrs must be a non-empty list of CIDRs (from group_vars/all.yml)')
    }

    if (allowedDestinationPorts === undefined || allowedDestinationPorts.length === 0) {
        issues.push('proxy_fleet_allowed_destination_ports must be a non-empty list of ports (from group_vars/all.yml)')
    }

    collectDuplicateIssues(nodes, issues)

    if (issues.length > 0) {
        throw new FleetInventoryValidationError(issues)
    }

    return { nodes, workerCidrs: workerCidrs!, allowedDestinationPorts: allowedDestinationPorts! }
}

function parseNode(hostname: string, vars: Record<string, unknown>, issues: string[]): ProxyFleetNode | undefined {
    const proxyNodeId = asString(vars.proxy_node_id)
    const egressInterface = asString(vars.egress_interface)
    const wireguardAddress = asString(vars.wireguard_address)
    const listenersRaw = vars.proxy_listeners

    let ok = true

    if (proxyNodeId === undefined) {
        issues.push(`${hostname}: missing proxy_node_id`)
        ok = false
    }
    if (egressInterface === undefined) {
        issues.push(`${hostname}: missing egress_interface`)
        ok = false
    }
    if (wireguardAddress === undefined || !wireguardAddress.includes('/')) {
        issues.push(`${hostname}: missing or malformed wireguard_address`)
        ok = false
    }
    if (!Array.isArray(listenersRaw) || listenersRaw.length === 0) {
        issues.push(`${hostname}: proxy_listeners must be a non-empty list`)
        ok = false
    }

    if (!ok || proxyNodeId === undefined || egressInterface === undefined || wireguardAddress === undefined) {
        return undefined
    }

    const rawListeners = listenersRaw as unknown[]
    const listeners = rawListeners
        .map(entry => parseListener(hostname, entry, issues))
        .filter((listener): listener is ProxyListenerSpec => listener !== undefined)

    if (listeners.length !== rawListeners.length) {
        return undefined
    }

    return { hostname, proxyNodeId, egressInterface, wireguardAddress, listeners }
}

function parseListener(hostname: string, raw: unknown, issues: string[]): ProxyListenerSpec | undefined {
    const record = asRecord(raw)

    if (record === undefined) {
        issues.push(`${hostname}: a proxy_listeners entry is not an object`)
        return undefined
    }

    const egressId = asString(record.egressId)
    const label = egressId ?? '<unknown egressId>'
    const bindIp = asString(record.bindIp)
    const port = asNumber(record.port)
    const egressIp = asString(record.egressIp)
    const maxConnections = asNumber(record.maxConnections)
    const maxConcurrent = asNumber(record.maxConcurrent)
    const requestsPerMinute = asNumber(record.requestsPerMinute)
    const weight = asNumber(record.weight)
    const desiredStateRaw = asString(record.desiredState)

    let ok = true

    if (egressId === undefined) {
        issues.push(`${hostname}: listener is missing egressId`)
        ok = false
    }
    if (bindIp === undefined) {
        issues.push(`${hostname}/${label}: missing bindIp`)
        ok = false
    }
    if (!isPort(port)) {
        issues.push(`${hostname}/${label}: port must be an integer between 1 and 65535`)
        ok = false
    }
    if (egressIp === undefined) {
        issues.push(`${hostname}/${label}: missing egressIp`)
        ok = false
    }
    if (!isPositiveInteger(maxConnections)) {
        issues.push(`${hostname}/${label}: maxConnections must be a positive integer`)
        ok = false
    }
    if (!isPositiveInteger(maxConcurrent)) {
        issues.push(`${hostname}/${label}: maxConcurrent must be a positive integer`)
        ok = false
    }
    if (!isPositiveInteger(requestsPerMinute)) {
        issues.push(`${hostname}/${label}: requestsPerMinute must be a positive integer`)
        ok = false
    }
    if (weight === undefined || !Number.isInteger(weight) || weight < 0) {
        issues.push(`${hostname}/${label}: weight must be a non-negative integer`)
        ok = false
    }
    if (desiredStateRaw !== 'active' && desiredStateRaw !== 'disabled') {
        issues.push(`${hostname}/${label}: desiredState must be "active" or "disabled"`)
        ok = false
    }

    if (
        !ok ||
        egressId === undefined ||
        bindIp === undefined ||
        port === undefined ||
        egressIp === undefined ||
        maxConnections === undefined ||
        maxConcurrent === undefined ||
        requestsPerMinute === undefined ||
        weight === undefined
    ) {
        return undefined
    }

    return {
        egressId,
        bindIp,
        port,
        egressIp,
        maxConnections,
        maxConcurrent,
        requestsPerMinute,
        weight,
        desiredState: desiredStateRaw as ProxyDesiredState,
    }
}

function collectDuplicateIssues(nodes: readonly ProxyFleetNode[], issues: string[]): void {
    reportDuplicates(
        nodes.map(node => node.proxyNodeId),
        'proxy_node_id',
        issues,
    )

    const listeners = nodes.flatMap(node => node.listeners)

    reportDuplicates(
        listeners.map(listener => listener.egressId),
        'egressId',
        issues,
    )
    reportDuplicates(
        listeners.map(listener => `${listener.bindIp}:${listener.port}`),
        'listener endpoint (bindIp:port)',
        issues,
    )
    reportDuplicates(
        listeners.map(listener => listener.egressIp),
        'egressIp',
        issues,
    )
}

function reportDuplicates(values: readonly string[], label: string, issues: string[]): void {
    const seen = new Set<string>()
    const duplicates = new Set<string>()

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value)
        }
        seen.add(value)
    }

    for (const duplicate of [...duplicates].sort()) {
        issues.push(`duplicate ${label}: ${duplicate}`)
    }
}

function isPort(value: number | undefined): value is number {
    return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 65535
}

function isPositiveInteger(value: number | undefined): value is number {
    return value !== undefined && Number.isInteger(value) && value >= 1
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function asNumberArray(value: unknown): number[] | undefined {
    return Array.isArray(value) && value.every(item => typeof item === 'number') ? value : undefined
}
