# Common Contracts

The common library publishes small cross-cutting types, tokens, enums, and pure utilities through
[`src/index.ts`](src/index.ts). Business modules may depend on these contracts without importing another business
module's implementation or the API composition root.

## Customer-Object Write Security

`CustomerObjectWriteSecurity` is a framework-free discriminated value describing the mandatory metadata for a write
of customer or individual data. Production values require authenticated HTTPS intent, explicit `aws:kms` encryption,
one configured KMS key identifier, and `no-store` cache control. The development value retains `no-store` while
omitting KMS fields so the disposable Garage fixture remains usable.

`CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN` is the shared injection token. The API composition root creates and freezes one
validated value, then infrastructure adapters inject the token and translate the value into provider-specific request
fields. Common does not import AWS, configuration, or a business module for this contract.

## Test Support

[`src/testing/customer-object-write-security.contract.ts`](src/testing/customer-object-write-security.contract.ts)
provides the reusable adapter contract for the exact production SSE-KMS and development `no-store` mappings. It is
available through the testing-only deep barrel and is not exported from the common production barrel.

## Validation

The contract is exercised by the email-verification input and result adapter specifications and the API factory and
module specifications. Repository type checking and the module architecture gate verify that consumers retain the
intended dependency direction.
