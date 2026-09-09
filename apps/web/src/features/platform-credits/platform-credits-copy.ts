export const creditsCopy = {
    title: 'Organization credits',
    description: 'Inspect and adjust this organization’s credit balance.',
    back: 'Back to organizations',
    balance: 'Current credit balance',
    balanceDescription: 'Balances come from the server. Refresh to check for changes made elsewhere.',
    current: 'Current balance',
    organization: 'Organization',
    organizationId: 'Organization ID',
    refresh: 'Refresh balance',
    add: 'Add credits',
    addDescription: 'Increase the current balance by a specified number of credits.',
    set: 'Set absolute balance',
    setDescription: 'Replace the entire balance with a final value. This may remove existing credits.',
    addAmount: 'Credits to add',
    setAmount: 'Final credit balance',
    addInvalid: 'Enter a positive whole number of credits up to 2,147,483,647.',
    setInvalid: 'Enter zero or a positive whole number of credits up to 2,147,483,647.',
    reviewAdd: 'Review addition',
    reviewSet: 'Review absolute set',
    confirmAdd: 'Confirm credit addition',
    confirmSet: 'Confirm absolute balance',
    confirmAddDescription:
        'Confirm the organization and amount before adding credits. The displayed balance will stay unchanged until the server responds.',
    confirmSetDescription:
        'This replaces the organization’s balance with the requested final value, even if the balance changes elsewhere. Confirm the organization and final value.',
    cancel: 'Cancel',
    adding: 'Adding credits…',
    setting: 'Setting absolute balance…',
    added: 'Credit addition confirmed. The balance is being refreshed from the server.',
    setSuccess: 'Absolute balance confirmed. The balance is being refreshed from the server.',
    unknown:
        'The addition is unconfirmed and may already have applied. The refreshed balance does not prove whether this adjustment applied. Retry the same adjustment to resolve it safely.',
    conflict:
        'This adjustment conflicts with an existing addition. Its amount and recovery key have been retained. Reconcile the adjustment before abandoning it; retrying cannot change its amount.',
    unresolved: 'An unresolved addition is retained in this tab for explicit recovery.',
    restored: 'An unresolved addition was recovered in this tab. It has not been sent again.',
    retry: 'Retry same adjustment',
    retryRejected:
        'This retry was rejected. The earlier addition remains unresolved and may already have applied. Its amount and recovery key have been retained for reconciliation.',
    abandon: 'Abandon unresolved adjustment',
    abandonDescription:
        'This addition may already have applied. Abandoning removes this tab’s recovery key and loses safe same-adjustment recovery. Reconcile the server-side outcome before starting a separate adjustment.',
    recoveryLimit:
        'Recovery is available in this tab for 24 hours. Closing the tab or clearing browser storage loses safe same-adjustment recovery. Expired recovery is removed only after you acknowledge that the server-side outcome remains unknown.',
    acknowledgeAbandon: 'Acknowledge and abandon',
    abandoned:
        'Unresolved adjustment abandoned. Its server-side outcome remains unknown. Reconcile that outcome before making a separate adjustment.',
    expired:
        'The 24-hour recovery window has expired. This addition may already have applied. Acknowledge the unknown outcome before removing its recovery key.',
    storageClearFailed:
        'The server response was received, but this tab’s recovery record could not be cleared. Keep this adjustment for reconciliation; a separate adjustment is blocked.',
    storageFailed:
        'The adjustment could not be saved for safe recovery, so no request was sent. Allow this tab to use browser storage before trying again.',
    invalid: 'The server rejected the amount. Review the value before making another adjustment.',
    denied: 'Your account cannot manage this organization’s credits. Refresh your account access before trying again.',
    setUnknown:
        'The absolute set is unconfirmed and may have applied. Reload the current balance before deciding whether to make another explicit set.',
    setMatches:
        'The absolute set is unconfirmed. The current balance matches the requested value; this does not establish which request caused it.',
    missing: 'This organization could not be found. Return to the directory to select an organization.',
    unavailable: 'Organization details could not be loaded. Retry or return to the directory. No balance is shown.',
    retryDetails: 'Retry organization details',
    offline: 'You are offline. Reconnect to load balances or adjust credits.',
} as const
