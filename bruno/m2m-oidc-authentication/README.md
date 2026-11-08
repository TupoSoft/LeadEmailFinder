# Machine Authentication Collection

This legacy path remains compatible. M2M means machine-to-machine; OIDC (OpenID Connect) is an identity protocol.
Current machine authentication uses API keys sent as `Authorization: Bearer <key>` instead of OIDC tokens.

The Bruno API-request collection checks public health and rejects missing or legacy JWT (JSON Web Token)
credentials. Configure test credentials through the collection environment.
