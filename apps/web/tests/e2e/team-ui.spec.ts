import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { CurrentAccount } from '../../src/api/current-account'
import type { TeamMember } from '../../src/features/team/team-api'
import { teamCopy } from '../../src/features/team/team-copy'

// This suite only renders nonsecret lists and membership confirmations. Invitation issue/acceptance
// belong to the isolated invitation configuration, which disables all diagnostic artifacts.
const account: CurrentAccount = {
    email: 'team.owner@example.test',
    membership: { id: 'owner-a', role: 'owner' },
    organization: { id: 'organization-a', name: 'Northstar research' },
    capabilities: ['team.manage'],
    grantableServiceClientPermissions: [],
}
const members: TeamMember[] = [
    { id: 'owner-a', email: account.email, role: 'owner', status: 'active' },
    { id: 'member-a', email: 'member.with.a.long.address.for.layout@example.test', role: 'member', status: 'active' },
    { id: 'disabled-a', email: null, role: 'admin', status: 'disabled' },
]
const memberEmail = members[1].email!

async function mockTeam(
    context: BrowserContext,
    options: { role?: 'owner' | 'admin' | 'member'; forbidden?: boolean; empty?: boolean } = {},
) {
    const role = options.role ?? 'owner'
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                ...account,
                membership: { ...account.membership, role },
                capabilities: role === 'member' ? [] : account.capabilities,
            },
        }),
    )
    await context.route('**/v1/organizations/organization-a/members', route =>
        route.fulfill({
            status: options.forbidden ? 403 : 200,
            json: options.forbidden ? {} : options.empty ? [] : members,
        }),
    )
    await context.route('**/v1/organizations/organization-a/invitations', route =>
        route.fulfill({ status: 405, json: {} }),
    )
}

async function accessible(page: Page) {
    const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
        .analyze()
    expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0,
    )
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function screenshot(page: Page, name: string) {
    if (!process.env.TEAM_SCREENSHOT_DIR) return
    await mkdir(process.env.TEAM_SCREENSHOT_DIR, { recursive: true })
    const position = await page.evaluate(async () => {
        const skip = document.querySelector<HTMLAnchorElement>('a[href="#main-content"]')!
        const read = () => ({
            scrollY: window.scrollY,
            top: skip.getBoundingClientRect().top,
            bottom: skip.getBoundingClientRect().bottom,
            focused: document.activeElement === skip,
            transform: getComputedStyle(skip).transform,
        })
        const before = read()
        const focusedControl = document.activeElement
        // Capture from the document origin: a scrolled full-page screenshot can paint an
        // offscreen fixed skip link at its document-relative position inside the image.
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return { before, after: read(), focusPreserved: document.activeElement === focusedControl }
    })
    expect(position.before.focused).toBe(false)
    expect(position.before.bottom).toBeLessThan(0)
    expect(position.after.scrollY).toBe(0)
    expect(position.after.bottom).toBeLessThan(0)
    expect(position.focusPreserved).toBe(true)
    await writeFile(
        join(process.env.TEAM_SCREENSHOT_DIR, `${name}-${page.viewportSize()?.width}.json`),
        JSON.stringify(position, null, 2),
    )
    await page.screenshot({
        path: join(process.env.TEAM_SCREENSHOT_DIR, `${name}-${page.viewportSize()?.width}.png`),
        fullPage: true,
    })
}

async function openNavigation(page: Page) {
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
    if (await trigger.isVisible()) await trigger.click()
}

test('team renders truthful states with responsive layout, usable native role selection, and accessible navigation', async ({
    page,
    context,
}) => {
    await mockTeam(context)
    const errors: string[] = []
    page.on('pageerror', () => errors.push('pageerror'))
    page.on('console', message => {
        if (message.type() === 'error') errors.push('console error')
    })
    await page.goto('/app/team')
    await expect(page).toHaveTitle('Team | Lead Email Finder')
    await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
    await expect(page.getByText('Members 1–3 of 3')).toBeVisible()
    const panel = page.getByRole('region', { name: teamCopy.members, exact: true })
    const refresh = panel.getByRole('button', { name: teamCopy.refresh, exact: true })
    await expect(refresh).toBeEnabled()
    const headingBox = (await panel.getByRole('heading', { name: teamCopy.members }).boundingBox())!
    const descriptionBox = (await panel.getByText(teamCopy.membersDescription).boundingBox())!
    const refreshBox = (await refresh.boundingBox())!
    const panelBox = (await panel.boundingBox())!
    const invitationBox = (await page.getByRole('region', { name: teamCopy.invite, exact: true }).boundingBox())!
    expect(panelBox.y - (invitationBox.y + invitationBox.height)).toBeGreaterThanOrEqual(0)
    expect(panelBox.y - (invitationBox.y + invitationBox.height)).toBeLessThanOrEqual(1)
    if (page.viewportSize()!.width > 768) {
        expect(refreshBox.x).toBeGreaterThan(headingBox.x)
        expect(Math.abs(refreshBox.x + refreshBox.width - (panelBox.x + panelBox.width))).toBeLessThanOrEqual(1)
        expect(
            Math.abs(refreshBox.y + refreshBox.height / 2 - (headingBox.y + headingBox.height / 2)),
        ).toBeLessThanOrEqual(1)
    } else {
        expect(refreshBox.y).toBeGreaterThanOrEqual(descriptionBox.y + descriptionBox.height)
        expect(Math.abs(refreshBox.x - headingBox.x)).toBeLessThanOrEqual(1)
    }
    const refreshed = page.waitForResponse(
        response =>
            response.request().method() === 'GET' &&
            new URL(response.url()).pathname === '/v1/organizations/organization-a/members',
    )
    await refresh.focus()
    await expect(refresh).toBeFocused()
    await page.keyboard.press('Enter')
    expect((await refreshed).status()).toBe(200)
    await expect(refresh).toBeEnabled()
    await expect(page.getByText('Members 1–3 of 3')).toBeVisible()
    const disabled = page.getByRole('row').filter({ hasText: 'Email unavailable' })
    await expect(disabled).toContainText('Disabled')
    await expect(disabled.getByRole('button')).toHaveCount(0)
    const role = page.getByRole('combobox', { name: `Role for ${memberEmail}` })
    await role.focus()
    // Popup geometry and navigation are intentionally owned by the operating system.
    await page.keyboard.press('Alt+ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(role).toHaveValue('admin')
    await expect(page.getByRole('button', { name: `Save role for ${memberEmail}` })).toBeEnabled()
    await accessible(page)
    await screenshot(page, 'team')
    await openNavigation(page)
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toHaveAttribute('href', '/app/team')
    expect(errors).toEqual([])
})

test('owner role change requires confirmation, traps focus, and preserves an authoritative final-owner rejection', async ({
    page,
    context,
}) => {
    await mockTeam(context)
    let patches = 0
    let reads = 0
    await context.route('**/v1/organizations/organization-a/members', route => {
        reads++
        return route.fulfill({ json: members })
    })
    await context.route('**/v1/organizations/organization-a/members/owner-a', route => {
        patches++
        return route.fulfill({ status: 409, json: {} })
    })
    await page.goto('/app/team')
    await page.getByRole('combobox', { name: `Role for ${account.email}` }).selectOption('admin')
    await page.getByRole('button', { name: `Save role for ${account.email}` }).click()
    const dialog = page.getByRole('dialog', { name: teamCopy.ownerConfirmation })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Save role', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    expect(patches).toBe(0)
    await accessible(page)
    await screenshot(page, 'team-owner-confirmation')
    const before = reads
    await dialog.getByRole('button', { name: 'Save role', exact: true }).click()
    await expect(page.getByText(teamCopy.conflict)).toBeVisible()
    await expect.poll(() => reads).toBeGreaterThan(before)
    await expect(page.getByText(teamCopy.roleSaved)).toHaveCount(0)
    await expect(page).toHaveURL(/\/app\/team$/)
})

test('disabling access names the consequence, restores focus on Escape, and refreshes the disabled membership', async ({
    page,
    context,
}) => {
    await mockTeam(context)
    let removed = false
    await context.route('**/v1/organizations/organization-a/members', route =>
        route.fulfill({
            json: members.map(member =>
                member.id === 'member-a' && removed ? { ...member, status: 'disabled' } : member,
            ),
        }),
    )
    await context.route('**/v1/organizations/organization-a/members/member-a', route => {
        removed = true
        return route.fulfill({ status: 204 })
    })
    await page.goto('/app/team')
    const remove = page.getByRole('button', { name: `Disable access for ${memberEmail}` })
    await remove.click()
    const dialog = page.getByRole('dialog', { name: teamCopy.removalConfirmation })
    await expect(dialog).toContainText('cannot be reactivated')
    await page.keyboard.press('Escape')
    await expect(remove).toBeFocused()
    expect(removed).toBe(false)
    await remove.click()
    await dialog.getByRole('button', { name: 'Disable access', exact: true }).click()
    await expect(page.getByText(teamCopy.removed)).toBeVisible()
    await expect(remove).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: memberEmail })).toContainText('Disabled')
    await accessible(page)
})

test('administrator guidance hides owner actions and a denied member list stays authoritative', async ({
    page,
    context,
}) => {
    await mockTeam(context, { role: 'admin' })
    await page.goto('/app/team')
    await expect(page.getByText(teamCopy.ownerOnly)).toBeVisible()
    await expect(page.getByRole('combobox', { name: `Role for ${account.email}` })).toHaveCount(0)
    await expect(
        page.getByRole('combobox', { name: `Role for ${memberEmail}` }).getByRole('option', { name: 'Owner' }),
    ).toHaveCount(0)
    await accessible(page)
    await mockTeam(context, { role: 'member', forbidden: true })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await openNavigation(page)
    await expect(page.getByRole('link', { name: 'Team', exact: true })).toHaveCount(0)
})

test('empty, read failure, recovery, and offline states keep the team usable', async ({ page, context }) => {
    await mockTeam(context, { empty: true })
    let unavailable = true
    await context.route('**/v1/organizations/organization-a/members', route =>
        route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? {} : [] }),
    )
    await page.goto('/app/team')
    const panel = page.getByRole('region', { name: 'Organization members', exact: true })
    await expect(panel.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    unavailable = false
    await panel.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByText(teamCopy.empty)).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await context.setOffline(true)
    await expect(page.getByText(teamCopy.offline)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create invitation', exact: true })).toBeDisabled()
    await accessible(page)
    await screenshot(page, 'team-empty-offline')
    await context.setOffline(false)
    await expect(page.getByRole('button', { name: 'Create invitation', exact: true })).toBeEnabled()
})
