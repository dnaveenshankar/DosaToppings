# DosaToppings Commerce Platform — Master Blueprint

## Status

Architecture baseline for the new dynamic DosaToppings platform. The existing production storefront on `main` remains unchanged while development happens on `development`.

## Product vision

DosaToppings will evolve from the current static storefront into a secure, mobile-first commerce platform while preserving its existing visual identity: fresh, warm, food-first, green/yellow, premium but approachable, and distinctly Indian.

## Application surfaces and subdomains

The platform will use clear subdomains so each operational area has a focused purpose:

- Customer Store: `www.dosatoppings.in`
- Admin Control Center: `admin.dosatoppings.in`
- Store Billing / POS: `bill.dosatoppings.in`
- Secure backend/API: `api.dosatoppings.in`

The short `bill` hostname is intentional: it is easy for store staff to remember and clearly separates billing from administration.

Subdomains are an organizational and UX boundary, not a security boundary by themselves. Authorization must still be enforced server-side for every privileged operation.

## Staff and access-control model

The Admin Control Center will include a **Staff Management** area where authorized administrators can create, disable, invite and manage staff accounts without giving every employee full administrator privileges.

Access will use least-privilege role/permission control rather than a single admin flag.

Example roles:

- `super_admin` — complete platform control
- `admin_manager` — manage users/staff and operational configuration permitted by policy
- `store_manager` — catalog, inventory, orders and operational management
- `billing_staff` — billing/POS, customer lookup, invoice printing and permitted order actions
- `order_staff` — view/process/print orders and update permitted fulfillment statuses
- `inventory_staff` — stock counts, adjustments and inventory movements
- `content_manager` — products, categories, banners and merchandising
- `support_staff` — customer/order support with no financial or configuration authority
- `review_moderator` — review moderation/report handling
- `report_viewer` — read-only reports

Permissions will be granular, for example:

- `users.read`
- `users.create`
- `users.update`
- `users.disable`
- `products.read`
- `products.write`
- `orders.read`
- `orders.update`
- `orders.print`
- `orders.cancel`
- `inventory.read`
- `inventory.adjust`
- `inventory.transfer`
- `billing.create`
- `billing.refund`
- `coupons.read`
- `coupons.write`
- `promotions.write`
- `referrals.read`
- `rewards.adjust`
- `reviews.moderate`
- `reports.read`
- `settings.write`
- `audit_logs.read`

The UI will hide unavailable functions, but **backend authorization remains mandatory**. A staff member must not gain access simply by knowing another subdomain or manually calling an API endpoint.

High-risk permissions such as changing roles, issuing refunds, modifying rewards, changing pricing rules, deleting records or changing security/settings will be restricted and audited.

## Core stack

- GitHub: source control and deployment workflow
- Cloudflare: DNS, edge security, TLS, caching/WAF as appropriate
- Firebase Authentication: customer and staff authentication
- Firestore: transactional application database
- Firebase Storage: controlled application media/files when appropriate
- Firebase App Check: abuse protection
- Server-side backend: authoritative pricing, orders, payments, rewards, email orchestration and authorization
- Razorpay: online payments
- Resend: transactional email
- Google Drive: operational documents, exports, reports and selected business files; not the primary database

## Modules

### Customer

Registration, login, verification, password recovery, profile, addresses, catalog, categories, search, filters, variants, wishlist, cart, save-for-later, checkout, orders, tracking, cancellation, refunds, reorder, reviews, notifications, coupons, promo codes, referrals, wallet, loyalty and gift cards.

### Catalog

Products, categories, variants, pricing, product media, availability, merchandising, featured/bestseller/combo flags, SEO metadata and publishing state.

### Inventory

Opening stock, purchases, sales, returns, damaged stock, adjustments, transfers, reservations, low-stock thresholds and complete movement history. Current stock must be derived from auditable movements/transactions rather than relying only on an editable number.

### Commerce

Cart, authoritative pricing, discounts, taxes where applicable, shipping rules, checkout, order lifecycle, payments, refunds and invoices.

### Promotions

Coupons, promotional campaigns, referral codes/rewards, eligibility rules, usage limits, per-customer limits, date windows, product/category restrictions, stacking rules and fraud controls.

### Customer value

Wallet/store credit, loyalty points and gift cards, each backed by an immutable-style transaction ledger and reconciliation-friendly history.

### Reviews

Ratings, verified-purchase reviews, moderation, reporting and optional media.

### Admin

Dashboard, products, categories, inventory, orders, customers, coupons, promotions, referrals, rewards, reviews, reports, settings, staff and audit logs.

### Billing / POS

Product search, customer selection, cart/bill creation, discounts, coupons where permitted, cash/UPI/card/online payment recording, invoice generation, returns/refunds and inventory synchronization with online commerce.

## Firestore collections

Primary collections to refine during implementation:

- `users`
- `customers`
- `staff`
- `roles`
- `permissions`
- `products`
- `product_variants`
- `categories`
- `product_images`
- `inventory`
- `inventory_movements`
- `carts`
- `cart_items`
- `orders`
- `order_items`
- `order_status_history`
- `payments`
- `payment_events`
- `refunds`
- `addresses`
- `coupons`
- `promo_campaigns`
- `coupon_usage`
- `referrals`
- `referral_events`
- `wallets`
- `wallet_transactions`
- `loyalty_accounts`
- `loyalty_transactions`
- `gift_cards`
- `gift_card_transactions`
- `reviews`
- `review_reports`
- `invoices`
- `notifications`
- `audit_logs`
- `settings`

## Critical invariants

1. The browser is never trusted for final price, discount, stock, payment state or reward eligibility.
2. Razorpay payment confirmation is verified server-side and reconciled with webhook events.
3. Payment/webhook processing is idempotent; duplicate events must not create duplicate orders, stock deductions or rewards.
4. Inventory changes are auditable and tied to a source event such as order, POS sale, purchase, return or adjustment.
5. Coupon, promo and referral usage is recorded independently so campaigns can be audited and reversed safely.
6. Wallet and loyalty balances are backed by transaction ledgers.
7. Referral rewards are granted only after the configured qualifying event, normally a verified paid order that survives any configured cancellation/refund window.
8. Refunds must reverse applicable rewards/stock/financial effects according to explicit business rules.
9. Admin/staff access is role-based and least-privilege.
10. Secrets (Razorpay, Resend and backend credentials) never ship to client JavaScript or public Git history.
11. Firestore rules default to deny and grant only required access.
12. Sensitive administrative mutations produce audit records.
13. Subdomains never substitute for authorization; every backend operation checks the authenticated user's role and permission.

## Order lifecycle

`cart -> checkout -> payment_pending -> paid -> processing -> packed -> shipped -> delivered`

Alternative terminal/exception states include `payment_failed`, `cancelled`, `refund_pending`, `partially_refunded`, `refunded` and `payment_review` as required by implementation.

## Pricing pipeline

`catalog price -> variant adjustments -> eligible campaign/promo -> eligible coupon -> referral benefit -> wallet/loyalty redemption -> tax/shipping rules -> final payable amount`

The exact ordering and stacking rules will be explicit and server-authoritative.

## Referral lifecycle

`referral code issued -> referred customer attributed -> eligibility checked -> qualifying order paid -> reward pending/approved -> reward ledger entry -> reward available`

Fraud, self-referral, duplicate-account and refund reversal controls will be part of the implementation.

## Billing lifecycle

`POS cart -> pricing validation -> payment recorded -> invoice -> inventory movement -> daily reconciliation`

POS and online orders use the same catalog, customer, pricing and inventory foundations.

## Email events

Resend will be used for transactional messages such as welcome/verification support, order confirmation, payment confirmation, shipping/delivery updates, cancellation/refund notifications, review requests and operational/admin alerts. Email sending is backend-controlled.

## Google Drive policy

Drive is for documents and business files, not high-frequency commerce state. Firestore remains the source of truth for products, stock, carts, orders, payments, customers and rewards.

## Security baseline

- Firebase Authentication with verified identity where required
- App Check
- Firestore Security Rules
- Server-side authorization for privileged operations
- Strict input validation
- Rate limiting/abuse controls for public endpoints
- Secret isolation
- Idempotency for payment/webhook/order operations
- Audit logs for sensitive mutations
- Least-privilege staff roles
- No client-side authority over money or inventory
- Production/development environment separation
- Backups/export and recovery plan before production launch

## Delivery strategy

### Phase A — Foundation

Architecture, Firebase project, environments, authentication, Firestore model, indexes, Storage policy, App Check, security rules and backend skeleton.

### Phase B — Back office

Admin authentication/roles, staff management, granular permissions, catalog, categories, product management and inventory.

### Phase C — Customer commerce

Dynamic storefront, product details, account, addresses, wishlist, cart and checkout.

### Phase D — Payments and fulfillment

Razorpay, webhook verification, orders, invoices, inventory deduction, refunds and Resend notifications.

### Phase E — Growth engine

Coupons, promo campaigns, referral system, wallet, loyalty and gift cards.

### Phase F — Operations

Billing/POS, returns, reconciliation and business reports.

### Phase G — Quality and launch

Security review, abuse testing, payment edge cases, mobile QA, performance, SEO, analytics, monitoring and production cutover.

## Current storefront migration rule

The existing `index.html` is treated as the visual/content baseline. Existing design, product information and useful assets should be migrated deliberately into the new data model. Do not discard the existing storefront until the replacement is validated.
