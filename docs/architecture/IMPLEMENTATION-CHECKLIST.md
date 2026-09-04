# DosaToppings Implementation Checklist

## Foundation

- [ ] Supabase project and environment separation
- [ ] Supabase Authentication configuration
- [x] Staff/customer identity model
- [ ] Super Admin verified email identity and email-based login
- [x] PostgreSQL relational schema and indexes
- [x] Deny-by-default database RLS baseline
- [x] Server/backend skeleton
- [x] Server-side authorization middleware and active-role resolution
- [ ] Audit logging enforcement on privileged mutations
- [ ] Rate limiting and abuse controls
- [ ] Secret management

## Customer store

- [x] Mobile-first storefront foundation
- [ ] Catalog/categories/search/filtering
- [ ] Product details and variants
- [ ] Customer registration/login/recovery
- [ ] Addresses
- [ ] Wishlist/save for later
- [ ] Cart
- [ ] Checkout
- [x] Authoritative order creation + inventory reservation
- [ ] Orders/tracking/cancellation
- [ ] Reviews
- [ ] Coupons/promos
- [ ] Referrals
- [ ] Wallet/loyalty/gift cards

## Admin

- [x] `admin.dosatoppings.in` staff login shell
- [ ] Staff management
- [ ] Roles and granular permissions
- [ ] Dashboard
- [ ] Products/categories/content
- [ ] Inventory and movement ledger
- [ ] Orders
- [ ] Customers
- [ ] Promotions/coupons/referrals/rewards
- [ ] Reviews
- [ ] Reports
- [ ] Settings
- [ ] Protected configurable operational email recipients
- [ ] New-order email recipient management and validation
- [ ] Audit logs

## Billing / POS

- [x] `bill.dosatoppings.in` staff login shell
- [ ] Permission-aware POS
- [ ] Product/customer lookup
- [ ] Cart and pricing validation
- [ ] Cash/UPI/card/online payment recording
- [ ] Invoice generation
- [ ] A4 printing
- [ ] Thermal receipt printing
- [ ] Customer/address printing
- [ ] Order/packing slip printing
- [ ] Returns/refunds with authorization
- [ ] Inventory synchronization
- [ ] Daily reconciliation

## Payments/email

- [x] Razorpay server integration skeleton
- [x] Server-side Razorpay payment order creation
- [x] Signature verification
- [x] Webhook event verification + idempotent ingestion
- [x] Payment reconciliation state machine
- [ ] Refund handling
- [x] Resend backend integration skeleton
- [ ] Protected Super Admin operational email configuration
- [ ] Configurable additional operational recipient email IDs
- [ ] New paid/confirmed order email to Super Admin + enabled configured recipients
- [ ] New-order notification deduplication/idempotency
- [ ] Email delivery status/failure logging and safe retry handling
- [ ] Transactional email templates

## Launch gate

- [ ] Mobile QA
- [ ] Desktop QA
- [ ] Print QA (A4 + thermal)
- [ ] Authentication/authorization tests
- [ ] Permission escalation tests
- [ ] Super Admin email-required login tests
- [ ] New-order notification recipient/deduplication tests
- [ ] Payment failure/duplicate/webhook tests
- [ ] Inventory race/rollback tests
- [ ] Refund/reward reversal tests
- [ ] Security review
- [ ] Backup/recovery verification
- [ ] Production DNS/subdomain configuration
- [ ] Production environment secrets configured outside Git
- [ ] Final validation before merging to `main`
