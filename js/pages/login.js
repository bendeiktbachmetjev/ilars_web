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

  var roleCards = document.getElementById('login-role-cards');
  var formPatient = document.getElementById('login-form-patient');
  var formDoctor = document.getElementById('login-form-doctor');
  var backPatient = document.getElementById('login-back-patient');
  var backDoctor = document.getElementById('login-back-doctor');
  var formPatientEl = document.getElementById('form-patient');
  var btnGoogleSignIn = document.getElementById('btn-google-signin');
  var doctorLoading = document.getElementById('doctor-loading');
  var patientFormError = document.getElementById('patient-form-error');
  var doctorFormError = document.getElementById('doctor-form-error');

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
    hideError(doctorFormError);
    
    // Check if Firebase Auth is available
    if (!global.ILARS_AUTH) {
      showError(doctorFormError, 'Authentication service not available. Please refresh the page.');
      return;
    }

    // Initialize Firebase Auth if not already initialized
    if (!global.ILARS_AUTH.auth) {
      if (!global.ILARS_AUTH.init()) {
        showError(doctorFormError, 'Failed to initialize authentication. Please refresh the page.');
        return;
      }
    }

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
    if (showDoctorBtn) showDoctorBtn.addEventListener('click', showDoctorForm);
    if (backPatient) backPatient.addEventListener('click', showRoleCards);
    if (backDoctor) backDoctor.addEventListener('click', showRoleCards);
    if (formPatientEl) formPatientEl.addEventListener('submit', onPatientSubmit);
    if (btnGoogleSignIn) btnGoogleSignIn.addEventListener('click', onGoogleSignIn);
  }

  function init() {
    if (global.ILARS_NAV && typeof global.ILARS_NAV.init === 'function') {
      global.ILARS_NAV.init();
    }
    
    // Initialize Firebase Auth when Firebase SDK is loaded
    if (global.firebase && global.ILARS_AUTH) {
      // Wait a bit for Firebase to be fully ready
      setTimeout(function() {
        if (global.ILARS_AUTH.init) {
          global.ILARS_AUTH.init();
        }
      }, 100);
    }
    
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
