/**
 * iLARS Patient Web App — API client
 * Same endpoints and X-Patient-Code header as mobile app
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_APP_CONFIG || global.ILARS_CONFIG;
  if (!CONFIG) {
    console.error('ILARS_APP_CONFIG or ILARS_CONFIG not loaded');
    return;
  }

  var base = (CONFIG.API_BASE_URL || '').replace(/\/$/, '');

  function headers(patientCode) {
    return {
      'Content-Type': 'application/json',
      'X-Patient-Code': patientCode
    };
  }

  function getPatientCode() {
    try {
      return (global.sessionStorage && global.sessionStorage.getItem(CONFIG.STORAGE_KEYS.PATIENT_CODE)) || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * GET /getNextQuestionnaire
   * Returns { status, questionnaire_type, is_today_filled, reason }
   */
  function getNextQuestionnaire(patientCode, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'), null);
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', base + '/getNextQuestionnaire', true);
    xhr.setRequestHeader('X-Patient-Code', code);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (callback) callback(null, data);
        } catch (e) {
          if (callback) callback(e, null);
        }
      } else {
        if (callback) callback(new Error('Server ' + xhr.status), null);
      }
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'), null);
    };
    xhr.send();
  }

  /**
   * GET /getLarsData?period=weekly|monthly|yearly
   */
  function getLarsData(patientCode, period, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'), null);
      return;
    }
    var url = base + '/getLarsData?period=' + encodeURIComponent(period || 'weekly');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('X-Patient-Code', code);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (callback) callback(null, data);
        } catch (e) {
          if (callback) callback(e, null);
        }
      } else {
        if (callback) callback(new Error('Server ' + xhr.status), null);
      }
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'), null);
    };
    xhr.send();
  }

  /**
   * POST /sendDaily
   * Body: { entry_date?, bristol_scale?, food_consumption?, drink_consumption?, raw_data? }
   */
  function sendDaily(patientCode, payload, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'));
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/sendDaily', true);
    Object.keys(headers(code)).forEach(function (k) {
      xhr.setRequestHeader(k, headers(code)[k]);
    });
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (callback) callback(xhr.status >= 200 && xhr.status < 300 ? null : new Error('Server ' + xhr.status));
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'));
    };
    xhr.send(JSON.stringify(payload));
  }

  /**
   * POST /sendWeekly
   * Body: { flatus_control, liquid_stool_leakage, bowel_frequency, repeat_bowel_opening, urgency_to_toilet, entry_date?, raw_data? }
   */
  function sendWeekly(patientCode, payload, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'));
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/sendWeekly', true);
    Object.keys(headers(code)).forEach(function (k) {
      xhr.setRequestHeader(k, headers(code)[k]);
    });
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (callback) callback(xhr.status >= 200 && xhr.status < 300 ? null : new Error('Server ' + xhr.status));
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'));
    };
    xhr.send(JSON.stringify(payload));
  }

  /**
   * POST /sendMonthly
   * Body: { entry_date?, qol_score?, raw_data? }
   */
  function sendMonthly(patientCode, payload, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'));
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/sendMonthly', true);
    Object.keys(headers(code)).forEach(function (k) {
      xhr.setRequestHeader(k, headers(code)[k]);
    });
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (callback) callback(xhr.status >= 200 && xhr.status < 300 ? null : new Error('Server ' + xhr.status));
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'));
    };
    xhr.send(JSON.stringify(payload));
  }

  /**
   * POST /sendEq5d5l
   * Body: { mobility, self_care, usual_activities, pain_discomfort, anxiety_depression, health_vas?, entry_date?, raw_data? }
   */
  function sendEq5d5l(patientCode, payload, callback) {
    var code = patientCode || getPatientCode();
    if (!code) {
      if (callback) callback(new Error('No patient code'));
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', base + '/sendEq5d5l', true);
    Object.keys(headers(code)).forEach(function (k) {
      xhr.setRequestHeader(k, headers(code)[k]);
    });
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (callback) callback(xhr.status >= 200 && xhr.status < 300 ? null : new Error('Server ' + xhr.status));
    };
    xhr.onerror = function () {
      if (callback) callback(new Error('Network error'));
    };
    xhr.send(JSON.stringify(payload));
  }

  global.ILARS_APP_API = {
    getPatientCode: getPatientCode,
    getNextQuestionnaire: getNextQuestionnaire,
    getLarsData: getLarsData,
    sendDaily: sendDaily,
    sendWeekly: sendWeekly,
    sendMonthly: sendMonthly,
    sendEq5d5l: sendEq5d5l
  };
})(typeof window !== 'undefined' ? window : this);
