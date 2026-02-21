/**
 * Doctor profile modal - shown when doctor has not completed profile
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_CONFIG;
  if (!CONFIG) return;

  var API_BASE = (CONFIG.API_BASE_URL || '').replace(/\/$/, '');
  var modal = null;
  var form = null;
  var selectHospital = null;
  var inputFirstName = null;
  var inputLastName = null;
  var btnSave = null;
  var errorEl = null;

  function getElements() {
    modal = document.getElementById('doctor-profile-modal');
    form = document.getElementById('doctor-profile-form');
    selectHospital = document.getElementById('doctor-profile-hospital');
    inputFirstName = document.getElementById('doctor-profile-first-name');
    inputLastName = document.getElementById('doctor-profile-last-name');
    btnSave = document.getElementById('doctor-profile-save');
    errorEl = document.getElementById('doctor-profile-error');
  }

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg || '';
      errorEl.style.display = msg ? 'block' : 'none';
    }
  }

  function showModal() {
    getElements();
    if (modal) {
      modal.classList.add('is-visible');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }

  function hideModal() {
    getElements();
    if (modal) {
      modal.classList.remove('is-visible');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('modal-open');
    }
  }

  function loadHospitals() {
    return fetch(API_BASE + '/hospitals')
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load hospitals');
        return r.json();
      })
      .then(function (data) {
        if (data.status !== 'ok' || !data.hospitals) return;
        if (!selectHospital) return;
        selectHospital.innerHTML = '<option value="">Select hospital</option>';
        data.hospitals.forEach(function (h) {
          var opt = document.createElement('option');
          opt.value = h.id;
          opt.textContent = h.name;
          selectHospital.appendChild(opt);
        });
      })
      .catch(function (err) {
        console.error('Load hospitals error:', err);
      });
  }

  function prefillFromGoogle() {
    var name = global.sessionStorage.getItem('ilars_doctor_name') || '';
    var email = global.sessionStorage.getItem('ilars_doctor_email') || '';
    if (name && inputFirstName && inputLastName) {
      var parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        inputLastName.value = parts.pop();
        inputFirstName.value = parts.join(' ');
      } else {
        inputFirstName.value = name;
      }
    }
  }

  function saveProfile() {
    getElements();
    showError('');

    var hospitalId = selectHospital && selectHospital.value ? selectHospital.value.trim() : '';
    var firstName = inputFirstName && inputFirstName.value ? inputFirstName.value.trim() : '';
    var lastName = inputLastName && inputLastName.value ? inputLastName.value.trim() : '';

    if (!hospitalId) {
      showError('Please select your hospital.');
      return;
    }

    if (btnSave) btnSave.disabled = true;

    global.ILARS_AUTH.getIdToken(true)
      .then(function (token) {
        var body = {
          email: global.sessionStorage.getItem('ilars_doctor_email') || '',
          first_name: firstName || null,
          last_name: lastName || null,
          hospital_id: hospitalId || null
        };

        return fetch(API_BASE + '/doctors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.detail || 'Failed to save profile');
          return data;
        });
      })
      .then(function () {
        global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
        hideModal();
        if (typeof global.ILARS_DOCTOR_PROFILE_SAVED === 'function') {
          global.ILARS_DOCTOR_PROFILE_SAVED();
        }
      })
      .catch(function (err) {
        showError(err.message || 'Failed to save. Please try again.');
      })
      .finally(function () {
        if (btnSave) btnSave.disabled = false;
      });
  }

  function init() {
    getElements();
    if (!modal || !form) return;

    loadHospitals().then(prefillFromGoogle);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveProfile();
    });

    if (btnSave) {
      btnSave.addEventListener('click', function (e) {
        e.preventDefault();
        saveProfile();
      });
    }

    var btnClose = document.getElementById('doctor-profile-close');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        hideModal();
      });
    }

    modal.addEventListener('click', function (e) {
      if (e.target === modal) hideModal();
    });
  }

  global.ILARS_DOCTOR_PROFILE = {
    show: showModal,
    hide: hideModal,
    init: init
  };
})(typeof window !== 'undefined' ? window : this);
