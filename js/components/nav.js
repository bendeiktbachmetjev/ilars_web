/**
 * iLARS Web — navbar component
 * Handles scroll effect, mobile toggle, active link highlighting
 */
(function (global) {
  'use strict';

  function setActiveLink() {
    var currentPage = (global.location.pathname || '').split('/').pop() || 'index.html';
    var navLinks = document.querySelectorAll('.navbar-menu a[href]');
    navLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkPage = href.split('/').pop() || href;
      if (linkPage === currentPage || (currentPage === '' && linkPage === 'index.html')) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  function initScrollEffect() {
    var navbar = document.querySelector('.navbar');
    if (!navbar) return;
    function onScroll() {
      if (global.scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }
    global.addEventListener('scroll', onScroll);
    onScroll();
  }

  function initMobileToggle() {
    var toggle = document.querySelector('.navbar-toggle');
    var menu = document.querySelector('.navbar-menu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', function () {
      toggle.classList.toggle('active');
      menu.classList.toggle('open');
    });
    var menuLinks = menu.querySelectorAll('a');
    menuLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.classList.remove('active');
        menu.classList.remove('open');
      });
    });
  }

  function initSmoothScroll() {
    var anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href = this.getAttribute('href');
        if (href === '#') return;
        if (href && href.length > 1) {
          var target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            var navbar = document.querySelector('.navbar');
            var offsetTop = target.offsetTop - (navbar ? navbar.offsetHeight : 0);
            global.scrollTo({ top: offsetTop, behavior: 'smooth' });
          }
        }
      });
    });
  }

  /**
   * Initialize navbar behavior. Call once when DOM is ready.
   */
  function init() {
    setActiveLink();
    initScrollEffect();
    initMobileToggle();
    initSmoothScroll();
  }

  global.ILARS_NAV = { init: init, setActiveLink: setActiveLink };
})(typeof window !== 'undefined' ? window : this);
