import { Outlet, type RouteObject } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { NotFoundPage } from '../routes/NotFoundPage'
import { PublicEntryPage } from '../routes/PublicEntryPage'
import {
    AccountUnavailablePage,
    CallbackErrorPage,
    ForbiddenPage,
    ProtectedApplication,
    SessionExpiredPage,
    WorkspaceNotFoundPage,
} from './AuthRoutes'
import { WorkspaceHome } from './WorkspaceHome'

export const appRoutes: RouteObject[] = [
    {
        element: (
            <AuthProvider>
                <Outlet />
            </AuthProvider>
        ),
        children: [
            { path: '/', element: <PublicEntryPage /> },
            { path: '/auth/error', element: <CallbackErrorPage /> },
            {
                path: '/app',
                element: <ProtectedApplication />,
                children: [
                    { index: true, element: <WorkspaceHome /> },
                    { path: 'session-expired', element: <SessionExpiredPage /> },
                    { path: 'account-unavailable', element: <AccountUnavailablePage /> },
                    { path: 'forbidden', element: <ForbiddenPage /> },
                    { path: '*', element: <WorkspaceNotFoundPage /> },
                ],
            },
            { path: '*', element: <NotFoundPage /> },
        ],
    },
]
