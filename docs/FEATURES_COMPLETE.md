# DosaToppings complete feature set

## Customer
- Branded existing homepage preserved behind the Cloudflare site worker.
- Development safety notice before ordering/payment.
- Product catalogue, categories, images, descriptions, variants, pack sizes, pricing and stock visibility.
- Customer authentication: signup, login, session refresh and password recovery.
- Persistent account-linked cart.
- Wishlist with server-side ownership and an admin feature flag.
- Order history with order status timeline/tracing.
- Delivery addresses and checkout validation.
- Referral programme with admin-controlled enable/disable, personal codes and referral attribution.
- Reviews and verified-purchase review lifecycle.
- Wallet/loyalty, coupons, gift cards and notification architecture.

## Admin
- Role/permission controlled dashboard, products, variants, inventory, orders, customers, staff, content, reports and audit log.
- Customer activity/security trace endpoint for authorized staff.
- Admin feature controls for wishlist, referrals, order tracking and customer activity tracing.
- Admin forgot-password flow using Supabase Auth recovery; no reset tokens are stored by the application.
- Payments/reconciliation, refunds, invoices, reviews, notifications, wallet/loyalty, referrals, gift cards, shipping, pricing/tax and security-center modules.
- Individual staff accounts, high-risk authorization and auditability.

## Billing/POS
- POS billing architecture, product/variant selection, payment recording, invoice/receipt printing and stock-linked operations.

## Platform/security
- Cloudflare Workers for site, API and admin.
- Production domains: www.dosatoppings.in, admin.dosatoppings.in, bill.dosatoppings.in, api.dosatoppings.in.
- No customer-facing workers.dev URL.
- Supabase Auth and service-role protected server APIs.
- Server-side validation of price, stock, discount, payment and reward eligibility.
- Idempotent payment/webhook/order processing architecture.
- Inventory movement ledger and audit trail.
- RBAC with deny-by-default authorization.
- Automated GitHub Actions checks/deployments and production monitoring.

## Advanced roadmap built into the architecture
- Customer segmentation and lifecycle messaging.
- Abandoned-cart recovery.
- Product recommendations and recently-viewed products.
- Back-in-stock alerts and low-stock alerts.
- Delivery ETA/tracking integration.
- Multi-location inventory readiness.
- Tax/invoice configuration readiness.
- Fraud/risk review hooks for payments and orders.
- Staff session/security review and privileged-action tracing.
- Analytics-ready event stream for conversion, retention and referral attribution.
- Feature flags allow high-risk growth features to be enabled gradually.
