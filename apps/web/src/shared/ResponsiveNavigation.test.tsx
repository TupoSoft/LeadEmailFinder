import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { visibleDestinations, type ApplicationDestination } from '../app/navigation'
import { ResponsiveNavigation } from './ResponsiveNavigation'

const destinations: ApplicationDestination[] = [
    { path: '/app', label: 'Home' },
    { path: '/app/team', label: 'Team', capability: 'team.manage' },
    { path: '/app/billing', label: 'Billing', capability: 'billing.read' },
    { path: '/app/service-clients', label: 'Service clients', capability: 'service_clients.manage' },
]

describe('application navigation', () => {
    it('uses effective capabilities alone for each registered destination', () => {
        expect(visibleDestinations([], destinations).map(item => item.label)).toEqual(['Home'])
        expect(visibleDestinations(['team.manage', 'billing.read'], destinations).map(item => item.label)).toEqual([
            'Home',
            'Team',
            'Billing',
        ])
        expect(visibleDestinations(['service_clients.manage'], destinations).map(item => item.label)).toEqual([
            'Home',
            'Service clients',
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
        await user.click(screen.getByRole('link', { name: 'Team' }))
        expect(router.state.location.pathname).toBe('/app/team')
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus()
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute('aria-current', 'page')
        await user.click(screen.getByRole('button', { name: 'Open navigation' }))
        await act(() => router.navigate('/app/billing'))
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
        await act(() => router.navigate(-1))
        expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
    })
})
