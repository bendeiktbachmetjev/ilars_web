/**
 * iLARS Patient Web App — configuration
 * Same API base and storage keys as main site; app can be opened as app/index.html
 */
(function (global) {
  'use strict';

  var CONFIG = {
    API_BASE_URL: 'https://larsbackend-production.up.railway.app',
    STORAGE_KEYS: {
      PATIENT_CODE: 'ilars_patient_code',
      USER_ROLE: 'ilars_user_role'
    }
  };

  global.ILARS_APP_CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : this);
