# Production Setup Gates

Development should continue without blocking on external credentials. Stop and ask the owner only when a manual configuration is genuinely required.

## Gate 1 — Supabase

Required before live authentication/database integration:

- Create/select production Supabase project.
- Enable email/password authentication.
- Configure verified email behavior.
- Create the first Super Admin using a mandatory email address.
- Configure MFA/strong authentication for high-privilege staff where available.
- Provide project URL and the appropriate public client configuration through environment settings; never commit secrets.

## Gate 2 — Cloudflare

Required before production subdomain routing:

- Confirm Pages/Workers project setup.
- Route `www.dosatoppings.in`, `admin.dosatoppings.in`, `bill.dosatoppings.in` and `api.dosatoppings.in` as designed.
- Keep production DNS and existing storefront stable until cutover is explicitly approved.

## Gate 3 — Resend

Required before production transactional email:

- Verify the sending domain.
- Choose the production From address.
- Configure the Resend API key only in server-side secrets.
- Configure Super Admin email and operational notification recipients in the application, not in source code.

## Gate 4 — Razorpay

Required before accepting real payments:

- Activate/configure the merchant account.
- Complete required business/KYC steps.
- Configure production payment credentials in server-side secrets.
- Configure webhook endpoint and signing secret.
- Test payment success, failure, duplicate webhook and refund flows before live mode.

## Gate 5 — Google Drive (optional)

Only required when automated exports/reports/document storage are enabled. Credentials must be server-side and Drive must never become the transactional database.

## Owner interaction rule

Do not ask for credentials in chat. Ask the owner to perform the manual setup in the provider console and confirm completion. Then continue implementation.
