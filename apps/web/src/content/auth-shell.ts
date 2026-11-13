export const authCopy = {
    brand: 'Lead Email Finder',
    brandHome: 'Lead Email Finder workspace home',
    workspace: 'Workspace',
    navigation: 'Application navigation',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    home: 'Home',
    checkSession: 'Check session',
    signIn: 'Sign in',
    signInGuidance: 'Sign in with an email link, or check for an existing session.',
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
        description: 'Sign in to open your workspace.',
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

export const signInCopy = {
    title: 'Sign in or create an account',
    description: 'Enter your email to get a sign-in link. New here? Your account is created when you use the link.',
    email: 'Email address',
    help: 'The link works once and expires after five minutes.',
    invalidEmail: 'Enter a valid email address, such as name@example.com.',
    submit: 'Send sign-in link',
    pending: 'Requesting your sign-in link…',
    checkTitle: 'Check your email',
    checkDescription: 'If this address can receive sign-in links, a message will arrive shortly.',
    checkHelp: 'Open the link within five minutes. You can use it once. Check your spam folder if it does not arrive.',
    resend: 'Resend link',
    resent: 'A new link has been requested. Check your inbox.',
    changeEmail: 'Use another email',
    invalidLink: 'This link has expired or has already been used. Enter your email to request a new link.',
    deliveryError: 'We could not send your sign-in link. Try again.',
    requestError: 'We could not confirm delivery. Check your inbox or try again.',
    rateLimited: 'Too many requests. Wait a moment before requesting another link.',
    offline: 'You are offline. Reconnect to request a sign-in link.',
} as const
