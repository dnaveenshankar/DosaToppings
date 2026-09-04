# DosaToppings Email & Notification Specification

## Goals

Provide reliable, server-controlled transactional email for customer, staff and operational events without exposing provider secrets to the browser.

## Super Admin identity

- Super Admin accounts always use an email address as the login identifier.
- Super Admin email is mandatory and must be verified.
- Password recovery and security notifications use the verified Super Admin email.
- Changing the Super Admin email is a high-risk action requiring authorization, re-authentication/step-up where supported, and an audit record.

## New-order notifications

When an order reaches the configured confirmed/paid state, the backend sends a new-order notification to:

1. The active Super Admin email.
2. Every enabled recipient configured under operational email settings.
3. Duplicate addresses are deduplicated before sending.

Email sending must happen server-side. The client must never call the email provider directly with a secret API key.

## Configurable recipients

Admin settings should support an email notification recipient list with:

- email address
- display name
- enabled/disabled state
- event subscriptions
- created/updated timestamps

Initial event subscription options:

- new order
- payment received
- payment failed
- cancellation
- refund
- low stock
- new customer
- review received
- daily sales summary
- security/admin alert

The Super Admin recipient remains mandatory for new-order and security-critical alerts unless an explicit future policy changes this requirement.

## Order email contents

New-order emails should contain:

- order number
- order date/time
- customer name and contact information as permitted
- billing address
- shipping/delivery address where applicable
- ordered products/variants
- quantity
- item prices
- discounts
- taxes/charges where applicable
- payment method and status
- order total
- relevant fulfillment status
- link to the authenticated admin order view where appropriate
- discreet `Developed by Naveen — naveenshankar.in` attribution where appropriate

Do not include passwords, authentication tokens, API keys, internal secrets or unnecessary sensitive data.

## Delivery reliability

Email events should be persisted as notification/email records with an idempotency key tied to the business event. The backend should prevent duplicate sends for the same event, record provider message identifiers when available, record success/failure, and support safe retry of transient failures.

Order creation/payment confirmation must not depend on the browser successfully sending email. Email delivery is an operational side effect of the authoritative order/payment event.

## Customer transactional messages

Planned messages include:

- account verification support
- welcome message where appropriate
- order confirmation
- payment confirmation
- shipping/fulfillment update
- delivery update
- cancellation
- refund/partial refund
- review request
- wallet/loyalty/gift-card events where configured

## Security

- Provider API keys live only in server-side secret storage.
- Email recipient configuration is protected by RBAC.
- Changes to notification recipients and Super Admin identity are audited.
- Email templates are server-controlled and validated.
- Public forms must be rate-limited/abuse-protected.
- Email addresses must be normalized and validated.
- The system must not expose the complete internal recipient list to customers.
