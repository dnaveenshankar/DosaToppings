# Supabase development

The SQL migrations in `supabase/migrations/` define the transactional foundation for DosaToppings.

## Safety rules

- Never commit Supabase service-role keys, database passwords, Razorpay secrets, Resend API keys, or other production credentials.
- Production and development/test data must remain separated.
- RLS is enabled on application tables. Customer-facing policies should be introduced only after ownership and authorization rules are reviewed.
- Financial totals, payment state, inventory and rewards remain server-authoritative.

## First migration

`0001_initial_schema.sql` creates the core commerce, inventory, payment, promotion, rewards, review, notification and audit tables plus the granular permission catalogue.

The next migration will add reviewed helper functions/policies for safe customer reads/writes and staff authorization. The trusted API layer will remain responsible for privileged mutations.
