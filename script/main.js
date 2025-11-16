/* script/main.js
   Complete site JS for Dosa Toppings
   - Mandatory 3s preloader
   - Preloader hide + removal
   - Product rendering + filtering + flip behavior
   - IntersectionObserver for section highlight & reveal
   - Smooth anchors (respect fixed nav)
   - Footer reveal + go-top pointer-only show
   - Runtime navbar-height sync
*/

(function () {
  'use strict';

  /* -------------------------
     Config: preloader minimum display
     ------------------------- */
  const MIN_PRELOADER_MS = 3000; // mandatory minimum time (ms)
  const PRELOADER_REMOVE_DELAY = 600; // allow CSS fade before removing node

  /* -------------------------
     DOM nodes (selected early)
     ------------------------- */
  const preloader = document.getElementById('preloader');
  const productGrid = document.getElementById('productGrid');
  const filterCategory = document.getElementById('filterCategory');
  const sortBy = document.getElementById('sortBy');
  const navLinks = document.querySelectorAll('.navbar-nav .nav-link');
  const sections = document.querySelectorAll('main section, header#home');
  const siteNav = document.querySelector('.site-nav');
  const goTop = document.getElementById('goTop');

  /* -------------------------
     Track start time (when DOM started loading)
     We prefer DOMContentLoaded as the start marker; if DOMContentLoaded already fired,
     we fall back to script execution time.
     ------------------------- */
  let _startTs = Date.now();
  if (document.readyState === 'loading') {
    // DOM hasn't finished parsing yet — mark start when DOMContentLoaded fires
    document.addEventListener('DOMContentLoaded', function onDom() {
      _startTs = Date.now();
      document.removeEventListener('DOMContentLoaded', onDom);
    });
  } else {
    // DOM already parsed; use now
    _startTs = Date.now();
  }

  /* -------------------------
     Product dataset
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

  /* -------------------------
     Helpers
     ------------------------- */
  function escapeHtml(str){
    return String(str).replace(/[&<>"]/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }

  /* -------------------------
     Render products
     ------------------------- */
  function renderProducts(list) {
    if(!productGrid) return;
    productGrid.innerHTML = '';
    if(!list || !list.length){
      productGrid.innerHTML = '<div class="col-12"><div class="p-4 text-center text-muted">No products found.</div></div>';
      return;
    }

    const SAMPLE_IMG = 'assets/sample.png'; // placeholder image for all cards

    // product-specific benefits (3 points each)
    const featuresMap = {
      1: ['Fresh curry leaf aroma', 'No artificial flavours', 'Perfect with ghee dosa'],
      2: ['Bold roasted garlic', 'Aromatic & savory', 'Pairs with sesame oil'],
      3: ['Classic idli seasoning', 'Light & nutty', 'Family favourite'],
      4: ['Bright coriander notes', 'Freshens rice & dosa', 'Roasted for depth'],
      5: ['Tamarind tang & spice', 'Sour-sweet balance', 'Great with rice'],
      6: ['Omega-3 rich crunch', 'Boosts heart health', 'Nutty texture'],
      7: ['High-protein podi', 'Earthy roasted flavour', 'Satiety boosting'],
      8: ['Moringa goodness', 'Vitamin-rich sprinkle', 'Mild green taste'],
      9: ['Toasted sesame crunch', 'Good calcium source', 'Adds texture'],
      10:['Pulse-forward protein mix', 'Balanced spice profile', 'Meal-ready nutrition'],
      11:['Peppery heat & garlic', 'Works on millet dosa', 'Bold flavour'],
      12:['Millet-friendly spice', 'Slight smoky notes', 'Great with porridge/pancakes'],
      13:['Herbal aroma & mild chilli', 'Versatile use', 'Subtle heat'],
      14:['Lentil-based protein', 'Creamy roasted texture', 'Nutritious sprinkle'],
      15:['Tomato tang & brightness', 'Kid-friendly', 'Adds color & zing'],
      16:['Choco-nut sweetness', 'Kid-approved flavour', 'Great on pancakes'],
      17:['Mild sweet protein', 'Energy-packed', 'Mixes well with milk/yogurt'],
      18:['Gentle garlic flavor', 'Kid-friendly spice', 'Mild & tasty'],
      19:['Crunchy peanut bits', 'Good protein source', 'Crunch kids love'],
      20:['Sprout goodness', 'High in enzymes', 'Healthy everyday sprinkle']
    };

    list.forEach(prod => {
      const col = document.createElement('div');
      col.className = 'col-sm-6 col-md-4 col-lg-3';

      const features = featuresMap[prod.id] || [
        'Small-batch roasted',
        'Stone-ground texture',
        'Perfect for dosa & rice'
      ];

      const pointsHTML = `<ul class="flip-points">${features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;

      col.innerHTML = `
        <div class="flip-card" tabindex="0" data-id="${prod.id}" aria-label="${escapeHtml(prod.name)} - product card">
          <div class="flip-inner">
            <div class="flip-front">
              <img src="${SAMPLE_IMG}" alt="${escapeHtml(prod.name)}" class="img-fluid cover">
              <div class="card-caption">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <h5 class="mb-0">${escapeHtml(prod.name)}</h5>
                    <small class="text-muted">${escapeHtml(prod.category)}</small>
                  </div>
                  <div class="text-end">
                    <div class="price-now">₹${prod.price}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="flip-back" aria-hidden="true">
              <h6 class="mb-1">${escapeHtml(prod.name)}</h6>
              <p class="small mb-1">${escapeHtml(prod.desc)}</p>
              ${pointsHTML}
              <div class="small text-muted mt-2">Category: ${escapeHtml(prod.category)} | Price: ₹${prod.price}</div>
            </div>
          </div>
        </div>
      `;

      productGrid.appendChild(col);

      // attach interactivity
      const card = col.querySelector('.flip-card');
      if(card){
        // click/tap toggles flip on smaller screens (desktop hover handles desktop flip)
        card.addEventListener('click', (e) => {
          if (window.innerWidth <= 992) {
            card.classList.toggle('active');
            const back = card.querySelector('.flip-back');
            if(back) back.setAttribute('aria-hidden', card.classList.contains('active') ? 'false' : 'true');
            setTimeout(()=> card.classList.remove('active'), 6000);
          }
        });

        // keyboard accessibility: Enter or Space toggles flip
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.classList.toggle('active');
            const back = card.querySelector('.flip-back');
            if(back) back.setAttribute('aria-hidden', card.classList.contains('active') ? 'false' : 'true');
            setTimeout(()=> card.classList.remove('active'), 6000);
          }
        });

        // ensure aria-hidden default
        const backInit = card.querySelector('.flip-back');
        if(backInit) backInit.setAttribute('aria-hidden', 'true');
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

  /* -------------------------
     Filtering & Sorting
     ------------------------- */
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

  if(filterCategory) filterCategory.addEventListener('change', applyFilters);
  if(sortBy) sortBy.addEventListener('change', applyFilters);

  /* -------------------------
     IntersectionObserver: section highlight + reveal
     ------------------------- */
  function setupSectionObserver(){
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
        if(sec){
          sec.querySelectorAll('h2, h3, p, .feature-card, .combo-card, .flip-card, img').forEach(el => {
            if(!el.classList.contains('fade-in-up')) el.classList.add('fade-in-up');
          });
        }
      });
    } catch (err) {
      console.warn('Section observer error', err);
    }
  }

  /* -------------------------
     Smooth anchors (respect nav height)
     ------------------------- */
  function setupAnchors(){
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href && href.length > 1 && document.querySelector(href)) {
          e.preventDefault();
          const target = document.querySelector(href);
          const navEl = document.querySelector('.site-nav');
          const navHeight = (navEl && navEl.offsetHeight) ? navEl.offsetHeight : (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 80);
          const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 12;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    });
  }

  /* -------------------------
     Footer reveal + Go-top
     ------------------------- */
  function footerAndGoTop() {
    const footer = document.getElementById('footer');
    const goTopEl = document.getElementById('goTop');
    if(!footer || !goTopEl) return;

    const isTouch = (('ontouchstart' in window) || navigator.maxTouchPoints > 1);
    goTopEl.classList.remove('show');

    if(!isTouch){
      footer.addEventListener('mouseenter', () => goTopEl.classList.add('show'));
      footer.addEventListener('mouseleave', () => goTopEl.classList.remove('show'));
    }

    goTopEl.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

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
      footer.querySelectorAll('.fade-in-up').forEach(el => el.classList.add('visible'));
    }
  }

  /* -------------------------
     Runtime navbar-height sync
     ------------------------- */
  function syncNavHeight(){
    const navSelector = '.site-nav';
    const nav = document.querySelector(navSelector);
    if(!nav) return;

    let resizeTimer = null;

    function setNavVar(){
      const rect = nav.getBoundingClientRect();
      const h = Math.ceil(rect.height) || 72;
      document.documentElement.style.setProperty('--nav-height', h + 'px');

      document.querySelectorAll('main').forEach(m => {
        if(m && m.style) m.style.paddingTop = `calc(${h}px + 6px)`;
      });

      const margin = h + 8;
      document.querySelectorAll('header#home, .hero, main section').forEach(el => {
        if(el && el.style) el.style.scrollMarginTop = margin + 'px';
      });
    }

    window.addEventListener('load', () => setTimeout(setNavVar, 90), { passive:true });

    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(()=> setNavVar(), 120);
    }, { passive:true });

    window.addEventListener('orientationchange', () => { setTimeout(setNavVar, 180); }, { passive:true });

    document.querySelectorAll('.navbar-toggler, .navbar-collapse, .navbar-toggler-icon').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(setNavVar, 220));
    });

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => setNavVar());
      ro.observe(nav);
    }

    setNavVar();
  }

  /* -------------------------
     Initialize everything (render + observers + anchors)
     This function is called only AFTER the preloader minimum time has elapsed
     and after the window load event.
     ------------------------- */
  function initAfterLoad(){
    try {
      // ensure loaded class is present for CSS to hide spinner
      document.body.classList.add('loaded');

      if(preloader){
        try { preloader.setAttribute('aria-hidden', 'true'); } catch(e){/*ignore*/}

        // remove preloader node after a short delay to allow CSS fade-out
        setTimeout(()=> {
          if(preloader && preloader.parentNode) preloader.parentNode.removeChild(preloader);
        }, PRELOADER_REMOVE_DELAY);
      }
    } catch (e) { /* ignore errors */ }

    // initial rendering of products
    renderProducts(products);

    // setup observers, anchors, footer behaviour and nav sync
    setupSectionObserver();
    setupAnchors();
    footerAndGoTop();
    syncNavHeight();
  }

  /* -------------------------
     Window load handler with enforced minimum preloader time
     ------------------------- */
  function onWindowLoadEnforcePreloader() {
    const now = Date.now();
    const elapsed = Math.max(0, now - _startTs);
    const remaining = Math.max(0, MIN_PRELOADER_MS - elapsed);

    // Wait remaining milliseconds (if any), then initialize and hide preloader
    setTimeout(() => {
      initAfterLoad();
    }, remaining);
  }

  /* -------------------------
     Attach load event (robust if load already fired)
     ------------------------- */
  if (document.readyState === 'complete') {
    // page already loaded — still enforce minimum display based on our _startTs
    onWindowLoadEnforcePreloader();
  } else {
    window.addEventListener('load', function onLoad() {
      window.removeEventListener('load', onLoad);
      onWindowLoadEnforcePreloader();
    }, { passive: true });
  }

})();
