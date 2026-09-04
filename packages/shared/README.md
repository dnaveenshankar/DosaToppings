# Shared contracts

This package will hold provider-neutral types, validation schemas and constants shared by the Store, Admin, Billing/POS and API applications.

Rules:

- Do not place secrets here.
- Client contracts are presentation/input contracts only; server validation remains authoritative.
- Monetary values use integer paise, never floating-point rupees.
- IDs are opaque UUIDs.
- Order/payment state transitions must be validated server-side.
