/**
 * Generated file. Do not edit.
 * Regenerate: corepack pnpm openapi:generate
 */

export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read API and PostgreSQL health */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Complete browser authorization
         * @description Consumes one pending Authorization Code with PKCE response. Success returns to the validated pending /app destination; recoverable failures return to the same-origin error route with a stable safe code.
         */
        get: operations["completeBrowserAuthorization"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Start browser authorization */
        get: operations["loginBrowserSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * End the browser session
         * @description Revokes the session and clears its cookies. Cookie-authenticated requests require a matching application Origin (or Referer) and the decoded lef_csrf_token cookie value in x-csrf-token.
         */
        post: operations["logoutBrowserSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the current browser account
         * @description Returns browser-safe identity, membership, organization, capability, and service-client grant data for an authenticated human session.
         */
        get: operations["getCurrentAccount"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/credit-packs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingCreditPacksController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["BillingSummaryController_getSummary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/credit-purchases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["CreditPurchaseController_list"];
        put?: never;
        /** @description Starts a purchase for the authenticated organization. Browser sessions require a matching application Origin (or Referer) and the decoded lef_csrf_token cookie in x-csrf-token. OIDC bearer credentials are also supported. */
        post: operations["CreditPurchaseController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/invitations/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Preview a pending invitation
         * @description Returns display details only while the link retains acceptance authority. Responses are never cacheable.
         */
        get: operations["OrganizationsController_previewInvitation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/invitations/{token}/accept": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Accept a pending invitation
         * @description Creates or reuses an invited identity. Repeated acceptance has no additional effect and returns only generic accepted status.
         */
        post: operations["OrganizationsController_acceptInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/invitations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Issue an organization invitation
         * @description Requires members:manage. Only owners can invite another owner. The token is returned once; there is no email delivery or token recovery. Cookie sessions require a valid Origin and CSRF header.
         */
        post: operations["OrganizationsController_issueInvitation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/members": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List active and disabled organization members
         * @description Requires members:manage. Results retain actual membership status and nullable email, ordered by createdAt ASC, id ASC.
         */
        get: operations["OrganizationsController_listMembers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/members/{membershipId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Disable an organization membership
         * @description Requires members:manage. Administrators cannot remove owners. Already disabled memberships are an idempotent no-op. Cookie sessions require a valid Origin and CSRF header.
         */
        delete: operations["OrganizationsController_removeMember"];
        options?: never;
        head?: never;
        /**
         * Change an active member role
         * @description Requires members:manage. Administrators cannot grant or modify owner roles. Cookie sessions require a valid Origin and CSRF header.
         */
        patch: operations["OrganizationsController_changeRole"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AcceptInvitationDto: {
            /** @description New-account password; minimum 12 characters. */
            password: string;
        };
        AcceptInvitationResponseDto: {
            /** Format: email */
            email: string;
            organizationId: string;
            /** @enum {string} */
            role: "owner" | "admin" | "member";
        };
        AuthenticationRequiredResponseDto: {
            /** @enum {string} */
            code: "authentication_required";
        };
        BillingCreditPackResponseDto: {
            /** @description Price in the currency minor unit */
            amountMinor: number;
            /** @description Credits granted after confirmed payment */
            credits: number;
            /** @description ISO 4217 currency code */
            currency: string;
            /** @description Server-defined credit pack identifier */
            id: string;
        };
        ChangeMembershipRoleDto: {
            /** @enum {string} */
            role: "owner" | "admin" | "member";
        };
        CreateCreditPurchaseDto: {
            /** @description Identifier from the current credit pack catalog */
            packId: string;
        };
        CreateCreditPurchaseResponseDto: {
            /** Format: uuid */
            id: string;
            /**
             * Format: uri
             * @description Validated hosted checkout URL
             */
            redirectUrl: string;
            /** @enum {string} */
            status: "pending" | "paid" | "failed" | "expired";
        };
        CreditPurchaseResponseDto: {
            /** @description Price in the currency minor unit */
            amountMinor: number;
            /** Format: date-time */
            createdAt: string;
            credits: number;
            currency: string;
            /** Format: uuid */
            id: string;
            packId: string;
            /** @enum {string} */
            status: "pending" | "paid" | "failed" | "expired";
            /** Format: date-time */
            updatedAt: string;
        };
        CreditResponseDto: {
            /** @description Current authoritative organization credit balance */
            balance: number;
        };
        CurrentAccountContextDto: {
            /** @description Presentation-only browser capabilities. */
            capabilities: ("verification.run" | "verification.read" | "team.manage" | "service_clients.manage" | "billing.read" | "billing.manage" | "platform.organizations.manage" | "platform.credits.manage" | "platform.proxies.manage")[];
            /**
             * Format: email
             * @description Current external-identity email, or null when the provider has no email.
             * @example owner@example.test
             */
            email: string | null;
            /** @description Ordered permissions this human account may grant to a service client. */
            grantableServiceClientPermissions: ("verification:run" | "verification:read" | "members:manage" | "credentials:manage" | "billing:read" | "billing:manage")[];
            membership: components["schemas"]["CurrentAccountMembershipDto"];
            organization: components["schemas"]["CurrentAccountOrganizationDto"];
        };
        CurrentAccountMembershipDto: {
            /**
             * Format: uuid
             * @description Active organization membership identifier.
             */
            id: string;
            /**
             * @description Role of the active organization membership.
             * @enum {string}
             */
            role: "platform_admin" | "owner" | "admin" | "member";
        };
        CurrentAccountOrganizationDto: {
            /**
             * Format: uuid
             * @description Active organization identifier.
             */
            id: string;
            /** @description Display name of the active organization. */
            name: string;
        };
        HumanSessionRequiredResponseDto: {
            /** @enum {string} */
            code: "human_session_required";
        };
        InvitationAcceptedResponseDto: {
            /** @enum {string} */
            status: "accepted";
        };
        InvitationGoneResponseDto: {
            /** @enum {string} */
            code: "invitation_expired" | "invitation_consumed";
            /** @description Generic reason without invitation or membership details. */
            message: string;
            /** @enum {number} */
            statusCode: 410;
        };
        InvitationPreviewResponseDto: {
            /** Format: email */
            email: string;
            /** Format: date-time */
            expiresAt: string;
            organizationName: string;
            /** @enum {string} */
            role: "owner" | "admin" | "member";
            /** @enum {string} */
            status: "pending";
        };
        InvitationResponseDto: {
            /** Format: email */
            email: string;
            /** Format: date-time */
            expiresAt: string;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "owner" | "admin" | "member";
            /** @description One-time secret. Keep only in ephemeral memory; never log or persist it. */
            token: string;
        };
        IssueInvitationDto: {
            /** Format: email */
            email: string;
            /** @enum {string} */
            role: "owner" | "admin" | "member";
        };
        MembershipResponseDto: {
            /** Format: email */
            email: string | null;
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            role: "owner" | "admin" | "member";
            /** @enum {string} */
            status: "active" | "disabled";
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The API and its PostgreSQL dependency are healthy. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details: {
                            postgres: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        error?: {
                            postgres?: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        info?: {
                            postgres?: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        /** @enum {string} */
                        status: "ok" | "error" | "shutting_down";
                    };
                };
            };
            /** @description PostgreSQL is unavailable or the API is shutting down. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details: {
                            postgres: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        error?: {
                            postgres?: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        info?: {
                            postgres?: {
                                /** @enum {string} */
                                status: "up" | "down";
                            } & {
                                [key: string]: unknown;
                            };
                        };
                        /** @enum {string} */
                        status: "ok" | "error" | "shutting_down";
                    };
                };
            };
        };
    };
    completeBrowserAuthorization: {
        parameters: {
            query?: {
                /** @description One-time login state. Missing, blank, repeated, expired, or mismatched values fail safely. */
                state?: string;
                /** @description Provider authorization code. Missing, blank, or repeated values follow the safe redirect policy. */
                code?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirects to the validated pending /app destination after success, or to /auth/error with code login_state_invalid, authorization_code_exchange_failed, or active_membership_required. */
            302: {
                headers: {
                    /** @description Prevents storage of the authorization response. */
                    "Cache-Control"?: "no-store";
                    /** @description Same-origin application or stable callback-error URL. */
                    Location?: string;
                    /** @description Prevents callback parameters from being sent as referrer data. */
                    "Referrer-Policy"?: "no-referrer";
                    /** @description Expires the transient login-state cookie. A successful callback also sets the session and CSRF cookies. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description An unexpected provider, infrastructure, or application failure occurred without exposing detail. */
            500: {
                headers: {
                    /** @description Prevents storage of the authorization response. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents callback parameters from being sent as referrer data. */
                    "Referrer-Policy"?: "no-referrer";
                    /** @description Expires the transient login-state cookie. A successful callback also sets the session and CSRF cookies. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The provider ID token failed integrity or claim validation. The response contains no provider detail. */
            502: {
                headers: {
                    /** @description Prevents storage of the authorization response. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents callback parameters from being sent as referrer data. */
                    "Referrer-Policy"?: "no-referrer";
                    /** @description Expires the transient login-state cookie. A successful callback also sets the session and CSRF cookies. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    loginBrowserSession: {
        parameters: {
            query?: {
                /** @description Relative application destination under /app. Unsafe, malformed, public, or recovery paths fall back to /app. */
                destination?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Redirects to the public Keycloak authorization endpoint with a PKCE S256 challenge. */
            302: {
                headers: {
                    /** @description Provider authorization URL. */
                    Location?: string;
                    /** @description Sets the transient HttpOnly lef_login_state cookie and clears unusable session and CSRF cookies. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    logoutBrowserSession: {
        parameters: {
            query?: never;
            header?: {
                /** @description Fallback URL for checking the application origin when Origin is absent. */
                Referer?: string;
                /** @description Must match the application origin. A same-origin Referer is accepted when Origin is absent. */
                Origin?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The session is revoked; the lef_session and lef_csrf_token cookies are cleared. */
            204: {
                headers: {
                    /** @description Expires the session and CSRF cookies. */
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication is missing, invalid, or expired. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthenticationRequiredResponseDto"];
                };
            };
            /** @description The cookie-authenticated request has a missing or invalid Origin, Referer, or CSRF token. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        error: "Forbidden";
                        /** @enum {string} */
                        message: "Request origin is not allowed" | "CSRF token is missing or invalid";
                        /** @enum {integer} */
                        statusCode: 403;
                    };
                };
            };
        };
    };
    getCurrentAccount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current browser account context. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CurrentAccountContextDto"];
                };
            };
            /** @description Authentication is missing, invalid, expired, or no longer maps to a usable account. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthenticationRequiredResponseDto"];
                };
            };
            /** @description The authenticated credential is a service client rather than a human session. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HumanSessionRequiredResponseDto"];
                };
            };
        };
    };
    BillingCreditPacksController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingCreditPackResponseDto"][];
                };
            };
            /** @description Authentication is required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Billing read permission is required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    BillingSummaryController_getSummary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditResponseDto"];
                };
            };
            /** @description Authentication is required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Billing read permission is required */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CreditPurchaseController_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditPurchaseResponseDto"][];
                };
            };
            /** @description Authentication is required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The required billing permission is missing */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CreditPurchaseController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Fallback URL for checking the application origin on cookie-authenticated requests. */
                Referer?: string;
                /** @description Cookie-authenticated requests must match the application origin. A same-origin Referer is accepted when Origin is absent. */
                Origin?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateCreditPurchaseDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateCreditPurchaseResponseDto"];
                };
            };
            /** @description The selected credit pack is unavailable or the request is invalid */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication is required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The required billing permission is missing */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Checkout could not be created safely */
            502: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizationsController_previewInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description One-time secret. Keep only in ephemeral memory; never log or persist it. */
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationPreviewResponseDto"];
                };
            };
            /** @description Invitation not found. No invitation details are returned. */
            404: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invitation has expired or was consumed; no invitation details are returned. */
            410: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationGoneResponseDto"];
                };
            };
        };
    };
    OrganizationsController_acceptInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description One-time secret. Keep only in ephemeral memory; never log or persist it. */
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcceptInvitationDto"];
            };
        };
        responses: {
            /** @description First acceptance returns account details; replay returns only accepted status. */
            201: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcceptInvitationResponseDto"] | components["schemas"]["InvitationAcceptedResponseDto"];
                };
            };
            /** @description Password must contain at least 12 characters. */
            400: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invitation not found. No invitation details are returned. */
            404: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The identity already has an active membership. */
            409: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invitation has expired. */
            410: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationGoneResponseDto"];
                };
            };
        };
    };
    OrganizationsController_issueInvitation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["IssueInvitationDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvitationResponseDto"];
                };
            };
            /** @description Invalid organization ID, email, or membership role. */
            400: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization, permission, role hierarchy, or browser CSRF check denied. */
            403: {
                headers: {
                    /** @description Prevents storage of invitation responses, including failures. */
                    "Cache-Control"?: "no-store";
                    /** @description Prevents disclosure of invitation authority in referrers. */
                    "Referrer-Policy"?: "no-referrer";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizationsController_listMembers: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipResponseDto"][];
                };
            };
            /** @description Invalid organization ID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Principal lacks members:manage or belongs to another organization. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizationsController_removeMember: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The membership is disabled; it remains visible in the member list. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid organization or membership ID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization, permission, owner hierarchy, or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Membership not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The final active owner cannot be removed. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizationsController_changeRole: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
                membershipId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChangeMembershipRoleDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MembershipResponseDto"];
                };
            };
            /** @description Invalid ID or membership role. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization, permission, owner hierarchy, or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Membership not found or disabled. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The final active owner cannot be demoted. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
