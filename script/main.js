// Interactive bits: card flip tap support & contact form mock
document.addEventListener('DOMContentLoaded', function () {

  // Enable tap to flip on mobile (toggle .active)
  document.querySelectorAll('.flip-card').forEach(function(card){
    card.addEventListener('click', function (e) {
      // if clicked inner link, let it pass
      if (e.target.tagName.toLowerCase() === 'a') return;
      // toggle only on small screens; on desktop hover handles it
      if (window.innerWidth <= 992) {
        card.classList.toggle('active');
        // remove active after 6s to allow re-tap
        setTimeout(()=> card.classList.remove('active'), 6000);
      }
    });
  });

  // Smooth scroll for anchors
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href.length > 1 && document.querySelector(href)) {
        e.preventDefault();
        document.querySelector(href).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Simple contact form send mock
  const contactForm = document.getElementById('contactForm');
  if(contactForm){
    contactForm.addEventListener('submit', function(e){
      e.preventDefault();
      const name = contactForm.querySelector('[name=name]').value || 'Friend';
      showToast(`Thanks ${name}! We'll get back to you via email soon.`);
      contactForm.reset();
    });
  }

  // Toast
  function showToast(msg){
    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.style.position = 'fixed';
    toast.style.right = '20px';
    toast.style.bottom = '20px';
    toast.style.background = 'var(--green-dark)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 8px 24px rgba(16,24,32,0.18)';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(()=> toast.classList.add('hide'), 2400);
    setTimeout(()=> toast.remove(), 3000);
  }

});
