/**
 * iLARS Web — global configuration
 * Central place for API base URL and app constants
 */
(function (global) {
  'use strict';

  var CONFIG = {
    /** Backend API base URL (used by login, patient and doctor dashboards) */
    API_BASE_URL: 'https://larsbackend-production.up.railway.app',

    /** Storage keys for session/localStorage */
    STORAGE_KEYS: {
      PATIENT_CODE: 'ilars_patient_code',
      DOCTOR_TOKEN: 'ilars_doctor_token',
      USER_ROLE: 'ilars_user_role'
    },

    /** Supported user roles */
    ROLES: {
      PATIENT: 'patient',
      DOCTOR: 'doctor'
    }
  };

  global.ILARS_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : this);
