import type { CurrentAccount } from '../api/current-account'

export const authCopy = {
    brand: 'Lead Email Finder',
    brandHome: 'Lead Email Finder workspace home',
    workspace: 'Workspace',
    navigation: 'Application navigation',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    home: 'Home',
    signIn: 'Sign in',
    signOut: 'Sign out',
    retry: 'Try again',
    notFoundTitle: 'Page not found',
    retrySignOut: 'Retry sign-out',
    returnHome: 'Back to workspace',
    publicHome: 'About Lead Email Finder',
    about: 'About',
    emailUnavailable: 'Email unavailable',
    account: 'Signed-in account',
    organization: 'Organization',
    access: 'Your access',
    accessDescription:
        'Your organization determines what you can access. Available tools will appear in the navigation as they are added.',
    noAccess:
        'No workspace capabilities are available for this account. Contact your organization administrator if you need access.',
    homeTitle: 'Your workspace',
    homeDescription: 'You are signed in. Review your account and organization below.',
    refreshAccount: 'Refresh account',
    loading: { title: 'Opening your workspace', description: 'Checking your session and account access.' },
    signingIn: {
        title: 'Continue to sign in',
        description: 'Opening the sign-in page. If it does not open, use the link below.',
    },
    expired: { title: 'Your session has expired', description: 'Sign in again to return to the page you were using.' },
    accountUnavailable: {
        title: 'Account unavailable',
        description:
            'This session cannot open a human account. Sign in again, or contact your organization administrator if this continues.',
    },
    forbidden: {
        title: 'Access denied',
        description:
            'Your account does not have access to this operation. Return to your workspace or contact your organization administrator.',
    },
    unavailable: {
        title: 'Your workspace could not be opened',
        description: 'We could not check your account. Check your connection and try again.',
    },
    signingOut: {
        title: 'Signing out',
        description: 'Your account data has been cleared from this page. Waiting for sign-out confirmation.',
    },
    signedOut: {
        title: 'You are signed out',
        description: 'Your session has ended. Sign in to open your workspace again.',
    },
    logoutUncertain: {
        title: 'Sign-out could not be confirmed',
        description:
            'Your account data has been cleared from this page, but your server session may still be active. Retry sign-out to confirm it has ended, or sign in again to continue working.',
    },
    callback: {
        title: 'Sign-in did not complete',
        unknown: 'We could not complete sign-in. Start a fresh sign-in attempt.',
        login_state_invalid: 'This sign-in attempt expired or has already been used. Start a fresh sign-in attempt.',
        authorization_code_exchange_failed:
            'The sign-in service could not complete this attempt. Try signing in again.',
        active_membership_required:
            'An active organization membership is required. Contact your organization administrator, then sign in again.',
    },
} as const

export const capabilityLabels: Record<CurrentAccount['capabilities'][number], string> = {
    'verification.run': 'Run verifications',
    'verification.read': 'View verification results',
    'team.manage': 'Manage team members',
    'service_clients.manage': 'Manage service clients',
    'billing.read': 'View billing',
    'billing.manage': 'Manage billing',
    'platform.organizations.manage': 'Manage organizations',
    'platform.credits.manage': 'Manage organization credits',
    'platform.proxies.manage': 'Manage proxy fleet',
}
