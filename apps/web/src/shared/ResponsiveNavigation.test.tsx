import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { applicationDestinations, type ApplicationDestination } from '../app/navigation'
import { ResponsiveNavigation } from './ResponsiveNavigation'

const destinations: ApplicationDestination[] = [
    { path: '/app', label: 'Home' },
    { path: '/app/verifications/new', label: 'Verify an email' },
    { path: '/app/billing', label: 'Billing' },
]

describe('application navigation', () => {
    it('registers the personal workspace destinations', () => {
        expect(applicationDestinations.map(item => item.path)).toEqual([
            '/app',
            '/app/verifications/new',
            '/app/billing',
        ])
    })

    it('moves focus on opening, closes with Escape and restores its trigger after navigation', async () => {
        const user = userEvent.setup()
        const router = createMemoryRouter(
            [{ path: '*', element: <ResponsiveNavigation destinations={destinations} /> }],
            { initialEntries: ['/app'] },
        )
        render(<RouterProvider router={router} />)
        screen.getByText('Open navigation').style.display = 'flex'
        await user.click(screen.getByRole('button', { name: 'Open navigation' }))
        expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus()
        await user.keyboard('{Escape}')
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus()
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        await user.click(screen.getByRole('button', { name: 'Open navigation' }))
        await user.click(screen.getByRole('link', { name: 'Verify an email' }))
        expect(router.state.location.pathname).toBe('/app/verifications/new')
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus()
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('link', { name: 'Verify an email' })).toHaveAttribute('aria-current', 'page')
        await user.click(screen.getByRole('button', { name: 'Open navigation' }))
        await act(() => router.navigate('/app/billing'))
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        await act(() => router.navigate(-1))
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
    })
})
