// product data + rendering + filtering + sorting + flip behavior
// + IntersectionObserver to highlight nav link for the visible section
// + navbar float-on-scroll logic (JS toggles .floating and .scrolled)
document.addEventListener('DOMContentLoaded', function () {

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

  /* ---------- render products ---------- */
  function renderProducts(list) {
    productGrid.innerHTML = '';
    if(!list.length){
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

      // attach click for mobile flip
      const card = col.querySelector('.flip-card');
      card.addEventListener('click', (e) => {
        if (window.innerWidth <= 992) {
          card.classList.toggle('active');
          setTimeout(()=> card.classList.remove('active'), 6000);
        }
      });
    });

    // entrance animation
    document.querySelectorAll('.flip-card').forEach((el, i) => {
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

  // filtering & sorting
  filterCategory.addEventListener('change', applyFilters);
  sortBy.addEventListener('change', applyFilters);

  function applyFilters() {
    const cat = filterCategory.value;
    let list = products.slice();

    if (cat !== 'all') list = list.filter(p => p.category === cat);

    const s = sortBy.value;
    if (s === 'name-asc') list.sort((a,b) => a.name.localeCompare(b.name));
    else if (s === 'name-desc') list.sort((a,b) => b.name.localeCompare(a.name));
    else if (s === 'price-asc') list.sort((a,b) => a.price - b.price);
    else if (s === 'price-desc') list.sort((a,b) => b.price - a.price);
    else if (s === 'category') list.sort((a,b) => a.category.localeCompare(b.category));

    renderProducts(list);
  }

  /* ---------- section observers for nav highlighting & reveal animations ---------- */

  // map section ids to nav links for quick lookup
  const idToNav = {};
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if(href && href.startsWith('#')) idToNav[href.slice(1)] = link;
  });

  // IntersectionObserver options
  const ioOptions = { root: null, rootMargin: '0px 0px -30% 0px', threshold: 0.15 };

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const id = entry.target.id;
      if(entry.isIntersecting){
        // highlight nav
        Object.values(idToNav).forEach(nl => nl.classList.remove('active'));
        if(id && idToNav[id]) idToNav[id].classList.add('active');

        // reveal animation for the section (add visible class to animated children)
        entry.target.querySelectorAll('.fade-in-up').forEach(el => el.classList.add('visible'));
      }
    });
  }, ioOptions);

  // observe each section and header
  sections.forEach(sec => {
    sectionObserver.observe(sec);
    // mark children for reveal animation
    sec.querySelectorAll('h2, h3, p, .feature-card, .combo-card, .flip-card, img').forEach(el => {
      el.classList.add('fade-in-up');
    });
  });

  /* ---------- NAVBAR float-on-scroll logic ---------- */
  const SCROLL_THRESHOLD_FLOAT = 120;   // scroll px to start floating
  const SCROLL_THRESHOLD_COMPACT = 420; // scroll px to show compact 'scrolled' styling
  let ticking = false;

  function updateNavbarState() {
    const y = window.scrollY || window.pageYOffset;
    const isMobile = window.innerWidth <= 767;

    // On mobile: keep navbar fixed from start (we treat as "floating")
    if (isMobile) {
      siteNav.classList.add('floating');
      if (y > SCROLL_THRESHOLD_COMPACT) siteNav.classList.add('scrolled');
      else siteNav.classList.remove('scrolled');
      return;
    }

    // Desktop/tablet: toggle floating once user scrolls past threshold
    if (y > SCROLL_THRESHOLD_FLOAT) siteNav.classList.add('floating');
    else siteNav.classList.remove('floating');

    // compact style deeper in scroll
    if (y > SCROLL_THRESHOLD_COMPACT) siteNav.classList.add('scrolled');
    else siteNav.classList.remove('scrolled');
  }

  // initial call on load (so if user opens mid-page)
  updateNavbarState();

  // optimized scroll listener using requestAnimationFrame
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () {
        updateNavbarState();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // update on resize (to handle mobile <-> desktop)
  window.addEventListener('resize', function () {
    // small debounce
    clearTimeout(window._navResizeTimeout);
    window._navResizeTimeout = setTimeout(()=> updateNavbarState(), 120);
  });

  /* ---------- helpers ---------- */
  function escapeHtml(str){ return String(str).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function escapeInitials(name){
    if(!name) return '';
    const parts = name.split(' ');
    if(parts.length === 1) return parts[0].slice(0,3).toUpperCase();
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // smooth anchors for nav clicks (also respect nav height if floating)
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href.length > 1 && document.querySelector(href)) {
        e.preventDefault();
        const target = document.querySelector(href);
        const navHeight = (document.querySelector('.site-nav').offsetHeight) || 80;
        const top = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 12;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

});
