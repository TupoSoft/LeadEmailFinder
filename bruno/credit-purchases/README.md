# Credit Purchases Bruno Collection

This collection verifies the authenticated credit-pack checkout workflow against the local stub payment provider. It rejects an unauthenticated request, creates a purchase, rejects an unknown pack, and lists the created purchase with catalog-owned credits and price.

Start the local stack with `PAYMENTS_PROVIDER=stub`, obtain an access token whose application principal belongs to the target organization and has `billing:read` plus `billing:manage`, and expose it only through the process environment:

```shell
export OWNER_ACCESS_TOKEN=replace-with-a-short-lived-token
cd bruno/credit-purchases
bru run --env local
```

The checked-in local Compose catalog defines the `starter` pack as 100 credits for 500 USD minor units. Override `packId`, `expectedCredits`, `expectedAmountMinor`, and `expectedCurrency` when running against a different disposable catalog. Never commit an access token or provider secret.
