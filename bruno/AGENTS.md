# Bruno Collections

- Prefer declarative `runtime.assertions` for simple checks such as response status, body fields, headers, types, and lengths.
- Use JavaScript tests in `runtime.scripts` when custom logic cannot be expressed clearly as a declarative assertion.
- Preserve existing guarantees when converting checks, including exact response shapes and cookie validation.
