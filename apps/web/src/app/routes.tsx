import { Outlet, type RouteObject } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthProvider'
import { NotFoundPage } from '../routes/NotFoundPage'
import { PublicEntryPage } from '../routes/PublicEntryPage'
import { BillingPage } from '../routes/BillingPage'
import { VerificationPage } from '../routes/VerificationPage'
import { VerificationJobPage } from '../routes/VerificationJobPage'
import { BatchVerificationPage } from '../routes/BatchVerificationPage'
import { BatchVerificationJobPage } from '../routes/BatchVerificationJobPage'
import { TeamPage } from '../features/team/TeamPage'
import { ServiceClientsPage } from '../features/service-clients/ServiceClientsPage'
import { PlatformCreditsPage } from '../features/platform-credits/PlatformCreditsPage'
import { PlatformOrganizationsPage } from '../features/platform-organizations/PlatformOrganizationsPage'
import { PlatformProxiesPage } from '../features/platform-proxies/PlatformProxiesPage'
import { InvitationPage } from '../features/invitations/InvitationPage'
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
            { path: '/accept-invitation', element: <InvitationPage /> },
            { path: '/accept-invitation/:token', element: <InvitationPage /> },
            {
                path: '/app',
                element: <ProtectedApplication />,
                children: [
                    { index: true, element: <WorkspaceHome /> },
                    { path: 'billing', element: <BillingPage /> },
                    { path: 'team', element: <TeamPage /> },
                    { path: 'service-clients', element: <ServiceClientsPage /> },
                    { path: 'platform/organizations', element: <PlatformOrganizationsPage /> },
                    { path: 'platform/proxies', element: <PlatformProxiesPage /> },
                    { path: 'platform/organizations/:organizationId/credits', element: <PlatformCreditsPage /> },
                    { path: 'verifications/new', element: <VerificationPage /> },
                    { path: 'verifications/batches/new', element: <BatchVerificationPage /> },
                    { path: 'verifications/batches/:id', element: <BatchVerificationJobPage /> },
                    { path: 'verifications/:id', element: <VerificationJobPage /> },
                    { path: 'session-expired', element: <SessionExpiredPage /> },
                    { path: 'account-unavailable', element: <AccountUnavailablePage /> },
                    { path: 'forbidden', element: <ForbiddenPage /> },
                    { path: '*', element: <WorkspaceNotFoundPage /> },
                ],
            },
            {
                path: '/billing/complete',
                element: <ProtectedApplication />,
                children: [{ index: true, element: <BillingPage returned /> }],
            },
            { path: '*', element: <NotFoundPage /> },
        ],
    },
]
