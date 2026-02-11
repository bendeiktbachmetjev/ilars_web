/**
 * Authentication Check Module
 * Checks if user is authenticated and redirects if not
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_CONFIG;
  if (!CONFIG) {
    console.error('ILARS_CONFIG not loaded');
    return;
  }

  var AuthCheck = {
    /**
     * Check if doctor is authenticated
     * @returns {boolean}
     */
    isDoctorAuthenticated: function() {
      try {
        var userRole = global.sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER_ROLE);
        var doctorEmail = global.sessionStorage.getItem('ilars_doctor_email');
        var hasDoctorSession = userRole === CONFIG.ROLES.DOCTOR && !!doctorEmail;
        
        // If Firebase Auth is initialized, prefer it (stronger signal).
        // IMPORTANT: only do this when ILARS_AUTH.auth exists, otherwise it will always return false
        // during the initial page load and cause unwanted redirects.
        if (global.ILARS_AUTH && global.ILARS_AUTH.auth && typeof global.ILARS_AUTH.isSignedIn === 'function') {
          return global.ILARS_AUTH.isSignedIn() && userRole === CONFIG.ROLES.DOCTOR;
        }

        // Otherwise fall back to sessionStorage (set on successful Google sign-in).
        return hasDoctorSession;
      } catch (err) {
        console.error('Auth check error:', err);
        return false;
      }
    },

    /**
     * Get current doctor info
     * @returns {Object|null}
     */
    getDoctorInfo: function() {
      try {
        return {
          email: global.sessionStorage.getItem('ilars_doctor_email') || '',
          name: global.sessionStorage.getItem('ilars_doctor_name') || '',
          uid: global.sessionStorage.getItem('ilars_doctor_uid') || ''
        };
      } catch (err) {
        return null;
      }
    },

    /**
     * Sign out doctor
     * @returns {Promise}
     */
    signOut: function() {
      return new Promise(function(resolve, reject) {
        // Clear sessionStorage
        try {
          global.sessionStorage.removeItem(CONFIG.STORAGE_KEYS.USER_ROLE);
          global.sessionStorage.removeItem('ilars_doctor_email');
          global.sessionStorage.removeItem('ilars_doctor_name');
          global.sessionStorage.removeItem('ilars_doctor_uid');
          global.sessionStorage.removeItem('ilars_doctor_id_token');
        } catch (err) {
          console.error('Failed to clear sessionStorage:', err);
        }

        // Sign out from Firebase if available
        if (global.ILARS_AUTH && global.ILARS_AUTH.signOut) {
          global.ILARS_AUTH.signOut()
            .then(function() {
              resolve();
            })
            .catch(function(err) {
              console.error('Firebase sign out error:', err);
              // Still resolve to allow redirect
              resolve();
            });
        } else {
          resolve();
        }
      });
    },

    /**
     * Require doctor authentication
     * Redirects to login if not authenticated
     */
    requireAuth: function() {
      try {
        // Allow immediately if we have a doctor session; Firebase may still be initializing.
        var userRole = global.sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER_ROLE);
        var doctorEmail = global.sessionStorage.getItem('ilars_doctor_email');
        var hasDoctorSession = userRole === CONFIG.ROLES.DOCTOR && !!doctorEmail;
        if (hasDoctorSession) return true;

        if (!this.isDoctorAuthenticated()) {
          global.location.href = 'login.html';
          return false;
        }
        return true;
      } catch (err) {
        global.location.href = 'login.html';
        return false;
      }
    }
  };

  // Export AuthCheck
  global.ILARS_AUTH_CHECK = AuthCheck;
})(typeof window !== 'undefined' ? window : this);
