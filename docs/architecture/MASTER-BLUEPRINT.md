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

**Authentication is mandatory for both privileged applications.** `admin.dosatoppings.in` and `bill.dosatoppings.in` must never expose an operational dashboard, POS data, customer records, inventory controls or other privileged functions before successful authentication and authorization.

Subdomains are an organizational and UX boundary, not a security boundary. Authorization must still be enforced server-side for every privileged operation.

## Authentication and session-security requirements

### Customer authentication

The customer store will support Firebase Authentication with email/password and the selected future sign-in providers. Account verification and password recovery are handled through secure Firebase Auth flows. Sensitive account operations require recent authentication where appropriate.

### Admin Control Center authentication

`admin.dosatoppings.in` is a protected staff application:

- No public/self-service staff registration.
- Staff accounts are created or invited only by an authorized administrator.
- Firebase Authentication is the identity provider; Firestore/backend records provide staff profile, role and permission state.
- A successful login is **not** sufficient by itself: the backend must verify that the authenticated account is an active staff member and has the required permission for each operation.
- Disabled/suspended staff accounts must be rejected even if an old browser session exists.
- Privileged actions such as role changes, refunds, pricing changes, reward adjustments, deletions and security/settings changes require explicit permissions and audit logging.
- Session persistence, logout and token revocation/re-authentication behavior will be designed so account disablement and high-risk security changes take effect promptly.
- MFA/stronger authentication will be required for high-privilege roles before production launch where supported by the selected Firebase Auth configuration.
- Admin routes must fail closed: unauthenticated users are sent to the staff login screen, while unauthorized authenticated users receive an access-denied state rather than a partially rendered admin area.

### Store Billing / POS authentication

`bill.dosatoppings.in` is also a **fully authenticated staff application**:

- No anonymous billing/POS access.
- No shared generic staff login in production; every operator gets an individual staff identity so actions are attributable.
- Staff sign in through the same central identity foundation but receive only billing/POS permissions assigned to their account.
- A `billing_staff` user may create bills, search permitted products/customers and print invoices/orders, but cannot automatically access admin settings, role management or unrelated sensitive functions.
- Returns, refunds, discounts above configured limits, manual price overrides and other high-risk financial operations require the corresponding permission and may require manager approval.
- Each bill, payment, refund, void, price override and sensitive POS action records the authenticated staff identity, timestamp and relevant audit metadata.
- Idle-session handling and explicit logout will be implemented for shared store devices, with secure re-authentication for sensitive actions.
- POS access must continue to work only when the backend authorization check succeeds; hiding admin links in the UI is never considered sufficient protection.

### Authorization architecture

Authentication answers **who is this?** Authorization answers **what may this person do?** The platform will enforce both layers.

1. Firebase Auth establishes the user identity.
2. Backend/server authorization resolves the active staff/customer state.
3. Staff role/permission assignments are evaluated for the requested operation.
4. Resource-level checks verify ownership, store/location scope and other business constraints where applicable.
5. High-risk operations create audit records and may require step-up authentication or manager approval.
6. Firestore Security Rules and backend checks fail closed when identity, role, permission or resource state is missing/invalid.

The frontend may hide unavailable functions for usability, but it is never a security control.

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

Dashboard, products, categories, inventory, orders, customers, coupons, promotions, referrals, rewards, reviews, reports, settings, staff and audit logs. All admin routes require authenticated, authorized staff access.

### Billing / POS

Product search, customer selection, cart/bill creation, discounts, coupons where permitted, cash/UPI/card/online payment recording, invoice generation, returns/refunds and inventory synchronization with online commerce. All POS routes require authenticated, authorized staff access.

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
14. `admin.dosatoppings.in` and `bill.dosatoppings.in` require authentication before privileged UI/data access.
15. Every production staff action is attributable to an individual staff identity; shared credentials are prohibited.
16. Staff disablement/revocation must invalidate or reject subsequent privileged operations even if a stale client remains open.
17. High-risk financial and security actions require explicit permissions and appropriate audit/step-up controls.

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
- Mandatory authentication for `admin` and `bill` applications
- No public/self-service staff registration
- Individual staff accounts; no shared production credentials
- Least-privilege RBAC and granular permissions
- Server-side authorization on every privileged endpoint and mutation
- Resource/store-scope checks where applicable
- Step-up authentication/MFA for high-risk staff operations where supported
- Prompt rejection of disabled/revoked staff accounts
- Secure logout/session handling and re-authentication for sensitive actions
- App Check
- Firestore Security Rules
- Strict input validation
- Rate limiting/abuse controls for public endpoints
- Secret isolation
- Idempotency for payment/webhook/order operations
- Audit logs for sensitive mutations and POS/financial activity
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
