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

  var roleWindow = null;
  var roleWindowClose = null;
  var roleCards = null;
  var formPatient = null;
  var formDoctor = null;
  var changeRolePatientBtn = null;
  var backDoctor = null;
  var formPatientEl = null;
  var btnGoogleSignIn = null;
  var doctorLoading = null;
  var patientFormError = null;
  var doctorFormError = null;

  function getElements() {
    roleWindow = document.getElementById('login-role-modal');
    roleWindowClose = document.getElementById('role-modal-close');
    roleCards = document.getElementById('login-role-cards');
    formPatient = document.getElementById('login-form-patient');
    formDoctor = document.getElementById('login-form-doctor');
    changeRolePatientBtn = document.getElementById('login-change-role-patient');
    backDoctor = document.getElementById('login-back-doctor');
    formPatientEl = document.getElementById('form-patient');
    btnGoogleSignIn = document.getElementById('btn-google-signin');
    doctorLoading = document.getElementById('doctor-loading');
    patientFormError = document.getElementById('patient-form-error');
    doctorFormError = document.getElementById('doctor-form-error');
  }

  function showRoleWindow() {
    if (roleWindow) {
      roleWindow.classList.add('is-visible');
      roleWindow.setAttribute('aria-hidden', 'false');
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
    if (roleWindow) {
      roleWindow.classList.remove('is-visible');
      roleWindow.setAttribute('aria-hidden', 'true');
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
    if (roleWindow) {
      roleWindow.classList.remove('is-visible');
      roleWindow.setAttribute('aria-hidden', 'true');
    }
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
    doctorFormError = document.getElementById('doctor-form-error');
    btnGoogleSignIn = document.getElementById('btn-google-signin');
    doctorLoading = document.getElementById('doctor-loading');
    hideError(doctorFormError);

    if (!global.ILARS_AUTH) {
      showError(doctorFormError, 'Authentication service not available. Please refresh the page.');
      return;
    }
    if (!global.firebase) {
      showError(doctorFormError, 'Firebase SDK not loaded. Please refresh the page.');
      return;
    }
    if (!global.ILARS_AUTH.auth) {
      if (!global.ILARS_AUTH.init()) {
        showError(doctorFormError, 'Failed to initialize authentication. Please refresh the page.');
        return;
      }
    }

    if (btnGoogleSignIn) btnGoogleSignIn.disabled = true;
    if (doctorLoading) doctorLoading.style.display = 'flex';

        global.ILARS_AUTH.signInWithGoogle()
      .then(function (userData) {
        try {
          if (CONFIG.STORAGE_KEYS) {
            global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_ROLE, CONFIG.ROLES.DOCTOR);
            global.sessionStorage.setItem('ilars_doctor_email', userData.email || '');
            global.sessionStorage.setItem('ilars_doctor_name', userData.displayName || '');
            global.sessionStorage.setItem('ilars_doctor_uid', userData.uid || '');
          }
        } catch (err) {}
        
        // Get fresh token after sign-in
        return global.ILARS_AUTH.getIdToken(true).then(function(token) {
          if (!token) {
            console.error('No token after Google sign-in');
            global.location.href = 'doctor-setup.html';
            return;
          }
          
          // Auto-create profile and check if hospital is assigned
          var apiBase = (CONFIG.API_BASE_URL || '').replace(/\/$/, '');
          
          console.log('Calling /doctors/me after Google sign-in...', apiBase + '/doctors/me');
          
          return fetch(apiBase + '/doctors/me', {
            method: 'GET',
            headers: { 
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            }
          }).then(function(r) {
            console.log('Response status:', r.status);
            if (!r.ok) {
              console.error('API error:', r.status, r.statusText);
              return r.text().then(function(text) {
                console.error('Error response:', text);
                throw new Error('API error: ' + r.status);
              });
            }
            return r.json();
          }).then(function(data) {
            console.log('Profile check result:', data);
            // Profile is auto-created, needs_profile means no hospital assigned
            if (data.status === 'ok' && data.needs_profile) {
              // Profile exists but no hospital - go to setup
              console.log('Profile created, hospital needed - redirecting to setup');
              global.location.href = 'doctor-setup.html';
            } else if (data.status === 'ok' && !data.needs_profile) {
              // Profile complete with hospital - go to dashboard
              console.log('Profile complete - redirecting to dashboard');
              global.location.href = 'doctor.html';
            } else {
              // Fallback to setup
              console.log('Unknown response, redirecting to setup');
              global.location.href = 'doctor-setup.html';
            }
          }).catch(function(err) {
            console.error('Profile check error:', err);
            // On error, redirect to setup page
            global.location.href = 'doctor-setup.html';
          });
        }).catch(function(err) {
          console.error('Token error:', err);
          global.location.href = 'doctor-setup.html';
        });
      })
      .catch(function (error) {
        if (btnGoogleSignIn) btnGoogleSignIn.disabled = false;
        if (doctorLoading) doctorLoading.style.display = 'none';
        var msg = 'Failed to sign in. ';
        if (error.code === 'auth/popup-closed-by-user') msg += 'Sign-in popup was closed.';
        else if (error.code === 'auth/popup-blocked') msg += 'Popup was blocked. Please allow popups.';
        else if (error.code === 'auth/network-request-failed') msg += 'Network error. Please check your connection.';
        else msg += 'Please try again.';
        showError(doctorFormError, msg);
      });
  }

  function bindEvents() {
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

    if (roleWindowClose) {
      roleWindowClose.addEventListener('click', showPatientForm);
    }
    if (changeRolePatientBtn) {
      changeRolePatientBtn.addEventListener('click', showRoleWindow);
    }
    if (backDoctor) {
      backDoctor.addEventListener('click', showRoleWindow);
    }
    if (formPatientEl) {
      formPatientEl.addEventListener('submit', onPatientSubmit);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && roleWindow && roleWindow.classList.contains('is-visible')) {
        showPatientForm();
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'btn-google-signin') {
        e.preventDefault();
        e.stopPropagation();
        onGoogleSignIn();
      } else if (e.target && e.target.closest && e.target.closest('#btn-google-signin')) {
        e.preventDefault();
        e.stopPropagation();
        onGoogleSignIn();
      }
    });

    if (btnGoogleSignIn) {
      btnGoogleSignIn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        onGoogleSignIn();
      });
    }
  }

  function init() {
    if (global.ILARS_NAV && typeof global.ILARS_NAV.init === 'function') {
      global.ILARS_NAV.init();
    }
    function initFirebase() {
      if (global.firebase && global.ILARS_AUTH && global.ILARS_FIREBASE_CONFIG) {
        try {
          global.ILARS_AUTH.init();
        } catch (err) {}
      } else {
        setTimeout(initFirebase, 200);
      }
    }
    initFirebase();
    bindEvents();
    showRoleWindow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
