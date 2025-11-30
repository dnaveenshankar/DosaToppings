# Dosa Toppings — Healthy Twist for Every Dosa

A lightweight, responsive single-page website showcasing **Dosa Toppings** — small-batch spice/podi products for dosa, idli and rice. Built as a static HTML/CSS/JS demo with accessible markup, simple animations, card carousels and flip-cards for product details.

---

## Contents

- `index.html` — Main HTML file (the file you provided).
- `assets/` — CDN-hosted images referenced in the HTML (icons, product images, hero images).
- `README.md` — This file.
- Inline `storeData` object — product/combos data embedded in the page for demo usage.

> NOTE: Your HTML already uses CDN links for images (jsdelivr). If you want an offline build, download those assets into a local `assets/` folder and update the image paths in `index.html` and the `storeData` image entries.

---

## Features

- Responsive layout with desktop and mobile navigation (top header + bottom mobile nav).
- Hero slideshow with accessible controls (keyboard + dots).
- Marquee for USP badges.
- Horizontal product carousels for **Bestsellers**, **Combos** and **All Products**.
- Flip-card product UI: click or press Enter/Space to flip and reveal product details, features and long descriptions.
- Smooth, accessible interactions (aria attributes, keyboard handlers, focus management improvements).
- Small preloader and defensive JS for errors and slow loading.

---

## How to use / Run locally

1. Save the supplied `index.html` into a project folder (for example `dosa-toppings/`).  
2. (Optional) Add a local `assets/` directory and download images referenced from the CDN (if you want an offline copy). Update `index.html` URLs to `assets/...` if you do this.  
3. Open `index.html` in a modern browser (Chrome, Edge, Firefox, Safari). No build step required — this is a static page.
4. To test on mobile sizes, use your browser's responsive/dev tools or serve locally and open from a phone on the same network.

**Quick local server (Optional but recommended to avoid some file:// restrictions):**

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

---

## Data structure (inline `storeData`)

The HTML contains an inline `storeData` JS object used to render cards. A product entry looks like this:

```js
{
  id: "sig-001",
  title: "Classic Paruppu Podi",
  price: 100,
  unit: "50gms",
  short: "Lentil-forward, nutty & aromatic.",
  description: "Best as rice mix or with dosa/idli. Mild heat, rich dal aroma.",
  image: "https://.../signature-1.png",
  tags: ["HOME_MADE","HEALTHY"],
  longDesc: "Long description string with newlines",
  features: ["feature1","feature2",...]
}
```

`combos` refer to product `id`s. `bestSellers` is an array of product ids used to populate the Bestsellers carousel.

---

## Accessibility & Improvements (suggestions)

- Add `aria-controls` & `aria-expanded` to flip triggers and close buttons for better screen reader experience.
- Improve focus management: move focus into the back face when flipped and return focus to the card on close.
- Include `alt` text for every image (most images already have alt text). If you replace CDN images, keep descriptive `alt` attributes.
- Consider lazy-loading images (`loading="lazy"`) for better performance on mobile and slow networks.
- Add unit and integration tests if you integrate with a build system or component framework.
- If shipping as an e-commerce store, add product IDs, stock levels, and integrate a cart checkout flow (or connect to a headless CMS / e-commerce backend).

---

## Development notes

- The page emphasizes small-batch product storytelling and easy conversion to a storefront design.
- The `setupLoopingCarousel` helper clones nodes to create an infinite scrolling illusion — be cautious when adding dynamic nodes or event listeners to prevent duplicated handlers on clone nodes.
- The `createProductCard` function safely escapes text using a small `esc` helper to avoid HTML injection via inline data — keep that when loading dynamic content from untrusted sources.
If you'd like any of those, tell me which option and I'll prepare it right away.

---

*Created from the `index.html` you provided — Dosa Toppings static demo.*
