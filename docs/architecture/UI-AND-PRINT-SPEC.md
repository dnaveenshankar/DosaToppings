# DosaToppings UI, Mobile & Print Specification

## Purpose

Define non-negotiable UX requirements for the dynamic DosaToppings platform before implementation replaces the current storefront.

## Responsive priority

The customer store, Admin Control Center and Store Billing/POS must be designed mobile-first.

### Mobile requirements

- Touch targets should be comfortable for phone use.
- No horizontal page scrolling.
- Forms use appropriate mobile keyboard/input types.
- Checkout remains usable on small screens with clear step/state feedback.
- Cart and checkout actions remain easy to reach.
- Tables in admin/POS become cards or horizontally contained data views where appropriate.
- Navigation is simplified for staff on small screens.
- Billing/POS must remain usable on a phone/tablet while supporting desktop workflows.
- Respect reduced-motion and accessible contrast/focus requirements.
- Avoid hover-only interactions.

### Desktop requirements

- Preserve the existing DosaToppings visual identity and useful storefront content.
- Use wider layouts for catalog, admin dashboards, order queues and POS where helpful.
- Do not create a separate desktop-only business logic path; responsive views use the same authoritative backend.

## Authentication UX

- Customer login/register on `www.dosatoppings.in`.
- Mandatory staff login on `admin.dosatoppings.in`.
- Mandatory staff login on `bill.dosatoppings.in`.
- Unauthenticated users cannot load privileged application data.
- Authenticated staff still require backend permission checks.
- Clear session-expired and insufficient-permission states.
- Secure logout.
- Password recovery.
- Email verification where configured.
- Stronger authentication/MFA for high-privilege roles where supported.

## Printable documents

Every customer-facing address and business document that is operationally useful must have a clean print representation.

### Invoice / bill

Support:

- Browser print dialog.
- A4 invoice layout.
- Compact thermal/POS receipt layout where applicable.
- Business/customer details.
- Invoice/order number.
- Date/time.
- Items, quantities, unit prices and totals.
- Discounts/coupons/promotions where applicable.
- Tax fields only when applicable/configured.
- Payment method/status.
- Shipping/billing address as applicable.
- Refund/return information when applicable.
- Print-safe typography and spacing.
- No application navigation, buttons or interactive controls in print output.

### Address

Customer addresses must be printable from order/account/admin/POS contexts where authorized.

Print representation should clearly separate:

- Recipient name
- Phone/contact information where appropriate
- Address lines
- Locality/city
- State
- Postal code
- Country when required
- Shipping vs billing designation

### Order / packing slip

Provide a print-friendly order sheet for staff, including order number, customer, items/quantities, fulfillment status and authorized operational notes. Sensitive payment information must never be printed unnecessarily.

## Print security

- Never print passwords, authentication tokens, API keys or payment secrets.
- Mask sensitive customer/payment information where business rules require it.
- Respect staff permissions when generating or viewing printable documents.
- Print endpoints/views must not bypass normal authorization.

## Implementation rule

Print views are generated from authoritative order/customer/invoice data. Frontend totals are presentation-only and must not become the source of truth for financial documents.
