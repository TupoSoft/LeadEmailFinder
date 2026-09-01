import { BadGatewayException, BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { PermissionsGuard, RolePermissionPolicy } from '@tuposoft/lead-email-finder/modules/auth'
import { CreditPurchaseService, PaymentCheckoutError } from '../../application/credit-purchase.service'
import { CreditPackNotFoundError } from '../../domain/credit-pack'
import { PurchaseRecord } from '../../domain/purchase-record'
import { CreditPurchaseController } from './credit-purchase.controller'

function principalWith(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
        credentialKind: 'human_session',
        issuer: 'https://issuer.example.test',
        subject: 'owner-1',
        organizationId: '10000000-0000-4000-8000-000000000001',
        membershipRole: 'owner',
        permissions: [],
        credentialId: 'identity-1',
        ...overrides,
    }
}

describe('CreditPurchaseController', () => {
    let purchases: jest.Mocked<Pick<CreditPurchaseService, 'start' | 'listForOrganization'>>
    let controller: CreditPurchaseController

    beforeEach(() => {
        purchases = { start: jest.fn(), listForOrganization: jest.fn() }
        controller = new CreditPurchaseController(purchases as unknown as CreditPurchaseService)
    })

    it('returns the purchase id, pending status, and checkout redirect', async () => {
        purchases.start.mockResolvedValue({
            purchase: { id: 'purchase-1', status: 'pending' } as PurchaseRecord,
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })
        const principal = principalWith()

        await expect(controller.create({ packId: 'starter' }, principal)).resolves.toEqual({
            id: 'purchase-1',
            status: 'pending',
            redirectUrl: 'http://localhost:3000/payment-return?purchaseId=purchase-1',
        })
        expect(purchases.start).toHaveBeenCalledWith(principal, 'starter')
    })

    it('maps an unknown pack to a bad request', async () => {
        purchases.start.mockRejectedValue(new CreditPackNotFoundError('missing'))

        await expect(controller.create({ packId: 'missing' }, principalWith())).rejects.toThrow(BadRequestException)
    })

    it('maps a provider failure to bad gateway', async () => {
        purchases.start.mockRejectedValue(new PaymentCheckoutError(new Error('provider unavailable')))

        await expect(controller.create({ packId: 'starter' }, principalWith())).rejects.toThrow(BadGatewayException)
    })

    it.each(['member', 'admin'] as const)('forbids a %s from starting a purchase', membershipRole => {
        const guard = new PermissionsGuard(new Reflector(), new RolePermissionPolicy())
        const context = {
            getHandler: () => controller.create,
            getClass: () => CreditPurchaseController,
            switchToHttp: () => ({ getRequest: () => ({ authPrincipal: principalWith({ membershipRole }) }) }),
        } as unknown as ExecutionContext

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException)
    })

    it('lists purchases using only the principal organization', async () => {
        const organizationPurchases = [{ id: 'purchase-1' }] as PurchaseRecord[]
        purchases.listForOrganization.mockResolvedValue(organizationPurchases)
        const principal = principalWith()

        await expect(controller.list(principal)).resolves.toBe(organizationPurchases)
        expect(purchases.listForOrganization).toHaveBeenCalledWith(principal.organizationId)
    })
})
