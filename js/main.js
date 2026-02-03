// iLARS Landing — navigation, form handling, smooth scroll

(function () {
  'use strict';

  // Active page highlight
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  var navLinks = document.querySelectorAll('.navbar-menu a');
  navLinks.forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // Navbar scroll effect
  var navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  }

  // Mobile menu toggle
  var toggle = document.querySelector('.navbar-toggle');
  var menu = document.querySelector('.navbar-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      toggle.classList.toggle('active');
      menu.classList.toggle('open');
    });

    // Close menu when clicking a link
    var menuLinks = menu.querySelectorAll('a');
    menuLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.classList.remove('active');
        menu.classList.remove('open');
      });
    });
  }

  // Smooth scroll for anchor links (only on same page)
  var anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (href === '#') return;
      
      // Only handle if it's a same-page anchor
      if (href.startsWith('#')) {
        var target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          var navbar = document.querySelector('.navbar');
          var offsetTop = target.offsetTop - (navbar ? navbar.offsetHeight : 0);
          window.scrollTo({
            top: offsetTop,
            behavior: 'smooth'
          });
        }
      }
    });
  });

  // Email forms: prevent default, log or send to backend later
  var forms = document.querySelectorAll('.email-form');
  forms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var email = input && input.value ? input.value.trim() : '';
      if (email) {
        // TODO: send to your backend / mailing service
        console.log('Email submitted:', email);
        if (input) input.value = '';
        alert('Thanks! We\'ll notify you when iLARS is ready.');
      }
    });
  });

  // Contact form
  var contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      // TODO: send to backend
      console.log('Contact form submitted');
      alert('Thank you for your message! We\'ll get back to you soon.');
      contactForm.reset();
    });
  }
})();
