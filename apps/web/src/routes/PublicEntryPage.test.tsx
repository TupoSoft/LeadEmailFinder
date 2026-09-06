import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { appRoutes } from '../app/routes'
import { publicEntryCopy } from '../content/public-entry'

function renderPublicEntry() {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
}

describe('public entry route', () => {
    it('presents the product story through meaningful landmarks and headings', () => {
        renderPublicEntry()

        expect(screen.getByRole('banner')).toBeInTheDocument()
        expect(screen.getByRole('navigation', { name: publicEntryCopy.navigationLabel })).toBeInTheDocument()
        expect(screen.getByRole('main')).toBeInTheDocument()
        expect(screen.getByRole('contentinfo')).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: publicEntryCopy.hero.title })).toBeInTheDocument()
        expect(screen.getByText(publicEntryCopy.hero.callout)).toBeInTheDocument()
    })

    it('exposes every verification stage and principle as structured content', () => {
        renderPublicEntry()

        const signals = screen.getByRole('region', { name: publicEntryCopy.signals.heading })
        for (const signal of publicEntryCopy.signals.items) {
            expect(within(signals).getByText(signal.name)).toBeInTheDocument()
            expect(within(signals).getByText(signal.description)).toBeInTheDocument()
        }

        const principles = screen.getByRole('region', { name: publicEntryCopy.principles.heading })
        for (const principle of publicEntryCopy.principles.items) {
            expect(within(principles).getByRole('heading', { level: 3, name: principle.name })).toBeInTheDocument()
            expect(within(principles).getByText(principle.description)).toBeInTheDocument()
        }
    })

    it('uses working fragment destinations for public navigation', () => {
        renderPublicEntry()

        for (const item of publicEntryCopy.navigation) {
            expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', `#${item.target}`)
            expect(document.getElementById(item.target)).toBeInTheDocument()
        }
    })

    it('labels the section links for the destinations they reach', () => {
        renderPublicEntry()

        const continueLink = screen.getByRole('link', { name: publicEntryCopy.hero.continueLink })
        const returnLink = screen.getByRole('link', { name: publicEntryCopy.principles.returnLink })

        expect(continueLink).toHaveAttribute('href', '#principles')
        expect(document.querySelector(continueLink.getAttribute('href')!)).toBeInTheDocument()
        expect(returnLink).toHaveAttribute('href', '#how-it-works')
        expect(document.querySelector(returnLink.getAttribute('href')!)).toBeInTheDocument()
    })
})
