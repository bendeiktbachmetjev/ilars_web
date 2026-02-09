/**
 * Firebase Authentication Module
 * Handles Google Sign-In for doctors
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_CONFIG;
  if (!CONFIG) {
    console.error('ILARS_CONFIG not loaded');
    return;
  }

  var AuthService = {
    /**
     * Initialize Firebase Auth
     * Must be called after Firebase SDK is loaded
     */
    init: function() {
      if (!global.firebase || !global.firebase.auth) {
        console.error('Firebase SDK not loaded');
        return false;
      }

      // Initialize Firebase if not already initialized
      try {
        // Check if Firebase is already initialized
        var apps = global.firebase.apps;
        if (!apps || apps.length === 0) {
          var firebaseConfig = global.ILARS_FIREBASE_CONFIG;
          if (!firebaseConfig) {
            console.error('Firebase config not found');
            return false;
          }
          global.firebase.initializeApp(firebaseConfig);
        }
      } catch (err) {
        // App might already be initialized, that's okay
        if (err.code !== 'app/duplicate-app') {
          console.error('Failed to initialize Firebase:', err);
          return false;
        }
      }

      this.auth = global.firebase.auth();
      this.googleProvider = new global.firebase.auth.GoogleAuthProvider();
      
      // Set additional scopes if needed
      this.googleProvider.setCustomParameters({
        prompt: 'select_account'
      });

      return true;
    },

    /**
     * Sign in with Google
     * @returns {Promise} Promise that resolves with user credential
     */
    signInWithGoogle: function() {
      if (!this.auth || !this.googleProvider) {
        return Promise.reject(new Error('Firebase Auth not initialized'));
      }

      return this.auth.signInWithPopup(this.googleProvider)
        .then(function(result) {
          // User signed in successfully
          var user = result.user;
          return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            idToken: null // Will be retrieved separately if needed
          };
        })
        .then(function(userData) {
          // Get ID token for backend verification
          return AuthService.auth.currentUser.getIdToken()
            .then(function(idToken) {
              userData.idToken = idToken;
              return userData;
            });
        });
    },

    /**
     * Sign out current user
     * @returns {Promise}
     */
    signOut: function() {
      if (!this.auth) {
        return Promise.reject(new Error('Firebase Auth not initialized'));
      }
      return this.auth.signOut();
    },

    /**
     * Get current user
     * @returns {Object|null} Current user object or null
     */
    getCurrentUser: function() {
      if (!this.auth) return null;
      return this.auth.currentUser;
    },

    /**
     * Check if user is signed in
     * @returns {boolean}
     */
    isSignedIn: function() {
      return this.getCurrentUser() !== null;
    },

    /**
     * Listen to auth state changes
     * @param {Function} callback - Callback function(user) called on auth state change
     * @returns {Function} Unsubscribe function
     */
    onAuthStateChanged: function(callback) {
      if (!this.auth) {
        console.error('Firebase Auth not initialized');
        return function() {};
      }
      return this.auth.onAuthStateChanged(callback);
    },

    /**
     * Get ID token for current user
     * @param {boolean} forceRefresh - Force token refresh
     * @returns {Promise<string>} ID token
     */
    getIdToken: function(forceRefresh) {
      if (!this.auth || !this.auth.currentUser) {
        return Promise.reject(new Error('No user signed in'));
      }
      return this.auth.currentUser.getIdToken(forceRefresh);
    }
  };

  // Export AuthService
  global.ILARS_AUTH = AuthService;
})(typeof window !== 'undefined' ? window : this);
