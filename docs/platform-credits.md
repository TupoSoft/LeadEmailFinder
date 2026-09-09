# Administer Organization Credits

Platform operators open Organizations, select Manage credits beside the intended organization, and verify its name,
full identifier, and freshly read balance. The browser requires `platform.credits.manage`; the API independently
requires `platform:admin`. Customer roles cannot read or adjust another organization's balance.

## Add Credits

Enter the positive whole number of credits to add and choose Review addition. Confirm the organization, current
balance, and amount, then choose Add credits. The balance remains unchanged until the server responds, and the page
refreshes it after the request finishes. A failed refresh must succeed before another adjustment is available.

The tab saves one recovery key before sending an addition. If saving fails, no addition is sent. After an unconfirmed
response, the addition may already have applied. Keep the same tab and choose Retry same adjustment after the current
balance loads. This sends the same organization, amount, and key; the server applies that logical addition at most once.
A refreshed balance alone cannot prove whether a particular request applied.

Reloading the same tab restores a matching unresolved addition after signing-in identity and organization details
have been checked. It does not send another request automatically. A conflict retains the original operation for
reconciliation; it does not substitute another amount or recovery key.

## Set an Absolute Balance

Enter zero or a positive whole number under Set absolute balance and choose Review absolute set. The confirmation
names the organization, current balance, and requested final value. Set absolute balance replaces the entire balance,
including changes another operator may have made since the displayed read. Cancel returns without making a request.

There is no automatic retry. After a lost response, reload the balance before deciding whether to make another explicit
set. If the observed balance matches the requested value, that observation still cannot establish which request caused
it. Resolve or abandon an unresolved addition before setting an absolute balance.

## Recovery Limits and Abandonment

Local recovery lasts 24 hours in the same tab. Closing the tab, clearing browser storage, signing out, losing a usable
session, changing principal, or opening another organization's credit page can remove the recovery key. The browser
cannot recover that key afterward. Avoid those actions while reconciling an unconfirmed addition.

An expired record remains until you acknowledge that its server-side outcome is unknown. Abandon unresolved adjustment
explains that the addition may already have applied and removes local recovery only after Acknowledge and abandon.
Reconcile the original adjustment through authorized server records before starting a separate addition. Do not infer
the outcome from the current balance or assume that abandonment undoes the server operation. This screen provides no
ledger history or automatic reconciliation.

Never copy recovery keys, authentication cookies, tokens, or real customer information into diagnostics. Validation
uses a uniquely named disposable organization and removes only the resources created for that run.
