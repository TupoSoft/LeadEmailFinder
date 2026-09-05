import type { RouteObject } from 'react-router-dom'
import { NotFoundPage } from '../routes/NotFoundPage'
import { PublicEntryPage } from '../routes/PublicEntryPage'

export const appRoutes: RouteObject[] = [
    {
        path: '/',
        element: <PublicEntryPage />,
    },
    {
        path: '*',
        element: <NotFoundPage />,
    },
]
