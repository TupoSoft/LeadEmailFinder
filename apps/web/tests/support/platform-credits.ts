import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

export async function expectCreditBalance(page: Page, balance: number) {
    await expect(
        page.getByRole('region', { name: 'Current credit balance', exact: true }).getByRole('definition').last(),
    ).toHaveText(balance.toLocaleString('en-US'))
}

export async function reviewCreditAddition(page: Page, amount: number) {
    await page.getByLabel('Credits to add', { exact: true }).fill(String(amount))
    await page.getByRole('button', { name: 'Review addition', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirm credit addition', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    return dialog
}

export async function addCredits(page: Page, amount: number) {
    const dialog = await reviewCreditAddition(page, amount)
    await dialog.getByRole('button', { name: 'Add credits', exact: true }).click()
}

export async function reviewAbsoluteBalance(page: Page, amount: number) {
    await page.getByLabel('Final credit balance', { exact: true }).fill(String(amount))
    await page.getByRole('button', { name: 'Review absolute set', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Confirm absolute balance', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    return dialog
}

export async function expectCreditsAccessible(page: Page) {
    await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)))
    })
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(audit.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}
