import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { appRoutes } from '../app/routes'
import { notFoundCopy, publicEntryCopy } from '../content/public-entry'

describe('not-found route', () => {
    it('explains the missing page and provides a working recovery path', async () => {
        const user = userEvent.setup()
        const router = createMemoryRouter(appRoutes, { initialEntries: ['/missing-page'] })
        render(<RouterProvider router={router} />)

        expect(screen.getByRole('heading', { level: 1, name: notFoundCopy.title })).toBeInTheDocument()
        expect(screen.getByText(notFoundCopy.description)).toBeInTheDocument()

        await user.click(screen.getByRole('link', { name: notFoundCopy.homeLink }))

        expect(await screen.findByRole('heading', { level: 1, name: publicEntryCopy.hero.title })).toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/')
    })
})
