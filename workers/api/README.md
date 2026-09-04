# DosaToppings API

This directory is the server-side boundary for authoritative commerce operations.

Planned responsibilities:

- authenticate customer/staff requests
- resolve active identity and role/permission state
- validate ownership and resource scope
- calculate authoritative prices and discounts
- create and reconcile orders/payments
- verify Razorpay signatures/webhooks
- create idempotent notification events
- dispatch Resend email from server-side secrets
- maintain inventory/reward ledgers
- write audit records for sensitive mutations

## Security boundary

The browser is untrusted. Never accept client-supplied final totals, stock state, payment-success state, reward eligibility, role or permission as authoritative.

Production provider credentials belong in Worker/Supabase secret management and must never be committed to this repository.
