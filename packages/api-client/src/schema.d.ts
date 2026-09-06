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
         * @description Consumes one pending Authorization Code with PKCE response. Success returns to the application; recoverable failures return to the same-origin error route with a stable safe code.
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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AuthenticationRequiredResponseDto: {
            /** @enum {string} */
            code: "authentication_required";
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
            /** @description Redirects to the application after success, or to /auth/error with code login_state_invalid, authorization_code_exchange_failed, or active_membership_required. */
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
            query?: never;
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
                    /** @description Sets the transient HttpOnly lef_login_state cookie. */
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
}
