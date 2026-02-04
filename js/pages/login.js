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
  var formDoctorEl = document.getElementById('form-doctor');
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

  function onDoctorSubmit(e) {
    e.preventDefault();
    hideError(doctorFormError);
    var codeInput = document.getElementById('doctor-code');
    var passInput = document.getElementById('doctor-password');
    var code = (codeInput && codeInput.value || '').trim();
    var password = (passInput && passInput.value || '');
    if (!code || !password) {
      showError(doctorFormError, 'Please enter your credentials.');
      return;
    }
    doctorLogin(code, password);
  }

  function doctorLogin(doctorCode, password) {
    var url = (CONFIG.API_BASE_URL || '').replace(/\/$/, '') + '/doctorLogin';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.token) {
            if (CONFIG.STORAGE_KEYS && CONFIG.STORAGE_KEYS.DOCTOR_TOKEN) {
              try {
                global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.DOCTOR_TOKEN, data.token);
                global.sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER_ROLE, CONFIG.ROLES.DOCTOR);
              } catch (err) {}
            }
            global.location.href = 'doctor.html';
            return;
          }
        } catch (err) {}
      }
      showError(doctorFormError, 'Doctor login is not yet available. Use the doctor web app for now.');
    };
    xhr.onerror = function () {
      showError(doctorFormError, 'Doctor login is not yet available. Use the doctor web app for now.');
    };
    xhr.send(JSON.stringify({ doctor_code: doctorCode, password: password }));
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
    if (formDoctorEl) formDoctorEl.addEventListener('submit', onDoctorSubmit);
  }

  function init() {
    if (global.ILARS_NAV && typeof global.ILARS_NAV.init === 'function') {
      global.ILARS_NAV.init();
    }
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
