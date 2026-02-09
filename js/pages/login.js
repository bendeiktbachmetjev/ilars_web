/**
 * iLARS Web — Login page
 * Role selection (Patient / Doctor) and form handling
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_CONFIG;
  if (!CONFIG) {
    console.error('ILARS_CONFIG not loaded');
    return;
  }

  var roleCards = null;
  var formPatient = null;
  var formDoctor = null;
  var backPatient = null;
  var backDoctor = null;
  var formPatientEl = null;
  var btnGoogleSignIn = null;
  var doctorLoading = null;
  var patientFormError = null;
  var doctorFormError = null;
  
  // Get elements when DOM is ready
  function getElements() {
    roleCards = document.getElementById('login-role-cards');
    formPatient = document.getElementById('login-form-patient');
    formDoctor = document.getElementById('login-form-doctor');
    backPatient = document.getElementById('login-back-patient');
    backDoctor = document.getElementById('login-back-doctor');
    formPatientEl = document.getElementById('form-patient');
    btnGoogleSignIn = document.getElementById('btn-google-signin');
    doctorLoading = document.getElementById('doctor-loading');
    patientFormError = document.getElementById('patient-form-error');
    doctorFormError = document.getElementById('doctor-form-error');
  }

  function showRoleCards() {
    if (roleCards) {
      roleCards.classList.remove('is-hidden');
      roleCards.style.display = '';
    }
    if (formPatient) {
      formPatient.classList.remove('is-visible');
      formPatient.setAttribute('aria-hidden', 'true');
    }
    if (formDoctor) {
      formDoctor.classList.remove('is-visible');
      formDoctor.setAttribute('aria-hidden', 'true');
    }
  }

  function showPatientForm() {
    if (roleCards) {
      roleCards.classList.add('is-hidden');
      roleCards.style.display = 'none';
    }
    if (formDoctor) {
      formDoctor.classList.remove('is-visible');
      formDoctor.setAttribute('aria-hidden', 'true');
    }
    if (formPatient) {
      formPatient.classList.add('is-visible');
      formPatient.setAttribute('aria-hidden', 'false');
    }
    hideError(patientFormError);
  }

  function showDoctorForm() {
    if (roleCards) roleCards.classList.add('is-hidden');
    if (formPatient) {
      formPatient.classList.remove('is-visible');
      formPatient.setAttribute('aria-hidden', 'true');
    }
    if (formDoctor) {
      formDoctor.classList.add('is-visible');
      formDoctor.setAttribute('aria-hidden', 'false');
    }
    hideError(doctorFormError);
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || 'Something went wrong.';
    el.classList.add('is-visible');
  }

  function hideError(el) {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('is-visible');
  }

  function onPatientSubmit(e) {
    e.preventDefault();
    hideError(patientFormError);
    var input = document.getElementById('patient-code');
    var code = (input && input.value || '').trim().toUpperCase();
    if (!code) {
      showError(patientFormError, 'Please enter your patient code.');
      return;
    }
    validatePatientCode(code);
  }

  function validatePatientCode(code) {
    var url = (CONFIG.API_BASE_URL || '').replace(/\/$/, '') + '/getNextQuestionnaire';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('X-Patient-Code', code);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.status === 'ok') {
            if (CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.PATIENT_CODE) {
              try {
                global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.PATIENT_CODE, code);
                global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_ROLE, CONFIG.ROLES.PATIENT);
              } catch (err) {}
            }
            global.location.href = 'app/index.html';
            return;
          }
        } catch (err) {}
      }
      showError(patientFormError, 'Invalid patient code. Please check and try again.');
    };
    xhr.onerror = function () {
      showError(patientFormError, 'Unable to connect. Please try again later.');
    };
    xhr.send();
  }

  function onGoogleSignIn() {
    console.log('Google Sign-In button clicked');
    
    // Get elements fresh
    doctorFormError = document.getElementById('doctor-form-error');
    btnGoogleSignIn = document.getElementById('btn-google-signin');
    doctorLoading = document.getElementById('doctor-loading');
    
    hideError(doctorFormError);
    
    // Check if Firebase Auth is available
    if (!global.ILARS_AUTH) {
      console.error('ILARS_AUTH not available');
      showError(doctorFormError, 'Authentication service not available. Please refresh the page.');
      return;
    }

    // Check if Firebase SDK is loaded
    if (!global.firebase) {
      console.error('Firebase SDK not loaded');
      showError(doctorFormError, 'Firebase SDK not loaded. Please refresh the page.');
      return;
    }

    // Initialize Firebase Auth if not already initialized
    if (!global.ILARS_AUTH.auth) {
      console.log('Initializing Firebase Auth...');
      if (!global.ILARS_AUTH.init()) {
        console.error('Failed to initialize Firebase Auth');
        showError(doctorFormError, 'Failed to initialize authentication. Please refresh the page.');
        return;
      }
    }
    
    console.log('Firebase Auth ready, starting sign-in...');

    // Show loading state
    if (btnGoogleSignIn) {
      btnGoogleSignIn.disabled = true;
    }
    if (doctorLoading) {
      doctorLoading.style.display = 'flex';
    }

    // Sign in with Google
    global.ILARS_AUTH.signInWithGoogle()
      .then(function(userData) {
        // Store user info in sessionStorage
        try {
          if (CONFIG.STORAGE_KEYS) {
            global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_ROLE, CONFIG.ROLES.DOCTOR);
            global.sessionStorage.setItem('ilars_doctor_email', userData.email || '');
            global.sessionStorage.setItem('ilars_doctor_name', userData.displayName || '');
            global.sessionStorage.setItem('ilars_doctor_uid', userData.uid || '');
            // Store ID token for backend verification if needed
            if (userData.idToken) {
              global.sessionStorage.setItem('ilars_doctor_id_token', userData.idToken);
            }
          }
        } catch (err) {
          console.error('Failed to store user data:', err);
        }

        // Redirect to doctor dashboard
        global.location.href = 'doctor.html';
      })
      .catch(function(error) {
        console.error('Google Sign-In error:', error);
        
        // Hide loading state
        if (btnGoogleSignIn) {
          btnGoogleSignIn.disabled = false;
        }
        if (doctorLoading) {
          doctorLoading.style.display = 'none';
        }

        // Show user-friendly error message
        var errorMessage = 'Failed to sign in. ';
        if (error.code === 'auth/popup-closed-by-user') {
          errorMessage += 'Sign-in popup was closed.';
        } else if (error.code === 'auth/popup-blocked') {
          errorMessage += 'Popup was blocked. Please allow popups for this site.';
        } else if (error.code === 'auth/network-request-failed') {
          errorMessage += 'Network error. Please check your connection.';
        } else {
          errorMessage += 'Please try again.';
        }
        
        showError(doctorFormError, errorMessage);
      });
  }

  function bindEvents() {
    console.log('Binding events...');
    
    // Get elements again to make sure they exist
    getElements();
    
    if (roleCards) {
      var cards = roleCards.querySelectorAll('.login-role-card');
      cards.forEach(function (card) {
        card.addEventListener('click', function () {
          var role = this.getAttribute('data-role');
          if (role === 'patient') showPatientForm();
          else if (role === 'doctor') showDoctorForm();
        });
      });
    }
    var showDoctorBtn = document.getElementById('login-show-doctor');
    if (showDoctorBtn) {
      console.log('Binding showDoctorBtn');
      showDoctorBtn.addEventListener('click', showDoctorForm);
    }
    if (backPatient) backPatient.addEventListener('click', showRoleCards);
    if (backDoctor) backDoctor.addEventListener('click', showRoleCards);
    if (formPatientEl) formPatientEl.addEventListener('submit', onPatientSubmit);
    
    // Bind Google Sign-In button - use event delegation for reliability
    // This works even if the button is hidden initially
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'btn-google-signin') {
        e.preventDefault();
        e.stopPropagation();
        console.log('Google Sign-In button clicked (via delegation)');
        onGoogleSignIn();
      } else if (e.target && e.target.closest && e.target.closest('#btn-google-signin')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Google Sign-In button clicked (via delegation - child element)');
        onGoogleSignIn();
      }
    });
    
    // Also bind directly if element exists
    btnGoogleSignIn = document.getElementById('btn-google-signin');
    if (btnGoogleSignIn) {
      console.log('Binding Google Sign-In button directly', btnGoogleSignIn);
      btnGoogleSignIn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Google Sign-In button clicked (direct listener)');
        onGoogleSignIn();
      });
    } else {
      console.warn('Google Sign-In button not found, using event delegation only');
    }
    
    console.log('Events bound');
  }

  function init() {
    console.log('Login page init started');
    
    if (global.ILARS_NAV && typeof global.ILARS_NAV.init === 'function') {
      global.ILARS_NAV.init();
    }
    
    // Initialize Firebase Auth when Firebase SDK is loaded
    function initFirebase() {
      console.log('Checking Firebase availability...', {
        firebase: !!global.firebase,
        ILARS_AUTH: !!global.ILARS_AUTH,
        ILARS_FIREBASE_CONFIG: !!global.ILARS_FIREBASE_CONFIG
      });
      
      if (global.firebase && global.ILARS_AUTH && global.ILARS_FIREBASE_CONFIG) {
        try {
          var initialized = global.ILARS_AUTH.init();
          console.log('Firebase Auth initialized:', initialized);
          if (!initialized) {
            console.error('Failed to initialize Firebase Auth');
          }
        } catch (err) {
          console.error('Error initializing Firebase Auth:', err);
        }
      } else {
        console.warn('Firebase not ready yet, will retry...');
        // Retry after a short delay
        setTimeout(initFirebase, 200);
      }
    }
    
    // Try to initialize Firebase immediately
    initFirebase();
    
    bindEvents();
    console.log('Login page init completed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
