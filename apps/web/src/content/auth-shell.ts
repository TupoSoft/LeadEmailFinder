export const authCopy = {
    brand: 'Lead Email Finder',
    brandHome: 'Lead Email Finder workspace home',
    workspace: 'Workspace',
    navigation: 'Application navigation',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    home: 'Home',
    checkSession: 'Check session',
    signInUnavailable: 'Sign-in is not available yet. You can check for an existing session.',
    signOut: 'Sign out',
    retry: 'Try again',
    notFoundTitle: 'Page not found',
    retrySignOut: 'Retry sign-out',
    returnHome: 'Back to workspace',
    publicHome: 'About Lead Email Finder',
    about: 'About',
    account: 'Signed-in account',
    name: 'Name',
    access: 'Your tools',
    accessDescription: 'Verify email addresses, review results, and check your credit balance.',
    homeTitle: 'Your workspace',
    homeDescription: 'You are signed in. Review your account below.',
    refreshAccount: 'Refresh account',
    loading: { title: 'Opening your workspace', description: 'Checking your session and account access.' },
    expired: { title: 'Your session has expired', description: 'Your session is no longer active.' },
    accountUnavailable: {
        title: 'Account unavailable',
        description: 'Your email address must be verified before this account can open the workspace.',
    },
    forbidden: {
        title: 'Access denied',
        description:
            'Your account does not have access to this operation. Return to your workspace and refresh your account.',
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
        description: 'Your session has ended. Check your session to return to your workspace.',
    },
    logoutUncertain: {
        title: 'Sign-out could not be confirmed',
        description:
            'Your account data has been cleared from this page, but your server session may still be active. Retry sign-out to confirm it has ended.',
    },
    callback: {
        title: 'Sign-in did not complete',
        unknown: 'We could not complete sign-in. Start a fresh sign-in attempt.',
        login_state_invalid: 'This sign-in attempt expired or has already been used. Start a fresh sign-in attempt.',
        authorization_code_exchange_failed:
            'The sign-in service could not complete this attempt. Try signing in again.',
    },
} as const

export const personalTools = ['Run verifications', 'View verification results', 'View billing'] as const
