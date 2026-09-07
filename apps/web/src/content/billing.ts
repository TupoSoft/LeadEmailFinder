export const billingCopy = {
    title: 'Billing',
    description: 'Review your organization’s credits, choose a credit pack, and follow your purchases.',
    balance: 'Credit balance',
    balanceDescription: 'The latest balance reported by your organization’s account.',
    catalog: 'Credit packs',
    catalogDescription:
        'Choose a pack to continue to secure hosted checkout. Payment confirmation may arrive after you return.',
    history: 'Purchase history',
    historyDescription: 'Purchases for your current organization, newest first. Dates are shown in UTC.',
    refresh: 'Refresh billing',
    emptyCatalog: 'No credit packs are currently available. Try refreshing the catalog later.',
    emptyHistory: 'No purchases yet. Choose a credit pack above to start checkout.',
    readOnly: 'You can view billing. An organization owner with billing management access can start checkout.',
    checkoutPending: 'Opening checkout. Please wait before starting another purchase.',
    checkoutReady: 'Your checkout is ready. Continue to the hosted payment page when you are ready.',
    continueCheckout: 'Continue to checkout',
    checkoutUnavailable: 'Checkout is unavailable. Review your purchase history before trying again.',
    packUnavailable:
        'This credit pack is no longer available. Review the refreshed catalog and choose an available pack.',
    uncertain:
        'Checkout creation could not be confirmed. A purchase may have been created. Review the refreshed history before deliberately starting another checkout.',
    refreshRequired: 'Refresh purchase history successfully before starting another checkout.',
    offline: 'You are offline. Automatic updates are paused. Reconnect, then refresh billing.',
    paused: 'Automatic updates are paused while this page is hidden or offline.',
    polling: 'Checking for payment confirmation. Your balance changes only when the account reports the credits.',
    pollingStopped:
        'Automatic checks have finished. Payment confirmation can take longer. Refresh billing to check again.',
    returned: {
        unknown: {
            title: 'You returned from checkout',
            description: 'Returning does not confirm payment. Review the latest balance and purchase history below.',
        },
        pending: {
            title: 'Payment is pending',
            description:
                'Payment has not yet been confirmed. Your credits are shown only when the account reports them.',
        },
        paid: {
            title: 'Payment confirmed',
            description:
                'This purchase is paid. The credit balance below comes from your account; refresh it if confirmation is still arriving.',
        },
        failed: {
            title: 'Payment failed',
            description:
                'This purchase was not completed. Review your history before choosing a credit pack to try again.',
        },
        expired: {
            title: 'Checkout expired',
            description: 'This checkout has expired. Choose a credit pack to start a new checkout.',
        },
    },
    statuses: { pending: 'Pending', paid: 'Paid', failed: 'Failed', expired: 'Expired' },
    date: 'Purchase date',
    credits: 'Credits',
    amount: 'Amount',
    status: 'Status',
    previous: 'Previous purchases',
    next: 'Next purchases',
    unavailableDate: 'Date unavailable',
    unavailableAmount: 'Amount unavailable',
} as const
