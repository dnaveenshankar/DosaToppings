# DosaToppings RBAC Matrix

## Rule

Authentication answers **who is signed in**. Authorization answers **what that account may do**. Every privileged backend operation must enforce both.

Subdomains are UX boundaries only:

- `www.dosatoppings.in` — customer store
- `admin.dosatoppings.in` — administration
- `bill.dosatoppings.in` — billing/POS
- `api.dosatoppings.in` — backend/API

## Roles

| Role | Purpose |
|---|---|
| `super_admin` | Full platform administration |
| `admin_manager` | User/staff and permitted configuration management |
| `store_manager` | Catalog, inventory, orders and store operations |
| `billing_staff` | POS/billing and permitted invoice/order actions |
| `order_staff` | Order processing, printing and permitted status changes |
| `inventory_staff` | Stock counts, adjustments and transfers |
| `content_manager` | Products, categories, banners and merchandising |
| `support_staff` | Customer/order support without financial authority |
| `review_moderator` | Review moderation and reports |
| `report_viewer` | Read-only reporting |

## Permission families

- `users.read`, `users.create`, `users.update`, `users.disable`
- `products.read`, `products.write`
- `categories.read`, `categories.write`
- `orders.read`, `orders.update`, `orders.print`, `orders.cancel`
- `inventory.read`, `inventory.adjust`, `inventory.transfer`
- `billing.create`, `billing.refund`
- `coupons.read`, `coupons.write`
- `promotions.write`
- `referrals.read`
- `rewards.adjust`
- `reviews.moderate`
- `reports.read`
- `settings.write`
- `audit_logs.read`

## Sensitive operations

Role changes, staff disabling, refunds, price overrides, reward adjustments, destructive data operations and security/settings changes require elevated permissions and an audit record.

Where practical, sensitive actions should require recent authentication/re-authentication or another step-up control.

## Enforcement

1. Authenticate the request.
2. Resolve the staff/customer identity from trusted authentication claims/session state.
3. Confirm the account is active.
4. Resolve role/permission assignment from trusted server-side data.
5. Check the exact required permission.
6. Validate the requested resource and business rules.
7. Perform the mutation server-side.
8. Record an audit event for sensitive mutations.

Frontend route guards are convenience only and never replace these checks.

## POS isolation

A `billing_staff` account may use `bill.dosatoppings.in` only for permissions granted to that account. It must not gain access to staff management, security settings, unrestricted pricing configuration, reward adjustment or other administrative functions merely because the same Firebase project is used.

## Customer isolation

Customer accounts may access only their own profile, addresses, carts, orders, reviews and permitted rewards. Customer input must never be trusted to select another customer's document.
