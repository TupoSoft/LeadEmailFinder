/**
 * Generated file. Do not edit.
 * Regenerate: corepack pnpm openapi:generate
 */

export interface paths {
    "/credits/{organizationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the authoritative organization credit balance
         * @description Requires platform:admin. Returns zero when no credit account exists; this does not prove organization existence.
         */
        get: operations["CreditsController_getBalance"];
        /**
         * Set an absolute organization credit balance
         * @description Requires platform:admin. Replaces the balance with the requested value. Cookie sessions require Origin and CSRF protection. Reload after uncertainty before another explicit set.
         */
        put: operations["CreditsController_setBalance"];
        /**
         * Add platform credits idempotently
         * @description Requires platform:admin. Cookie sessions require Origin and CSRF protection. Reuse one key for the same organization and amount to return the current balance without another grant. Reusing that key with a different amount returns 409 without changing the balance. Both the first successful request and an equivalent replay return 201.
         */
        post: operations["CreditsController_addCredits"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
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
    "/v1/organizations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List customer organizations for a platform operator
         * @description Requires platform:admin. Orders by millisecond creation time descending and UUID descending. Pass the returned opaque token unchanged; the terminal page omits nextPageToken. No total is calculated.
         */
        get: operations["OrganizationsController_list"];
        put?: never;
        /**
         * Create a customer organization and its first owner invitation
         * @description Requires platform:admin. Returns the first owner invitation token once, with no email delivery or token recovery. Never persist or log the response. Creation is not idempotent; reconcile an uncertain outcome before explicitly creating again. Cookie sessions require a valid Origin and CSRF header.
         */
        post: operations["OrganizationsController_create"];
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
    "/v1/organizations/{organizationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one organization for a platform operator
         * @description Requires platform:admin. Returns only the directory identity and timestamps; no membership or credit data.
         */
        get: operations["OrganizationsController_get"];
        put?: never;
        post?: never;
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
    "/v1/organizations/{organizationId}/service-clients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List active and disabled service clients without secrets
         * @description Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header. Returns all organization clients ordered by createdAt DESC, id DESC. Existing secrets cannot be retrieved.
         */
        get: operations["ServiceClientsController_list"];
        put?: never;
        /**
         * Create an organization service client and reveal its secret once
         * @description Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header. Requested permissions must be unique and within the current account grantableServiceClientPermissions.
         */
        post: operations["ServiceClientsController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/service-clients/{serviceClientId}": {
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
         * Delete a service client and its provider client
         * @description Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header. Deletes the provider client and local credential. An already-missing provider client is treated as success.
         */
        delete: operations["ServiceClientsController_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/service-clients/{serviceClientId}/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Disable a service client immediately
         * @description Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header. Revokes request authentication locally. Disabled clients remain listed. There is no re-enable endpoint.
         */
        post: operations["ServiceClientsController_disable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/organizations/{organizationId}/service-clients/{serviceClientId}/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Invalidate the current secret and reveal a replacement once
         * @description Requires credentials:manage and an owner or administrator human session. Service-client bearer tokens are rejected regardless of their permissions. Cookie mutations require a valid Origin and CSRF header. A missing client or a client in another organization returns the same 404. Do not automatically retry when the outcome is uncertain.
         */
        post: operations["ServiceClientsController_rotate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/proxies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List proxies
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header. Orders by ID. Pass the returned nextPageToken unchanged; an empty string ends the traversal. No total is provided.
         */
        get: operations["ProxyController_listProxies"];
        put?: never;
        /**
         * Create a proxy
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header. Defaults to disabled. Authentication is never returned. Reconcile the registry before explicitly retrying an uncertain create.
         */
        post: operations["ProxyController_createProxy"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/proxies/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get a proxy
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header.
         */
        get: operations["ProxyController_getProxy"];
        put?: never;
        post?: never;
        /**
         * Delete a proxy
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header.
         */
        delete: operations["ProxyController_deleteProxy"];
        options?: never;
        head?: never;
        /**
         * Update a proxy
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header. Updates only supplied fields. Omit auth to preserve stored authentication. A redacted read cannot resolve an uncertain authentication replacement; do not retry automatically.
         */
        patch: operations["ProxyController_updateProxy"];
        trace?: never;
    };
    "/v1/proxies/{id}/blacklists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Exclude a proxy for an MX host
         * @description Requires platform:admin. Cookie mutations require a valid Origin and CSRF header. Repeated identical reports converge. Read the proxy afterward to see its current blacklist array. Removal is unsupported.
         */
        post: operations["ProxyController_reportProxyBlacklist"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verifyAsync": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Admits one email for the authenticated organization through the durable admission stack. A fresh, uncached submission reserves one credit; a cached or shared result costs nothing. An optional canonical lowercase UUIDv7 Idempotency-Key header lets a caller safely retry an uncertain submission. Browser sessions require same-origin mutation protection. */
        post: operations["AsyncEmailVerificationController_verifyAsync"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verifyAsync/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Reads an organization-owned operation without debit or submission. Missing, expired, and foreign operations are concealed with the same 404 response. */
        get: operations["AsyncEmailVerificationController_getAsyncVerificationState"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verifyBatch/csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload a CSV batch for asynchronous verification */
        post: operations["BatchEmailVerificationController_uploadFile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verifyBatch/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read an organization-owned batch status */
        get: operations["BatchEmailVerificationController_getBatchStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/verifyBatch/{id}/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download an organization-owned completed batch CSV */
        get: operations["BatchEmailVerificationController_getBatchResults"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
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
        AddCreditsDto: {
            /** @description Number of credits to add for this logical operation */
            amount: number;
        };
        AsyncVerificationCompletedResponseDto: {
            /**
             * @description Optional in the public contract so existing clients written before this field existed keep building —
             *      a real settled response always includes it.
             */
            operation?: components["schemas"]["VerificationOperationMetadataDto"];
            result: components["schemas"]["AsyncVerificationResultDto"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "completed";
        };
        AsyncVerificationFailedResponseDto: {
            /** @enum {string} */
            failureCode: "verification_failed";
            /**
             * @description Optional in the public contract so existing clients written before this field existed keep building —
             *      a real settled response always includes it.
             */
            operation?: components["schemas"]["VerificationOperationMetadataDto"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "failed";
        };
        AsyncVerificationQueuedResponseDto: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "queued";
        };
        AsyncVerificationResultDto: {
            /** @example null */
            catchAll: boolean | null;
            /** @example lef.test */
            domain: string;
            /**
             * Format: email
             * @example person@lef.test
             */
            email: string;
            /** @example true */
            exists: boolean | null;
            /** @enum {string} */
            format?: "{first}" | "{last}" | "{first}.{last}" | "{f}{last}" | "{f}.{last}" | "{first}{last}" | "{first}{l}" | "{first}.{l}" | "{last}.{first}" | "{first}_{last}" | "{last}{f}" | "{f}{l}" | "{l}{first}" | "{l}.{first}" | "{last}{first}" | "{first}-{last}";
            /**
             * Format: uuid
             * @example 00000000-0000-4000-8000-000000000002
             */
            id: string;
            /** @example person */
            localPart: string;
            /** @example lef.test */
            mxDomain?: string;
            /**
             * @example accepted_email
             * @enum {string}
             */
            reason: "accepted_email" | "rejected_email" | "timeout" | "temporarily_blocked" | "no_mx_records" | "unexpected_error" | "blacklisted" | "no_connect" | "exceeded_storage" | "sender_blocked" | "secure_transport_unavailable" | "webmail" | "unknown";
            /**
             * @example [
             *       "mx"
             *     ]
             */
            sources: ("mx" | "microsoft_1" | "microsoft_2" | "microsoft_4" | "mimecast" | "linkedin")[];
            /** @example mx.lef.test */
            targetExchange?: string;
        };
        AsyncVerificationRunningResponseDto: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "running";
        };
        AsyncVerificationUnavailableResponseDto: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            state: "unavailable";
        };
        AuthenticationRequiredResponseDto: {
            /** @enum {string} */
            code: "authentication_required";
        };
        BatchStatusAddressCountsDto: {
            cachedAddresses: number;
            completedAddresses: number;
            conclusiveAddresses: number;
            cooldownAddresses: number;
            duplicateRows: number;
            failedAddresses: number;
            inconclusiveAddresses: number;
            sharedAddresses: number;
            totalRows: number;
            uniqueAddresses: number;
        };
        BatchStatusBillingDto: {
            charged: number;
            reserved: number;
            /** @enum {string} */
            state: "pending" | "settled";
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
        BillingSummaryResponseDto: {
            /** @description Credits usable for new spending: balance minus reserved */
            available: number;
            /** @description Total credits owned by the organization */
            balance: number;
            /** @description Credits held by accepted operations, not yet charged */
            reserved: number;
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
        CreateOrganizationDto: {
            name: string;
            /** Format: email */
            ownerEmail: string;
        };
        CreateOrganizationResponseDto: {
            invitation: components["schemas"]["InvitationResponseDto"];
            /** Format: uuid */
            organizationId: string;
        };
        CreateProxyDto: {
            /** @description Optional complete username/password pair. Never returned. */
            auth?: components["schemas"]["ProxyAuthDto"];
            description?: string;
            host: string;
            /** @default 1 */
            maxConcurrent: number;
            port: number;
            /**
             * @description 1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.
             * @enum {number}
             */
            protocol: 1 | 2 | 3 | 4;
            /** @default 10 */
            requestsPerMinute: number;
            /**
             * @default disabled
             * @enum {string}
             */
            state: "active" | "draining" | "disabled";
            /** @default 1 */
            weight: number;
        };
        CreateServiceClientDto: {
            description?: string;
            /** @description Choose only from the current account grantableServiceClientPermissions; the server enforces that ceiling. */
            permissions: ("verification:run" | "verification:read" | "members:manage" | "credentials:manage" | "billing:read" | "billing:manage" | "platform:admin")[];
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
        GetBatchStatusResponseDto: {
            billing: components["schemas"]["BatchStatusBillingDto"];
            counts: components["schemas"]["BatchStatusAddressCountsDto"];
            /**
             * @description Present only for failed jobs. processing_failed makes no claim about whether credits were charged.
             * @enum {string}
             */
            failureCode?: "invalid_csv" | "insufficient_credits" | "processing_failed";
            /** Format: uuid */
            id: string;
            processed: number;
            progress: number;
            /** @description True once settled row accounting is downloadable, including a terminal failure past validation whose output publication kept failing. */
            resultsAvailable: boolean;
            /** @enum {string} */
            status: "queued" | "running" | "completed" | "failed" | "unavailable";
            total: number;
            unprocessed: number;
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
        OrganizationDirectoryEntryDto: {
            /** Format: date-time */
            createdAt: string;
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: date-time */
            updatedAt: string;
        };
        OrganizationDirectoryResponseDto: {
            /** @description Present only when another page exists. No total is calculated. */
            nextPageToken?: string;
            organizations: components["schemas"]["OrganizationDirectoryEntryDto"][];
        };
        ProxyAuthDto: {
            /** @description Proxy authentication password. Never returned. */
            pass: string;
            /** @description Proxy authentication username. Never returned. */
            user: string;
        };
        ProxyDto: {
            /** @description MX hosts reported as blacklisting this proxy. Repeated reports are deduplicated. */
            blacklists: string[];
            /** Format: date-time */
            createdAt: string;
            description?: string;
            host: string;
            /** Format: uuid */
            id: string;
            maxConcurrent: number;
            port: number;
            /**
             * @description 1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.
             * @enum {number}
             */
            protocol: 1 | 2 | 3 | 4;
            /** @description Maximum allocation requests per minute. */
            requestsPerMinute: number;
            /**
             * @description Draining and disabled exclude new allocation; neither proves that active leases have ended.
             * @enum {string}
             */
            state: "active" | "draining" | "disabled";
            /** Format: date-time */
            updatedAt: string;
            weight: number;
        };
        ProxyListDto: {
            /** @description Pass this cursor unchanged as pageToken. An empty string means this traversal is complete; no total is provided. */
            nextPageToken: string;
            proxies: components["schemas"]["ProxyDto"][];
        };
        ReportBlacklistDto: {
            /** @description MX host to exclude for this proxy. Repeating the same value does not duplicate it. */
            mxHost: string;
        };
        ServiceClientResponseDto: {
            clientId: string;
            /** Format: date-time */
            createdAt: string;
            description: string | null;
            /** Format: uuid */
            id: string;
            permissions: ("verification:run" | "verification:read" | "members:manage" | "credentials:manage" | "billing:read" | "billing:manage" | "platform:admin")[];
            /** @enum {string} */
            status: "active" | "disabled";
            /** Format: date-time */
            updatedAt: string;
        };
        ServiceClientSecretResponseDto: {
            clientId: string;
            /** @description Returned only by this create or rotate response. Cannot be retrieved later. */
            clientSecret: string;
            /** Format: date-time */
            createdAt: string;
            description: string | null;
            /** Format: uuid */
            id: string;
            permissions: ("verification:run" | "verification:read" | "members:manage" | "credentials:manage" | "billing:read" | "billing:manage" | "platform:admin")[];
            /** @enum {string} */
            status: "active" | "disabled";
            /** Format: date-time */
            updatedAt: string;
        };
        SetBalanceDto: {
            /** @description Absolute credit balance */
            amount: number;
        };
        UpdateProxyDto: {
            /** @description Complete replacement username/password pair. Omission preserves stored authentication; clearing is unsupported. */
            auth?: components["schemas"]["ProxyAuthDto"];
            description?: string;
            host?: string;
            maxConcurrent?: number;
            port?: number;
            /**
             * @description 1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.
             * @enum {number}
             */
            protocol?: 1 | 2 | 3 | 4;
            requestsPerMinute?: number;
            /** @enum {string} */
            state?: "active" | "draining" | "disabled";
            weight?: number;
        };
        UploadFileRequestDto: {
            /**
             * Format: binary
             * @description CSV file with an email header, media type text/csv, at most 104857600 bytes (100 megabytes).
             */
            file: Blob;
        };
        UploadFileResponseDto: {
            /** Format: uuid */
            id: string;
        };
        VerificationOperationBillingDto: {
            /** @enum {number} */
            charged: 0 | 1;
            /** @enum {string} */
            reason?: "conclusive" | "cached" | "shared" | "inconclusive" | "failed";
            /** @enum {number} */
            reserved: 0 | 1;
            /** @enum {string} */
            state: "pending" | "settled";
        };
        VerificationOperationMetadataDto: {
            billing: components["schemas"]["VerificationOperationBillingDto"];
            /** Format: date-time */
            cacheExpiresAt: string | null;
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            observedAt: string | null;
            /** @enum {string} */
            source: "fresh" | "cache" | "shared";
        };
        VerifyAsyncRequestBodyDto: {
            /**
             * Format: email
             * @example person@lef.test
             */
            email: string;
        };
        VerifyAsyncResponseDto: {
            /**
             * Format: uuid
             * @example 00000000-0000-4000-8000-000000000001
             */
            id: string;
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
    CreditsController_getBalance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Organization whose credit balance is managed */
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
                    "application/json": components["schemas"]["CreditResponseDto"];
                };
            };
            /** @description Invalid organization UUID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid authentication. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authenticated caller lacks platform:admin. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The balance could not be loaded. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CreditsController_setBalance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Organization whose credit balance is managed */
                organizationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetBalanceDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditResponseDto"];
                };
            };
            /** @description Invalid organization UUID or nonnegative integer amount. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid authentication. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authenticated caller lacks platform:admin or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The requested balance is below credits already reserved for accepted operations. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The outcome may be uncertain; reload the balance before another explicit set. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    CreditsController_addCredits: {
        parameters: {
            query?: never;
            header: {
                /** @description Exactly one canonical lowercase UUID per logical credit addition; reuse it only for retries. */
                "Idempotency-Key": string;
            };
            path: {
                /** @description Organization whose credit balance is managed */
                organizationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddCreditsDto"];
            };
        };
        responses: {
            /** @description Grant applied or equivalent replay; current balance. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditResponseDto"];
                };
            };
            /** @description Invalid organization, amount, or missing, repeated, or malformed key. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Missing or invalid authentication. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authenticated caller lacks platform:admin. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The organization and key already identify a grant with a different amount. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
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
                    "application/json": components["schemas"]["BillingSummaryResponseDto"];
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
    OrganizationsController_list: {
        parameters: {
            query?: {
                pageSize?: number;
                /** @description Opaque continuation token returned by the preceding page. Omit for the first page. */
                pageToken?: string;
            };
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
                    "application/json": components["schemas"]["OrganizationDirectoryResponseDto"];
                };
            };
            /** @description Page size must be an integer from 1 through 100; the page token must be a supported, valid cursor. */
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
            /** @description Platform administration permission is required. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    OrganizationsController_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrganizationDto"];
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
                    "application/json": components["schemas"]["CreateOrganizationResponseDto"];
                };
            };
            /** @description Organization name must contain 1 through 200 characters and ownerEmail must be valid. */
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
            /** @description Platform administration permission or browser CSRF check denied. */
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
            /** @description Creation outcome may be uncertain; reconcile before creating again. */
            500: {
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
    OrganizationsController_get: {
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
                    "application/json": components["schemas"]["OrganizationDirectoryEntryDto"];
                };
            };
            /** @description Invalid organization UUID. */
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
            /** @description Platform administration permission is required. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization not found. No organization details are returned. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization details could not be loaded. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
    ServiceClientsController_list: {
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
                    "application/json": components["schemas"]["ServiceClientResponseDto"][];
                };
            };
            /** @description Invalid organization UUID. */
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
            /** @description Organization, credential kind, permission, or role check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ServiceClientsController_create: {
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
                "application/json": components["schemas"]["CreateServiceClientDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceClientSecretResponseDto"];
                };
            };
            /** @description Invalid organization UUID, description, or permissions, including duplicate or excess grants. */
            400: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Organization, credential kind, permission, role, or browser CSRF check denied. */
            403: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider or persistence failure. Reconcile the list before explicitly retrying an uncertain outcome. */
            500: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ServiceClientsController_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
                serviceClientId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Service client deleted. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid organization or service-client UUID. */
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
            /** @description Credential kind, permission, role, or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Service client not found, including a client outside the caller organization. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider or persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ServiceClientsController_disable: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
                serviceClientId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Client disabled; repeated disablement has no additional effect. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Invalid organization or service-client UUID. */
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
            /** @description Credential kind, permission, role, or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Service client not found, including a client outside the caller organization. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ServiceClientsController_rotate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                organizationId: string;
                serviceClientId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            200: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceClientSecretResponseDto"];
                };
            };
            /** @description Invalid organization or service-client UUID. */
            400: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Credential kind, permission, role, or browser CSRF check denied. */
            403: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Service client not found, including a client outside the caller organization. */
            404: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The service client is disabled and cannot be rotated. */
            409: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Provider or persistence failure. The secret may already have changed; reconcile before explicitly retrying. */
            500: {
                headers: {
                    /** @description Prevents storage of all create and rotate responses, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_listProxies: {
        parameters: {
            query?: {
                pageSize?: number;
                /** @description The nonempty nextPageToken from the previous page. Omit for the first page. */
                pageToken?: string;
            };
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
                    "application/json": components["schemas"]["ProxyListDto"];
                };
            };
            /** @description Invalid page size or page token. */
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
            /** @description Permission denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_createProxy: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateProxyDto"];
            };
        };
        responses: {
            201: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProxyDto"];
                };
            };
            /** @description Invalid proxy fields or incomplete authentication. */
            400: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Permission or browser CSRF check denied. */
            403: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure; the create outcome may be uncertain. */
            500: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_getProxy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
                    "application/json": components["schemas"]["ProxyDto"];
                };
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Permission denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proxy not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_deleteProxy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
                    "application/json": components["schemas"]["ProxyDto"];
                };
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Permission or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proxy not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_updateProxy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateProxyDto"];
            };
        };
        responses: {
            200: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProxyDto"];
                };
            };
            /** @description Empty update or invalid proxy fields, including incomplete authentication. */
            400: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication required. */
            401: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Permission or browser CSRF check denied. */
            403: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proxy not found. */
            404: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure; authentication may already have changed. */
            500: {
                headers: {
                    /** @description Prevents storage of every create and update response, including failures. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProxyController_reportProxyBlacklist: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReportBlacklistDto"];
            };
        };
        responses: {
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description An MX host is required. */
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
            /** @description Permission or browser CSRF check denied. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proxy not found. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Persistence failure. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AsyncEmailVerificationController_verifyAsync: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["VerifyAsyncRequestBodyDto"];
            };
        };
        responses: {
            /** @description The operation was admitted. Use its ID to read status. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VerifyAsyncResponseDto"];
                };
            };
            /** @description The email is missing/invalid, or the Idempotency-Key header is malformed or repeated. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error?: string;
                        message: string;
                        /** @enum {integer} */
                        statusCode: 400;
                    };
                };
            };
            /** @description Authentication is required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        code: "authentication_required";
                    };
                };
            };
            /** @description The organization has insufficient credits; no execution was funded. */
            402: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        message: "insufficient_credits";
                        /** @enum {integer} */
                        statusCode: 402;
                    };
                };
            };
            /** @description The required verification permission or browser mutation protection is missing. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error?: string;
                        message?: string;
                        /** @example 403 */
                        statusCode?: number;
                    };
                };
            };
            /** @description The supplied Idempotency-Key was already used for a different address or delivery mode. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message?: string;
                        /** @enum {integer} */
                        statusCode?: 409;
                    };
                };
            };
            /** @description The supplied Idempotency-Key is more than 24 hours old. */
            410: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message?: string;
                        /** @enum {integer} */
                        statusCode?: 410;
                    };
                };
            };
            /** @description The organization submission rate limit, or a per-address terminal-inconclusive cooldown, was exceeded. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        message?: string;
                        /** @enum {integer} */
                        statusCode?: 429;
                    };
                };
            };
        };
    };
    AsyncEmailVerificationController_getAsyncVerificationState: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A sanitized operation status. Unavailable means a trustworthy outcome cannot be reported. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AsyncVerificationQueuedResponseDto"] | components["schemas"]["AsyncVerificationRunningResponseDto"] | components["schemas"]["AsyncVerificationCompletedResponseDto"] | components["schemas"]["AsyncVerificationFailedResponseDto"] | components["schemas"]["AsyncVerificationUnavailableResponseDto"];
                };
            };
            /** @description The operation ID is not a UUID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error?: string;
                        message: string[];
                        /** @enum {integer} */
                        statusCode: 400;
                    };
                };
            };
            /** @description Authentication is required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        code: "authentication_required";
                    };
                };
            };
            /** @description The required verification permission or browser mutation protection is missing. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error?: string;
                        message?: string;
                        /** @example 403 */
                        statusCode?: number;
                    };
                };
            };
            /** @description No accessible operation matches the ID. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error?: string;
                        message: string;
                        /** @enum {integer} */
                        statusCode: 404;
                    };
                };
            };
        };
    };
    BatchEmailVerificationController_uploadFile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description One file part containing text/csv with an email header. Maximum size: 104857600 bytes (100 megabytes). Row validation and credit debit happen after acceptance. */
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["UploadFileRequestDto"];
            };
        };
        responses: {
            /** @description The batch was queued; validation and charging are not yet confirmed. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UploadFileResponseDto"];
                };
            };
            /** @description Authentication is required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The required verification permission or browser mutation protection is missing. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description A CSV file is required, with media type text/csv and a maximum size of 104857600 bytes. */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    BatchEmailVerificationController_getBatchStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
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
                    "application/json": components["schemas"]["GetBatchStatusResponseDto"];
                };
            };
            /** @description The batch ID must be a UUID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication is required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The required verification permission or browser mutation protection is missing. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The batch is not available to this organization. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    BatchEmailVerificationController_getBatchResults: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The retained CSV result. Downloading does not enqueue verification or debit credits. */
            200: {
                headers: {
                    /** @description attachment; filename="batch-verification-<uuid>.csv" */
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": Blob;
                };
            };
            /** @description The batch ID must be a UUID. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Authentication is required. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The required verification permission or browser mutation protection is missing. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The batch result is not available to this organization. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
