import { useEffect } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/use-auth'
import { safeDestination, signInHref } from '../features/auth/destination'
import { notFoundCopy } from '../content/public-entry'
import { authCopy } from '../content/auth-shell'
import { StateMessage } from '../shared/StateMessage'
import action from '../shared/Action.module.css'
import { ApplicationFrame } from './ApplicationFrame'

const recoveryPaths = new Set(['/app/session-expired', '/app/account-unavailable', '/app/forbidden'])

function SignInLink({ destination, secondary = false }: { destination: string; secondary?: boolean }) {
    return (
        <a className={`${action.action} ${secondary ? action.secondary : ''}`} href={signInHref(destination)}>
            {authCopy.signIn}
        </a>
    )
}

function StartSignIn({ destination }: { destination: string }) {
    const href = signInHref(destination)
    useEffect(() => {
        window.location.replace(href)
    }, [href])
    return (
        <StateMessage {...authCopy.signingIn} pending>
            <SignInLink destination={destination} />
        </StateMessage>
    )
}

export function ProtectedApplication() {
    const { state, bootstrap, signOut, clearAccessDenied } = useAuth()
    const location = useLocation()
    const destination = safeDestination(
        recoveryPaths.has(location.pathname)
            ? new URLSearchParams(location.search).get('destination')
            : `${location.pathname}${location.search}${location.hash}`,
    )

    useEffect(() => {
        void bootstrap()
    }, [bootstrap])
    useEffect(() => {
        if (location.pathname === '/app/forbidden') clearAccessDenied()
    }, [location.pathname, clearAccessDenied])

    let content
    switch (state.status) {
        case 'loading':
            content = <StateMessage {...authCopy.loading} pending />
            break
        case 'unauthenticated':
            content = recoveryPaths.has(location.pathname) ? (
                <StateMessage
                    {...(location.pathname === '/app/account-unavailable'
                        ? authCopy.accountUnavailable
                        : authCopy.expired)}
                >
                    <SignInLink destination={destination} />
                </StateMessage>
            ) : (
                <StartSignIn destination={destination} />
            )
            break
        case 'session-expired':
            content =
                location.pathname !== '/app/session-expired' ? (
                    <Navigate replace to={`/app/session-expired?destination=${encodeURIComponent(destination)}`} />
                ) : (
                    <StateMessage {...authCopy.expired}>
                        <SignInLink destination={destination} />
                    </StateMessage>
                )
            break
        case 'account-unavailable':
            content =
                location.pathname !== '/app/account-unavailable' ? (
                    <Navigate replace to={`/app/account-unavailable?destination=${encodeURIComponent(destination)}`} />
                ) : (
                    <StateMessage {...authCopy.accountUnavailable}>
                        <SignInLink destination={destination} />
                    </StateMessage>
                )
            break
        case 'unavailable':
            content = (
                <StateMessage {...authCopy.unavailable}>
                    <button className={action.action} type="button" onClick={() => void bootstrap()}>
                        {authCopy.retry}
                    </button>
                </StateMessage>
            )
            break
        case 'signing-out':
            content = <StateMessage {...authCopy.signingOut} pending />
            break
        case 'signed-out':
            content = (
                <StateMessage {...authCopy.signedOut}>
                    <SignInLink destination="/app" />
                </StateMessage>
            )
            break
        case 'logout-uncertain':
            content = (
                <StateMessage {...authCopy.logoutUncertain}>
                    <button type="button" className={action.action} onClick={() => void signOut()}>
                        {authCopy.retrySignOut}
                    </button>
                    <SignInLink destination={destination} secondary />
                </StateMessage>
            )
            break
        case 'authenticated':
            content =
                state.accessDenied && location.pathname !== '/app/forbidden' ? (
                    <Navigate replace to="/app/forbidden" />
                ) : (
                    <Outlet />
                )
            break
    }

    return (
        <ApplicationFrame
            account={state.status === 'authenticated' ? state.account : undefined}
            onSignOut={() => void signOut()}
        >
            {content}
        </ApplicationFrame>
    )
}

export function SessionExpiredPage() {
    const destination = safeDestination(new URLSearchParams(useLocation().search).get('destination'))
    return (
        <StateMessage {...authCopy.expired}>
            <SignInLink destination={destination} />
        </StateMessage>
    )
}

export function AccountUnavailablePage() {
    return (
        <StateMessage {...authCopy.accountUnavailable}>
            <SignInLink destination="/app" />
        </StateMessage>
    )
}

export function ForbiddenPage() {
    return (
        <StateMessage {...authCopy.forbidden}>
            <Link className={action.action} to="/app">
                {authCopy.returnHome}
            </Link>
        </StateMessage>
    )
}

export function CallbackErrorPage() {
    const code = new URLSearchParams(useLocation().search).get('code')
    const description =
        code === 'login_state_invalid' ||
        code === 'authorization_code_exchange_failed' ||
        code === 'active_membership_required'
            ? authCopy.callback[code]
            : authCopy.callback.unknown
    return (
        <ApplicationFrame>
            <StateMessage title={authCopy.callback.title} description={description}>
                <SignInLink destination="/app" />
            </StateMessage>
        </ApplicationFrame>
    )
}

export function WorkspaceNotFoundPage() {
    return (
        <StateMessage title={authCopy.notFoundTitle} description={notFoundCopy.description}>
            <Link className={action.action} to="/app">
                {authCopy.returnHome}
            </Link>
        </StateMessage>
    )
}
