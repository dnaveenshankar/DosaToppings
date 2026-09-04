# DosaToppings Implementation Checklist

## Foundation

- [ ] Firebase project and environment separation
- [ ] Firebase Authentication configuration
- [ ] Staff/customer identity model
- [ ] Super Admin verified email identity and email-based login
- [ ] Firestore collections and indexes
- [ ] Deny-by-default Firestore rules
- [ ] App Check
- [ ] Server/backend skeleton
- [ ] Server-side authorization middleware
- [ ] Audit logging
- [ ] Rate limiting and abuse controls
- [ ] Secret management

## Customer store

- [ ] Mobile-first storefront migration
- [ ] Catalog/categories/search/filtering
- [ ] Product details and variants
- [ ] Customer registration/login/recovery
- [ ] Addresses
- [ ] Wishlist/save for later
- [ ] Cart
- [ ] Checkout
- [ ] Orders/tracking/cancellation
- [ ] Reviews
- [ ] Coupons/promos
- [ ] Referrals
- [ ] Wallet/loyalty/gift cards

## Admin

- [ ] `admin.dosatoppings.in` staff login
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

- [ ] `bill.dosatoppings.in` staff login
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

- [ ] Razorpay test integration
- [ ] Server-side payment order creation
- [ ] Signature verification
- [ ] Webhook verification
- [ ] Idempotency and reconciliation
- [ ] Refund handling
- [ ] Resend backend integration
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
