---
name: paddle-sandbox-testing
description: Verify LeadEmailFinder's Paddle sandbox credit-purchase flow with the existing Docker checkout fixture, signed webhooks, replay, adjustments, and scoped resource cleanup.
---

# Verify Paddle Credit Purchases in the Sandbox

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

Use [the repository sandbox fixture](../../../docker/paddle-dev/README.md) for setup, secret files,
exact tunnel routes, event subscriptions, test purchases, replay, adjustments, and cleanup. Reuse that fixture
rather than introducing a parallel `Next.js` or tunnel workflow. Preserve the ordinary stack's deterministic stub
provider and use [the credit-purchase Bruno collection](../../../bruno/credit-purchases/README.md).
Report local automated checks separately from account-bound sandbox evidence. A checkout redirect does not prove
that a signed webhook granted credits. Subscription, invoice, and production scenarios below do not apply to the
current credit-pack workflow.

## Upstream Reference

Read the following examples only for Paddle details relevant to the current task and the repository scope above.

# Test a Paddle Integration in the Sandbox

## When to Use This Skill

Use this skill when verifying a Paddle integration before going live — running real-looking checkouts, triggering webhook events, and exercising subscription state changes without taking real money. Covers sandbox configuration, test card numbers, the webhook simulator (single events and scenarios), local development with public tunnels, and the differences between sandbox and live behavior that bite people in production.

This skill is the safety net for everything else. Apply it alongside [Paddle checkout guide](../paddle-checkout-web/SKILL.md) and [Paddle webhook guide](../paddle-webhooks/SKILL.md) when validating the supported purchase flow — sandbox testing is the cheapest way to catch integration bugs.

## Sandbox Vs Production at a Glance

Paddle gives you two completely separate environments:

|                               | **Sandbox**                           | **Production**             |
| ----------------------------- | ------------------------------------- | -------------------------- |
| Purpose                       | Development and testing               | Real customers, real money |
| API base                      | `sandbox-api.paddle.com`              | `api.paddle.com`           |
| Dashboard                     | `sandbox-vendors.paddle.com`          | `vendors.paddle.com`       |
| API keys                      | Separate set                          | Separate set               |
| Client tokens                 | Separate set                          | Separate set               |
| Notification destinations     | Separate set                          | Separate set               |
| Products / prices / customers | Separate (none synced)                | —                          |
| Cards accepted                | Test cards only (real cards rejected) | Real cards                 |
| Adjustments / refunds         | Auto-approved                         | Manual approval            |
| Tax                           | Calculated but not collected          | Real tax handling          |
| Domain approval               | No approval required (any domain)     | Manual approval per domain |

**Nothing crosses between them.** A sandbox `pri_01h...` does not exist in production. Notification destinations are separate. Customers are separate. This is intentional — it makes "test in sandbox, then promote to live" the safe default.

## Step 1: Configure Sandbox

Sign up for the sandbox at [sandbox-vendors.paddle.com](https://sandbox-vendors.paddle.com) (registration separate from production). Then:

1. Set up at least one **product** with one **price** — see [Paddle catalog guide](../paddle-catalog-setup/SKILL.md) if you haven't done this yet.
2. Go to **Paddle > Developer tools > Authentication** and create:
   - A **client-side token** for use in `Paddle.js`.
   - A **server-side API key** for the Node SDK.
3. Note the IDs and set them in your local environment:

```bash
# .env.local — sandbox values
NEXT_PUBLIC_PADDLE_ENV=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_...
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_NOTIFICATION_WEBHOOK_SECRET=pdl_ntfset_...
```

The `PADDLE_API_KEY` for sandbox is prefixed `pdl_sdbx_apikey_` — production keys are prefixed `pdl_live_apikey_`. Glance at the prefix anytime you're not sure which environment you're hitting.

## Step 2: Use Test Cards

In sandbox, **only test cards work**. Real cards are rejected. The standard test card:

```
Card number: 4242 4242 4242 4242
Expiry:      any future month/year
CVC:         any 3 digits
ZIP/Postal:  any value
Name:        any value
```

Other test cards trigger specific scenarios:

| Card number           | Result                                                 |
| --------------------- | ------------------------------------------------------ |
| `4242 4242 4242 4242` | Valid card without 3DS                                 |
| `4000 0038 0000 0446` | Valid card with 3DS                                    |
| `4000 0566 5566 5556` | Valid Visa debit card                                  |
| `4000 0000 0000 0002` | Declined card                                          |
| `4000 0027 6000 3184` | Initial success, subsequent renewals decline (dunning) |

Full list at [Paddle sandbox test cards](https://developer.paddle.com/sdks/sandbox#test-cards). Use the failure cards to confirm your `checkout.payment-error` handling, dunning flow, and `subscription.past_due` handling work end-to-end.

## Step 3: The Webhook Simulator

The simulator lets you fire **fake-but-correctly-signed** webhook events at your endpoint without going through a real flow. Two modes:

**Single event.** Pick one event type (e.g. `subscription.canceled`), edit the JSON payload, hit "Send". Paddle signs it with your destination's secret and sends it by HTTP POST to your URL. Use this to test specific handlers in isolation — e.g. "what does my UI do when `subscription.paused` arrives?"

**Scenario.** A predefined sequence of events that mirrors a real flow. Examples:

- `subscription_created` — fires `customer.created`, `transaction.completed`, `subscription.created`, and more depending on the checkout flow.
- `subscription_renewed` — fires `subscription.updated`, `transaction.created`, `transaction.updated`, `transaction.completed`, `transaction.paid`.
- `subscription_canceled` — fires `subscription.updated` (with `scheduled_change`), then `subscription.canceled` after a delay.

Find the simulator at **Paddle > Developer tools > Simulations**. If a Paddle MCP server is available to you, you can drive the simulator programmatically inside one `execute` call instead of using the dashboard — create the simulation, then create a run against it:

```js
async (client) => {
  const sim = await client.simulations.create({
    name: "Subscription created flow",
    type: "subscription_created",
    notification_setting_id: "ntfset_...",
  });
  const run = await client.simulations.runs.create(sim.id, {});
  return { simulation_id: sim.id, run_id: run.id };
};
```

Note `client.simulations.runs.create` is nested under `simulations` (not a top-level `client.simulationRuns`), and the simulation ID is a positional path parameter.

> The Paddle MCP exposes three tools per server (`search`, `execute`, `report_missing_tool`). Workflow: call `search` to confirm the exact method name and parameter shapes, then call `execute` with an async function that calls `client.<resource>.<operation>(...)`. **Method paths are camel case** (`client.clientTokens.create`, `client.pricingPreview.preview`). **Body parameters and response fields are snake_case** (`tax_category`, `product_id`, `unit_price`, `currency_code`). Pagination is `{ pagination: { hasMore }, data: [...] }` with `{ after: "<last_id>" }` — not `.next()` / `.hasMore`. Chain multistep workflows inside one `execute`; variables don't persist between calls. Hard caps: 50 API calls per execute, 30-second timeout, 32 kilobytes of code.

To use the simulator:

1. In the dashboard, navigate to the simulator.
2. Pick a scenario or single event.
3. Set the notification destination URL — your tunneled local URL or a deployed preview URL.
4. (Optional) Edit the payload JSON to use specific IDs (e.g. a `customer_id` you've already created in your database).
5. (Optional) Configure your simulation (e.g. set the payment outcome to `failed` to simulate a failed payment).
6. Send. Watch your local server logs.

The signature on a simulated event uses the **destination's secret**, so your normal verification code works without changes. If verification fails, the secret you've set in `PADDLE_NOTIFICATION_WEBHOOK_SECRET` doesn't match the destination you're simulating against.

## Step 4: Tunnel Localhost for Real Events

The simulator covers most testing. For real flows (e.g. completing an actual sandbox checkout to verify the full chain), Paddle needs to reach your local machine. Use a tunnel:

**Hookdeck** (recommended):

```bash
# Install: brew install hookdeck/hookdeck/hookdeck
hookdeck listen 3000
# Copy the https URL: https://hkdk.events/abc123xyz
```

Then update your sandbox notification destination URL to the tunneled URL (e.g. `https://hkdk.events/abc123xyz`).

## Step 5: A Typical End-to-End Test

Here's the loop for verifying a fresh integration:

1. **Tunnel** localhost: `hookdeck listen 3000`.
2. **Update the sandbox destination** URL to the tunnel.
3. **Open** your pricing page → click Subscribe.
4. **Pay** with `4242 4242 4242 4242`.
5. **Confirm**:
   - Browser lands on your `successUrl`.
   - Server logs show all events
   - Your database has the new customer and subscription rows (only in an independently authorized upstream subscription integration).
   - The dashboard shows the transaction under **Transactions**.
6. **Cancel** the subscription using simulator, passing the subscription ID from the simulated subscription creation event.
7. **Confirm**:
   - A `subscription.updated` event arrives.
   - (Optional) Your database row updates `scheduled_change`, status remains `active` momentarily, `scheduled_change.action: 'cancel'`
   - A `subscription.canceled` event arrives with status `canceled`; your row should flip to `canceled`.

## Sandbox Vs Live: Differences That May Catch You Out

These behaviors only happen in production.

| **Behavior**                      | **Sandbox**                              | **Live**                                                          | **Why it matters**                                                                                                                             |
| --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adjustments (refunds/credits)** | Auto-approved every ten minutes          | High value refunds require approval from Paddle                   | Adjustments stay `pending` until approved—your handler should account for `adjustment.updated` flipping `status` from `pending` to `approved`. |
| **Payouts**                       | No payouts                               | Real money to your bank                                           | Test payout webhook handling against simulated payouts only.                                                                                   |
| **Domain approval**               | All domains automatically approved       | Manual per-domain in **Checkout settings → Default payment link** | Forgetting domain approval means production checkout fails to load.                                                                            |
| **Dunning (Retain)**              | Not available                            | Available                                                         | Retain handles canceling or pausing past due subscriptions.                                                                                    |
| **Email delivery**                | Only sent to the registered email domain | Sent to the email on the customer record (real)                   | Use an email from your domain in sandbox.                                                                                                      |

## Common Pitfalls

- **Mixing sandbox and live keys.** Always confirm `PADDLE_API_KEY` and `NEXT_PUBLIC_PADDLE_ENV` are for the correct environment.
- **Sandbox environment parameter in production.** Always confirm the environment parameter is set to `production` when initializing `Paddle.js` in production.
- **Forgetting to update the notification destination URL after restarting Hookdeck.** Symptoms: events fire on Paddle's side but never reach your code.
- **Testing with a real card "just to be sure"**. Sandbox rejects them. Production accepts them and charges them.
- **Not testing the failure path.** Use `4000 0000 0000 0002` to confirm `checkout.payment.error` handling, then use simulator to test a failed subscription renewal.
- **Using the same notification destination secret in code for both environments.** They are not the same. Each environment, each destination, has its own secret.
- **Testing only the happy path.** Real users may hit weird states — declined cards, expired trials, immediate cancellations. Use the simulator to fire each edge case and watch your code respond.

## Related Docs

- [Sandbox overview](https://developer.paddle.com/sdks/sandbox.md)
- [Test cards](https://developer.paddle.com/sdks/sandbox.md#test-cards)
- [Test webhooks with the simulator](https://developer.paddle.com/webhooks/simulator/test-webhooks.md)
- [Simulator scenarios reference](https://developer.paddle.com/webhooks/simulator.md)
- [Go-live checklist](https://developer.paddle.com/build/go-live-checklist.md)
- [API authentication](https://developer.paddle.com/api-reference/about/authentication.md)
