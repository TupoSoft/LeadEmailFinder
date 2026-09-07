import { expect, test } from '@playwright/test'
import { expectNextTabStop } from './keyboard'

test.describe('public entry', () => {
    test('renders the complete story without API traffic or runtime errors', async ({ page }) => {
        const consoleErrors: string[] = []
        const applicationRequests: string[] = []

        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text())
        })
        page.on('request', request => {
            if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
                applicationRequests.push(request.url())
            }
        })

        await page.goto('/')

        await expect(page).toHaveTitle('Lead Email Finder | Verify the signal before you send.')
        await expect(page.getByRole('heading', { level: 1, name: 'Verify the signal before you send.' })).toBeVisible()
        await expect(page.getByRole('heading', { level: 2, name: 'Our principles guide every signal.' })).toBeVisible()
        expect(consoleErrors).toEqual([])
        expect(applicationRequests).toEqual([])
    })

    test('supports the complete keyboard order with a visible focus indicator', async ({ page }) => {
        await page.goto('/')

        await expectNextTabStop(page, 'Skip to main content')
        await page.keyboard.press('Enter')
        await expect(page.getByRole('main')).toBeFocused()

        await page.goto('/')

        for (const accessibleName of [
            'Skip to main content',
            'Lead Email Finder home',
            'How it works',
            'Signals',
            'Principles',
            'Sign in',
            'Continue to the principles',
        ]) {
            await expectNextTabStop(page, accessibleName)
        }

        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/#principles$/)

        await expectNextTabStop(page, 'Back to how it works')
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/#how-it-works$/)
    })

    test('section links describe and reach their actual destinations', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const continueLink = page.getByRole('link', { name: 'Continue to the principles' })
        await expect(continueLink).toHaveAttribute('href', '#principles')
        await continueLink.click()
        await expect(page).toHaveURL(/#principles$/)

        const returnLink = page.getByRole('link', { name: 'Back to how it works' })
        await expect(returnLink).toHaveAttribute('href', '#how-it-works')
        await returnLink.click()
        await expect(page).toHaveURL(/#how-it-works$/)
    })

    test('reflows without horizontal scrolling at narrow widths', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 720 })
        await page.goto('/')
        await page.evaluate(() => document.fonts.ready)

        const overflowAt320 = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflowAt320).toBeLessThanOrEqual(0)

        const headlineLineCount = await page.getByRole('heading', { level: 1 }).evaluate(element => {
            const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight)
            return Math.round(element.getBoundingClientRect().height / lineHeight)
        })
        expect(headlineLineCount).toBe(4)

        await page.setViewportSize({ width: 390, height: 844 })
        const overflowAt390 = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflowAt390).toBeLessThanOrEqual(0)
    })

    test('applies the global document scrollbar contract', async ({ page }) => {
        await page.goto('/')

        const scrollbar = await page.evaluate(() => {
            const rootStyle = getComputedStyle(document.documentElement)
            const selectors = [
                '::-webkit-scrollbar',
                '::-webkit-scrollbar-track',
                '::-webkit-scrollbar-thumb',
                '::-webkit-scrollbar-thumb:hover',
                '::-webkit-scrollbar-thumb:active',
            ]
            const rules: Record<string, Record<string, number | string>> = {}

            for (const sheet of Array.from(document.styleSheets)) {
                for (const rule of Array.from(sheet.cssRules)) {
                    if (!(rule instanceof CSSStyleRule)) continue

                    const selector = rule.selectorText.replace(/^\*/, '')
                    if (!selectors.includes(selector)) continue

                    rules[selector] = {
                        background: rule.style.getPropertyValue('background'),
                        border: rule.style.getPropertyValue('border'),
                        height: Number.parseFloat(rule.style.getPropertyValue('height')),
                        width: Number.parseFloat(rule.style.getPropertyValue('width')),
                    }
                }
            }

            return {
                standard: {
                    color: rootStyle.scrollbarColor,
                    width: rootStyle.scrollbarWidth,
                },
                webkit: rules,
            }
        })

        expect(scrollbar.standard).toEqual({
            color: 'rgb(31, 90, 74) rgb(220, 230, 220)',
            width: 'thin',
        })
        expect(scrollbar.webkit['::-webkit-scrollbar']).toMatchObject({
            height: 0.75,
            width: 0.75,
        })
        expect(scrollbar.webkit['::-webkit-scrollbar-track']).toMatchObject({
            background: 'var(--color-sage)',
        })
        const thumbRule = scrollbar.webkit['::-webkit-scrollbar-thumb']
        expect(thumbRule).toMatchObject({
            background: 'var(--color-evergreen)',
        })
        expect(String(thumbRule.border)).toContain('solid')
        expect(String(thumbRule.border)).toContain('var(--color-sage)')
        expect(Number.parseFloat(String(thumbRule.border))).toBe(0.1875)
        expect(scrollbar.webkit['::-webkit-scrollbar-thumb:hover']).toMatchObject({
            background: 'var(--color-ink)',
        })
        expect(scrollbar.webkit['::-webkit-scrollbar-thumb:active']).toMatchObject({
            background: 'var(--color-accent-text)',
        })
    })

    test('removes smooth scrolling and decorative transition time for reduced motion', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')

        const motion = await page.getByRole('link', { name: 'Signals' }).evaluate(element => ({
            scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
            transitionDuration: Number.parseFloat(getComputedStyle(element).transitionDuration),
        }))

        expect(motion.scrollBehavior).toBe('auto')
        expect(motion.transitionDuration).toBeLessThanOrEqual(0.001)
    })
})
