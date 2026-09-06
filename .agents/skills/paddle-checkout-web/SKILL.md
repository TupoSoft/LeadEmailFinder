---
name: paddle-checkout-web
description: Maintain LeadEmailFinder's existing hosted Paddle checkout and docker/paddle-dev payment-link fixture. Apply `Paddle.js` guidance to that fixture; the product UI uses server-created redirect URLs.
---

# Maintain Hosted Paddle Credit-Pack Checkout

> Adapted for LeadEmailFinder on 2026-09-06 from Paddle's installed `paddle` plugin, version `0.1.0`.
> Changes: repository scope, discovery description, cross-skill references, and English prose corrections. Upstream examples are retained as
> conditional references. Copyright 2026 Paddle.com Market Limited. Licensed under [Apache-2.0](LICENSE).
> Source: [Paddle skill sources](https://github.com/PaddleHQ/paddle-agent-skills).

## Repository Scope

This copy applies to LeadEmailFinder. The repository uses React with Vite, NestJS, and TypeORM with PostgreSQL.
The upstream recipes below are conditional technical references. Apply their Paddle concepts through the existing
repository architecture; their `Next.js` routes, Server Actions, Supabase examples, and `NEXT_PUBLIC_*` variables
are not implementation instructions for this project.

Before changing a business module, read [the module workflow](../../../src/libs/modules/AGENTS.md),
[the canonical architecture guide](../../../src/libs/modules/README.md), and
[the payments module contract](../../../src/libs/modules/payments/README.md).
Keep the Paddle SDK behind the existing payments infrastructure adapter. Use the repository configuration names
`PADDLE_ENVIRONMENT`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and `PAYMENTS_CHECKOUT_URL`.
The current adapter supports sandbox only. References to live accounts or subscriptions below describe upstream
capabilities and do not extend the requested task or the current credit-pack workflow.
Copying this skill does not configure authenticated MCP access; use available tools or the documented SDK fallback.

Use `Paddle.js` examples only when working on the existing payment-link fixture under
[the Docker payment fixture](../../../docker/paddle-dev/README.md). The product frontend follows
[the billing plan](../../plans/frontend/10-purchase-and-monitor-credits.md): send only `{ packId }` to
`POST /v1/credit-purchases`, then navigate to the validated `redirectUrl` after a confirmed response.
Keep provider price identifiers server-side. Read purchase status and balance from the authenticated API;
The checkout callbacks and return parameters do not grant credits or confirm payment. Preserve the plan's hosted
checkout boundary, including its exclusion of embedded `Paddle.js`, subscriptions, and automatic purchase retries.

## Upstream Reference

Read the following examples only for Paddle details relevant to the current task and the repository scope above.

# Build a Paddle Checkout In `Next.js`

## When to Use This Skill

Use this skill when adding a hosted Paddle checkout to a `Next.js` (App Router) app, either as an overlay (modal-style) or inline (embedded within your page). It covers initialization, opening checkout with line items, listening to events, customer pre-fill, the redirect after checkout, and the throttled `updateItems` pattern for cart-like UIs.

This skill is client-side only. Pair it with:

- [Paddle webhook guide](../paddle-webhooks/SKILL.md) to receive `transaction.completed` / `subscription.created` events on your server.
- Subscription synchronization is an optional upstream extension and is not part of this repository workflow.
- [Paddle sandbox testing guide](../paddle-sandbox-testing/SKILL.md) to test the integration end-to-end in the Paddle sandbox.

## Prerequisites

You need:

- A Paddle account, with the **sandbox** environment active during development.
  - Sign up for sandbox: https://sandbox-vendors.paddle.com/
  - Sign up for live: https://vendors.paddle.com/
- At least one product and price set up. Use [Paddle catalog guide](../paddle-catalog-setup/SKILL.md) if you haven't yet — note the price ID (looks like `pri_01h...`) for use below.
- Your domain approved for checkout under **Paddle > Checkout > Website approval**. Domains are approved automatically in sandbox.
- Your default payment link set under **`Paddle > Checkout > Checkout settings > Default payment link`**. You can use `https://localhost/` for sandbox, then change later.
- Two environment variables from **Paddle > Developer tools > Authentication**:

```bash
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_...   # client-side token, safe to expose
NEXT_PUBLIC_PADDLE_ENV=sandbox             # or "production"
```

If a Paddle MCP server is available to you, call `client.clientTokens.create({ name: "Frontend dev token" })` inside an `execute` to provision the token programmatically rather than asking the user to copy it from the dashboard. Note `clientTokens` is camel case.

> The Paddle MCP exposes three tools per server (`search`, `execute`, `report_missing_tool`). Workflow: call `search` to confirm the exact method name and parameter shapes, then call `execute` with an async function that calls `client.<resource>.<operation>(...)`. **Method paths are camel case** (`client.clientTokens.create`, `client.pricingPreview.preview`). **Body parameters and response fields are snake_case** (`tax_category`, `product_id`, `unit_price`, `currency_code`). Pagination is `{ pagination: { hasMore }, data: [...] }` with `{ after: "<last_id>" }` — not `.next()` / `.hasMore`. Chain multistep workflows inside one `execute`; variables don't persist between calls. Hard caps: 50 API calls per execute, 30-second timeout, 32 kilobytes of code.

Install the client library:

```bash
npm install @paddle/paddle-js
```

The Node SDK (`@paddle/paddle-node-sdk`) is for server-side work — you do not need it for checkout.

## Choose Your Checkout Style

| Style       | When to use                                                          | What the user sees                                  |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| **Overlay** | Fastest to integrate. Opens over the current page.                   | Modal-style window that covers your page            |
| **Inline**  | When you want full control over the surrounding layout and branding. | The checkout fields render inside a `<div>` you control |

Both use the same `Paddle.Checkout.open()` call — the only difference is the `displayMode` setting and where it renders. Default to **overlay** unless you need branded inline. Overlay works without any layout changes; inline requires a target element.

## Choose Your Checkout Variant

| Variant        | Description                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| **One-page**   | A single-page checkout experience with all fields (customer and payment details) on the same screen.       |
| **Multipage** | A two-page checkout: customer details are collected on the first page, payment details on the second page. |

Multipage is the default. One-page is recommended for most use cases.

## Overlay Checkout — the Minimum Viable Integration

This is the fastest path: a button that opens the checkout for one price. Recommended.

```tsx
// app/buy/page.tsx
"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";

export default function BuyPage() {
  const [paddle, setPaddle] = useState<Paddle | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || !process.env.NEXT_PUBLIC_PADDLE_ENV) {
      return;
    }
    initializePaddle({
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV as "sandbox" | "production",
    }).then((p) => p && setPaddle(p));
  }, []);

  function openCheckout() {
    paddle?.Checkout.open({
      items: [{ priceId: "pri_01h...", quantity: 1 }],
      settings: {
        variant: "one-page", // or "multi-page"
      },
    });
  }

  return (
    <button onClick={openCheckout} disabled={!paddle}>
      Buy now
    </button>
  );
}
```

That's it for overlay — no `displayMode` setting needed (overlay is the default). The user is shown the modal, completes payment, and Paddle handles the success page.

## Inline Checkout with Full Event Handling

Inline checkout is what you want when you need to render checkout next to other UI (e.g. a price summary, branded layout, custom success state). The full pattern:

```tsx
// app/checkout/[priceId]/checkout-contents.tsx
"use client";

import { type Environments, initializePaddle, type Paddle } from "@paddle/paddle-js";
import type { CheckoutEventsData } from "@paddle/paddle-js/types/checkout/events";
import throttle from "lodash.throttle";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Props {
  userEmail?: string;
}

export function CheckoutContents({ userEmail }: Props) {
  const { priceId } = useParams<{ priceId: string }>();
  const [quantity, setQuantity] = useState(1);
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [checkoutData, setCheckoutData] = useState<CheckoutEventsData | null>(null);

  // Throttle updateItems to avoid hammering Paddle on rapid quantity changes.
  const updateItems = useCallback(
    throttle((paddle: Paddle, priceId: string, quantity: number) => {
      paddle.Checkout.updateItems([{ priceId, quantity }]);
    }, 1000),
    [],
  );

  useEffect(() => {
    if (paddle?.Initialized) return;
    if (!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) return;

    initializePaddle({
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV as Environments,
      eventCallback: (event) => {
        if (event.data && event.name) {
          setCheckoutData(event.data);
        }
      },
      checkout: {
        settings: {
          variant: "one-page",
          displayMode: "inline",
          theme: "dark",
          allowLogout: !userEmail,
          frameTarget: "paddle-checkout-frame",
          frameInitialHeight: 450,
          frameStyle: "width: 100%; background-color: transparent; border: none",
          successUrl: "/checkout/success",
        },
      },
    }).then((p) => {
      if (p && priceId) {
        setPaddle(p);
        p.Checkout.open({
          ...(userEmail && { customer: { email: userEmail } }),
          items: [{ priceId, quantity }],
        });
      }
    });
  }, [paddle?.Initialized, priceId, userEmail]);

  useEffect(() => {
    if (paddle?.Initialized && priceId) {
      updateItems(paddle, priceId, quantity);
    }
  }, [paddle, priceId, quantity, updateItems]);

  return (
    <div>
      <PriceSection
        checkoutData={checkoutData}
        quantity={quantity}
        onQuantityChange={setQuantity}
      />
      {/* The class name here MUST match `frameTarget` above. */}
      <div className="paddle-checkout-frame" />
    </div>
  );
}
```

Three things to notice:

1. **`frameTarget`** is a CSS class name (no leading dot). Whatever you set here, you must also render an element with that exact class. Paddle injects the iframe into it.
2. **`eventCallback`** fires for every event — use the `event.name` to discriminate (`checkout.loaded`, `checkout.items.updated`, `checkout.completed`, `checkout.error`, `checkout.payment-error`, etc.). The starter kit just keeps the latest event data so a sibling component can show price totals.
3. **`successUrl`** is where Paddle redirects after a successful payment. Make this a route that handles post-purchase logic (e.g. shows an order confirmation) — but **do not** rely on it for provisioning; the webhook is the source of truth.

## Customer pre-Fill

If your user is already authenticated, pass their email so they don't need to type it:

```tsx
paddle.Checkout.open({
  customer: { email: "jane@example.com" },
  items: [{ priceId: "pri_01h...", quantity: 1 }],
});
```

To go further, pass an existing Paddle customer ID (created via the API or returned by a previous checkout):

```tsx
paddle.Checkout.open({
  customer: { id: "ctm_01h..." },
  items: [{ priceId: "pri_01h...", quantity: 1 }],
});
```

Setting `allowLogout: false` in the checkout settings prevents the user from signing out of their pre-filled session — useful when you've already authenticated them.

## Dynamic Line Items

To change quantity, swap a price, or add another item without closing the checkout, call `Paddle.Checkout.updateItems()`:

```tsx
paddle.Checkout.updateItems([
  { priceId: "pri_01h...", quantity: 3 },
  { priceId: "pri_02h...", quantity: 1 },
]);
```

Always **throttle** these calls (1 second is a good default — see the `lodash.throttle` example above). Paddle re-renders the checkout on each call, and updates without throttling produce a flicker and rate-limit risk.

## Reading Checkout State

Hook into the `eventCallback` to drive your own UI (running totals, line item breakdowns, applied discounts). The most useful events:

| Event                       | Fires when                                  | Common use                                |
| --------------------------- | ------------------------------------------- | ----------------------------------------- |
| `checkout.loaded`           | The checkout finishes its initial render            | Hide a loading spinner                    |
| `checkout.items.updated`    | Line items change (including via `updateItems`) | Update a sibling price summary            |
| `checkout.customer.created` | New customer is created during checkout     | Capture the new `customer.id`             |
| `checkout.payment.selected` | User picks a payment method                 | Conditionally show region-specific copy   |
| `checkout.completed`        | Payment succeeds                            | Trigger a confetti animation, redirect    |
| `checkout.error`            | Something went wrong opening checkout       | Surface a fallback (email, support link) |
| `checkout.payment-error`    | A payment attempt failed                    | Show retry guidance — never the raw error |

Full list at [Paddle event reference](https://developer.paddle.com/paddle-js/events.md).

## Post-Checkout: Redirect Vs Webhook

When checkout completes, two things happen in parallel:

1. The user's browser is sent to your `successUrl` (or your custom event handler).
2. Paddle fires a `transaction.completed` (and possibly `subscription.created`) webhook to your server.

**Provisioning belongs in the webhook**, not the redirect. The redirect is for UX (showing "Thanks for your order"); the webhook is the durable, retried, signed event you can trust. See [Paddle webhook guide](../paddle-webhooks/SKILL.md) for setup.

## Common Pitfalls

- **Something went wrong message** — typically means the domain wasn't added to the approved domains list in the Paddle dashboard, or the user didn't add a default payment link in the Paddle dashboard.
- **`Paddle is not defined`** — you forgot to await `initializePaddle()` before calling `Paddle.Checkout.open()`. The promise resolves with the `Paddle` object; only then can you open checkout.
- **Checkout doesn't render inline** — your `frameTarget` class name doesn't match a rendered element, or the element isn't in the DOM yet when `Checkout.open()` runs. Render the target first; open in a `useEffect`.
- **Sandbox vs production drift** — `NEXT_PUBLIC_PADDLE_ENV` controls which environment `Paddle.js` talks to. If your client token is for sandbox but you set `NEXT_PUBLIC_PADDLE_ENV=production`, the checkout will fail to load. Tokens and prices are environment-scoped — sandbox `pri_...` IDs don't exist in production.
- **Pasting price IDs into client code** — fine for a quick prototype, but for a real app load price IDs from the server (after fetching the catalog) so you can swap them without a redeploy.
- **Using the redirect for provisioning** — users close tabs, lose connections, or block redirects. Webhooks are the source of truth.
- **Throttling `updateItems`** — without throttling, rapid quantity changes flicker and may rate-limit. 1 second is a sensible default.
- **Calling `initializePaddle` twice** — the SDK warns and refuses on the second call. Guard with `paddle?.Initialized` (as in the example) or use a singleton pattern.

## Verify the Integration

1. Run `npm run dev` and navigate to your checkout page.
2. Confirm the checkout loads or the iframe renders and the price matches what you expect.
3. Use a [Paddle sandbox test card](https://developer.paddle.com/sdks/sandbox#test-cards) — e.g. `4242 4242 4242 4242` with any future expiry and any 3-digit CVC.
4. Complete the purchase and confirm:
   - The browser lands on your `successUrl`.
   - The `checkout.completed` event fired (`console.log` from `eventCallback`).
   - In the Paddle dashboard (sandbox), the transaction shows under **Transactions**.
5. To test the webhook side, see [Paddle sandbox testing guide](../paddle-sandbox-testing/SKILL.md) for the simulator.

## Related Docs

- [`Paddle.js` overview](https://developer.paddle.com/paddle-js.md)
- [Build an overlay checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout.md)
- [Build a branded inline checkout](https://developer.paddle.com/build/checkout/build-branded-inline-checkout.md)
- [Paddle event reference](https://developer.paddle.com/paddle-js/events.md)
- [`Paddle.Checkout.open` reference](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open.md)
- [Default payment link & domain approval](https://developer.paddle.com/build/transactions/default-payment-link.md)
- Reference implementation: [Paddle starter kit](https://github.com/PaddleHQ/paddle-nextjs-starter-kit) — see `src/components/checkout/checkout-contents.tsx`.
