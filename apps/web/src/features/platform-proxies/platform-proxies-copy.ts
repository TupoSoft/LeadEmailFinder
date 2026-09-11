import type { ProxyRecord } from './platform-proxies-api'

export const proxyCopy = {
    title: 'Proxy fleet',
    description: 'Manage global proxy endpoints and their allocation settings.',
    registry: 'Proxy registry',
    registryDescription:
        'Load more to continue through the registry. Lifecycle state does not establish current health or confirm that active connections have ended.',
    create: 'Create proxy',
    edit: 'Edit proxy',
    refresh: 'Refresh proxies',
    loadMore: 'Load more',
    empty: 'No proxies are registered. Create a disabled proxy to begin.',
    end: 'You have reached the end of this list.',
    offline: 'You are offline. Reconnect, then refresh before making changes.',
    invalidCursor: 'This continuation is no longer valid. Refresh proxies to start from the beginning.',
    moreFailed: 'The next records could not be loaded. Existing records remain visible; try Load more again.',
    loadingMore: 'Loading more proxies…',
    loadingDetail: 'Loading current proxy details…',
    denied: 'Access to the proxy registry was denied. Return to your workspace or refresh your account.',
    missing: 'This proxy no longer exists. Close this dialog and refresh proxies.',
    invalid: 'The request was rejected. Review the fields and their limits, then try again.',
    conflict: 'The request conflicts with the current registry. Refresh proxies before another change.',
    failedDetail: 'Current proxy details could not be loaded. Try again before editing.',
    success: 'The change was confirmed. Refreshing the registry…',
    waiting: 'Waiting for confirmation from the server…',
    unknown:
        'The outcome is unconfirmed. The change may have been applied. Refresh and reconcile the registry before another action. Stored authentication cannot be read, so a redacted response cannot confirm whether replacement succeeded.',
    reviewed: 'I have reconciled the unconfirmed change',
    reviewedNotice: 'Reconciliation acknowledged. Any further change requires an explicit action.',
    createDescription: 'New proxies start disabled. Review the endpoint before activating it for allocation.',
    editDescription:
        'Edit the visible settings. Stored authentication is never shown; leave replacement off to preserve it.',
    authHelp:
        'These credentials belong to the proxy, not your account. Both fields are required when authentication is enabled.',
    replaceDescription:
        'Replacing authentication can break connectivity. The old values cannot be displayed or recovered here.',
    cancel: 'Cancel',
    cancelWaiting: 'Cancel waiting',
    save: 'Save changes',
    replace: 'Replace authentication',
    useAuth: 'Use authentication',
    username: 'Proxy username',
    password: 'Proxy password',
    fieldInvalid: 'Enter a value within the stated limits.',
    pairInvalid: 'Enter both the proxy username and password, or turn authentication off.',
    blacklist: 'Report MX blacklist',
    blacklistDescription:
        'Report one MX host. Existing reports remain in the registry; repeated reports are deduplicated. Removal is unavailable.',
    report: 'Report blacklist',
    mxHost: 'MX host',
    delete: 'Delete proxy',
    deleteDescription:
        'Delete this exact registry record. This does not confirm that its active connections have ended.',
    noBlacklists: 'No reported MX blacklists',
    noDescription: 'No description',
    dateUnavailable: 'Date unavailable',
} as const

export const protocolLabels = { 1: 'HTTP', 2: 'HTTPS', 3: 'SOCKS5', 4: 'SOCKS4' } satisfies Record<
    ProxyRecord['protocol'],
    string
>
export const stateLabels = { active: 'Active', draining: 'Draining', disabled: 'Disabled' } satisfies Record<
    ProxyRecord['state'],
    string
>
export const lifecycleCopy = {
    active: {
        action: 'Activate',
        title: 'Activate proxy',
        consequence:
            'New allocations may send traffic through this endpoint. Activation does not guarantee connectivity or health.',
    },
    draining: {
        action: 'Drain',
        title: 'Drain proxy',
        consequence:
            'New allocations stop. Use lease and connection evidence to determine when in-flight work has ended.',
    },
    disabled: {
        action: 'Disable',
        title: 'Disable proxy',
        consequence: 'New allocations stop. Disabling does not confirm that existing leases or connections have ended.',
    },
} satisfies Record<ProxyRecord['state'], { action: string; title: string; consequence: string }>
