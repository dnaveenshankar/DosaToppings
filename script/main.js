// script/main.js
// Product rendering + filtering + flip behavior
// IntersectionObserver for section highlight + reveal
// Runtime navbar-height sync (no floating by default)
// Go-top shows only on footer hover (hidden by default)

// Wrap everything in an IIFE to avoid leaking globals
(function () {
  'use strict';

  /* -------------------------
     DOMContentLoaded scope
     ------------------------- */
  document.addEventListener('DOMContentLoaded', function () {

    /* -------------------------
       Data & DOM nodes
       ------------------------- */
    const products = [
      // Traditional
      { id:1, name:'Curry Leaves', category:'Traditional', price:100, img:'assets/product-curry.jpg', desc:'Fragrant, classic powdered blend to lift dosa, idli and rice.' },
      { id:2, name:'Garlic', category:'Traditional', price:110, img:'assets/product-garlic.jpg', desc:'Savory garlic punch — pairs beautifully with ghee dosa.' },
      { id:3, name:'Idli Dosa', category:'Traditional', price:95, img:null, desc:'Classic seasoning made for idli & dosa — mild and nutty.' },
      { id:4, name:'Coriander', category:'Traditional', price:105, img:null, desc:'Fresh, green notes — a twist to everyday dosa and rice bowls.' },
      { id:5, name:'Tamarind Rice', category:'Traditional', price:120, img:null, desc:'Sour-sweet spice mix inspired by tamarind rice.' },

      // Health
      { id:6, name:'Flax Seed', category:'Health', price:140, img:'assets/product-flax.jpg', desc:'Rich in Omega-3 & fiber — crunchy, nutty podi.' },
      { id:7, name:'Horse Gram', category:'Health', price:130, img:null, desc:'Protein-rich and earthy — developed for nourishment.' },
      { id:8, name:'Moringa', category:'Health', price:145, img:null, desc:'Supergreen nutrition in a sprinkle — earthy and nutritious.' },
      { id:9, name:'Sesame', category:'Health', price:110, img:null, desc:'Nutty, fragrant sesame to add crunch and calcium.' },
      { id:10, name:'Protein Mix', category:'Health', price:160, img:null, desc:'Pulse-forward blend designed for extra protein.' },

      // Fusion
      { id:11, name:'Pepper Garlic', category:'Fusion', price:125, img:null, desc:'Bold pepper and roasted garlic for millet & pancakes.' },
      { id:12, name:'Spicy Millet', category:'Fusion', price:135, img:null, desc:'Millet-forward podi with chilli & herbs.' },
      { id:13, name:'Herb Chilli', category:'Fusion', price:120, img:null, desc:'Aromatic herbs meet gentle chilli.' },
      { id:14, name:'Lentil Mix', category:'Fusion', price:150, img:null, desc:'Protein-rich lentil blend with warm spices.' },
      { id:15, name:'Tomato Burst', category:'Fusion', price:115, img:null, desc:'Tangy tomato notes for bright modern flavor.' },

      // Kids
      { id:16, name:'Choco Nut', category:'Kids', price:130, img:null, desc:'Sweet cocoa-nut mix kids love — great on pancakes.' },
      { id:17, name:'Sweet Protein Mix', category:'Kids', price:140, img:null, desc:'Mildly sweet, protein-rich blend for children.' },
      { id:18, name:'Mild Garlic', category:'Kids', price:95, img:null, desc:'Gentle garlic flavor tuned for younger taste buds.' },
      { id:19, name:'Peanut Crunch', category:'Kids', price:120, img:null, desc:'Crispy peanuts and mild spices — a little one favourite.' },
      { id:20, name:'Sprout Mix', category:'Kids', price:150, img:null, desc:'Sprout-based mix to sneak in extra nutrition.' }
    ];

    const productGrid = document.getElementById('productGrid');
    const filterCategory = document.getElementById('filterCategory');
    const sortBy = document.getElementById('sortBy');
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
    const sections = document.querySelectorAll('main section, header#home');
    const siteNav = document.querySelector('.site-nav');

    /* -------- helpers -------- */
    function escapeHtml(str){ return String(str).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
    function escapeInitials(name){
      if(!name) return '';
      const parts = name.trim().split(' ');
      if(parts.length === 1) return parts[0].slice(0,3).toUpperCase();
      return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    /* ---------- product rendering ---------- */
    function renderProducts(list) {
      if(!productGrid) return;
      productGrid.innerHTML = '';
      if(!list || !list.length){
        productGrid.innerHTML = '<div class="col-12"><div class="p-4 text-center text-muted">No products found.</div></div>';
        return;
      }
      list.forEach(prod => {
        const col = document.createElement('div');
        col.className = 'col-sm-6 col-md-4 col-lg-3';
        col.innerHTML = `
          <div class="flip-card" tabindex="0" data-id="${prod.id}">
            <div class="flip-inner">
              <div class="flip-front">
                ${prod.img ? `<img src="${prod.img}" alt="${escapeHtml(prod.name)}" class="img-fluid cover">` : `<div class="no-image"><div class="placeholder-initials">${escapeInitials(prod.name)}</div></div>`}
                <div class="card-caption">
                  <div class="d-flex justify-content-between align-items-center">
                    <div><h5 class="mb-0">${escapeHtml(prod.name)}</h5><small class="text-muted">${escapeHtml(prod.category)}</small></div>
                    <div class="text-end"><div class="price-now">₹${prod.price}</div></div>
                  </div>
                </div>
              </div>
              <div class="flip-back">
                <h6>${escapeHtml(prod.name)}</h6>
                <p class="small mb-2">${escapeHtml(prod.desc)}</p>
                <div class="small text-muted">Category: ${escapeHtml(prod.category)} | Price: ₹${prod.price}</div>
              </div>
            </div>
          </div>
        `;
        productGrid.appendChild(col);

        // attach click for mobile flip (toggle)
        const card = col.querySelector('.flip-card');
        if(card){
          card.addEventListener('click', (e) => {
            if (window.innerWidth <= 992) {
              card.classList.toggle('active');
              // auto-close after 6s if still active
              setTimeout(()=> card.classList.remove('active'), 6000);
            }
          });
        }
      });

      // staged entrance animation
      const cards = productGrid.querySelectorAll('.flip-card');
      cards.forEach((el, i) => {
        el.style.opacity = 0;
        el.style.transform = 'translateY(18px) scale(.995)';
        setTimeout(()=> {
          el.style.transition = 'opacity 560ms ease, transform 560ms cubic-bezier(.2,.9,.2,1)';
          el.style.opacity = 1;
          el.style.transform = 'translateY(0) scale(1)';
        }, 70 * i);
      });
    }

    // initial render
    renderProducts(products);

    /* ---------- filters & sorting ---------- */
    if(filterCategory) filterCategory.addEventListener('change', applyFilters);
    if(sortBy) sortBy.addEventListener('change', applyFilters);

    function applyFilters() {
      const cat = filterCategory ? filterCategory.value : 'all';
      let list = products.slice();

      if (cat && cat !== 'all') list = list.filter(p => p.category === cat);

      const s = sortBy ? sortBy.value : '';
      if (s === 'name-asc') list.sort((a,b) => a.name.localeCompare(b.name));
      else if (s === 'name-desc') list.sort((a,b) => b.name.localeCompare(a.name));
      else if (s === 'price-asc') list.sort((a,b) => a.price - b.price);
      else if (s === 'price-desc') list.sort((a,b) => b.price - a.price);
      else if (s === 'category') list.sort((a,b) => a.category.localeCompare(b.category));

      renderProducts(list);
    }

    /* ---------- IntersectionObserver for sections (nav highlight + reveal) ---------- */
    try {
      const idToNav = {};
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if(href && href.startsWith('#')) idToNav[href.slice(1)] = link;
      });

      const ioOptions = { root: null, rootMargin: '0px 0px -30% 0px', threshold: 0.15 };

      const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const id = entry.target && entry.target.id;
          if(entry.isIntersecting){
            // highlight nav
            Object.values(idToNav).forEach(nl => nl.classList.remove('active'));
            if(id && idToNav[id]) idToNav[id].classList.add('active');

            // reveal animated children
            entry.target.querySelectorAll('.fade-in-up').forEach(el => el.classList.add('visible'));
          }
        });
      }, ioOptions);

      sections.forEach(sec => {
        if(sec) sectionObserver.observe(sec);
        // add fade-in-up to common children if not already present
        if(sec){
          sec.querySelectorAll('h2, h3, p, .feature-card, .combo-card, .flip-card, img').forEach(el => {
            if(!el.classList.contains('fade-in-up')) el.classList.add('fade-in-up');
          });
        }
      });
    } catch (err) {
      // IntersectionObserver might not be available or sections missing; skip gracefully
      // console.warn('Section observer not initialized', err);
    }

    /* ---------- Smooth anchor scrolling (respect nav height) ---------- */
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href && href.length > 1 && document.querySelector(href)) {
          e.preventDefault();
          const target = document.querySelector(href);
          // measure nav height dynamically
          const navEl = document.querySelector('.site-nav');
          const navHeight = (navEl && navEl.offsetHeight) ? navEl.offsetHeight : (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 80);
          const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 12;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });

    /* ---------- Navbar compacting option (kept minimal) ---------- */
    // We do NOT perform floating here (CSS uses fixed navbar). However, if you want
    // the navbar to receive a compact class on deep scroll to slightly change style, uncomment below.
    // function maybeCompactNav() {
    //   const y = window.scrollY || window.pageYOffset;
    //   const COMPACT_THRESHOLD = 420;
    //   if(!siteNav) return;
    //   if(y > COMPACT_THRESHOLD) siteNav.classList.add('scrolled');
    //   else siteNav.classList.remove('scrolled');
    // }
    // window.addEventListener('scroll', maybeCompactNav, { passive: true });

  }); // end DOMContentLoaded


  /* -------------------------
     Footer reveal + Go-to-top (single, robust block)
     - The go-top button remains hidden by default
     - It appears only when mouse enters the footer (desktop)
     - On mobile the button stays hidden (no hover)
     ------------------------- */
  (function footerAndGoTop() {
    const footer = document.getElementById('footer');
    const goTop = document.getElementById('goTop');
    if(!footer || !goTop) return;

    // hide on touch devices (no hover) — keep pointer-only logic
    const isTouch = (('ontouchstart' in window) || navigator.maxTouchPoints > 1);

    // Ensure goTop is hidden initially
    goTop.classList.remove('show');

    // show when mouse enters footer (desktop)
    if(!isTouch){
      footer.addEventListener('mouseenter', () => goTop.classList.add('show'));
      footer.addEventListener('mouseleave', () => goTop.classList.remove('show'));
    }

    // click handler (works on all devices)
    goTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // optional: show on scroll past a point (uncomment if desired)
    // window.addEventListener('scroll', () => {
    //   if(window.scrollY > 600) goTop.classList.add('show');
    //   else goTop.classList.remove('show');
    // }, { passive:true });

    // Footer reveal animation using IntersectionObserver (stagger)
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries, ob) => {
        entries.forEach(entry => {
          if(entry.isIntersecting){
            const items = footer.querySelectorAll('.fade-in-up');
            items.forEach((el, i) => setTimeout(()=> el.classList.add('visible'), i*120));
            ob.disconnect();
          }
        });
      }, { threshold: 0.08 });
      obs.observe(footer);
    } else {
      // fallback: reveal immediately
      footer.querySelectorAll('.fade-in-up').forEach(el => el.classList.add('visible'));
    }
  })();


  /* -------------------------
     Runtime navbar-height sync
     Ensures hero & anchors never hide under fixed nav (mobile & desktop)
     - measures .site-nav height and writes --nav-height
     - updates on load / resize / orientation / menu toggles
     ------------------------- */
  (function syncNavHeight(){
    const navSelector = '.site-nav';
    const nav = document.querySelector(navSelector);
    if(!nav) return;

    // small debounce helper
    let resizeTimer = null;
    function setNavVar(){
      const rect = nav.getBoundingClientRect();
      const h = Math.ceil(rect.height) || 72;
      // write CSS variable
      document.documentElement.style.setProperty('--nav-height', h + 'px');

      // update main padding-top inline as a robust fallback
      document.querySelectorAll('main').forEach(m => {
        if(m && m.style) m.style.paddingTop = `calc(${h}px + 6px)`;
      });

      // update scroll-margin-top inline for hero/sections
      const margin = h + 8;
      document.querySelectorAll('header#home, .hero, main section').forEach(el => {
        if(el && el.style) el.style.scrollMarginTop = margin + 'px';
      });
    }

    // run after load (small delay)
    window.addEventListener('load', () => setTimeout(setNavVar, 90), { passive:true });

    // resize / orientation
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(()=> setNavVar(), 120);
    }, { passive:true });

    window.addEventListener('orientationchange', () => { setTimeout(setNavVar, 180); }, { passive:true });

    // update after toggling any navbar collapse / toggler (bootstrap)
    document.querySelectorAll('.navbar-toggler, .navbar-collapse, .navbar-toggler-icon').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(setNavVar, 220));
    });

    // observe nav size changes for dynamic content/menu
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => setNavVar());
      ro.observe(nav);
    }

    // initial immediate run
    setNavVar();
  })();

})(); // end IIFE
