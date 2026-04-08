/**
 * iLARS Web — landing pages entry
 * Initializes shared nav component and landing-specific forms (email, contact)
 */
(function (global) {
  'use strict';

  function initNav() {
    if (global.ILARS_NAV && typeof global.ILARS_NAV.init === 'function') {
      global.ILARS_NAV.init();
    }
  }

  function initEmailForms() {
    var forms = document.querySelectorAll('.email-form');
    forms.forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input[type="email"]');
        var email = input && input.value ? input.value.trim() : '';
        if (email) {
          if (input) input.value = '';
          alert('Thanks! We\'ll notify you when iLARS is ready.');
        }
      });
    });
  }

  function initContactForm() {
    var contactForm = document.querySelector('.contact-form');
    if (contactForm) {
      contactForm.addEventListener('submit', function (e) {
        e.preventDefault();
        alert('Thank you for your message! We\'ll get back to you soon.');
        contactForm.reset();
      });
    }
  }

  function init() {
    initNav();
    initEmailForms();
    initContactForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
