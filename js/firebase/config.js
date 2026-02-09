/**
 * Firebase Configuration
 * 
 * STEP 2: After creating Firebase project, you'll need to:
 * 1. Go to Project Settings (gear icon) in Firebase Console
 * 2. Scroll down to "Your apps" section
 * 3. Click "Web" icon (</>) to add a web app
 * 4. Register your app (you can name it "iLARS Web")
 * 5. Copy the firebaseConfig object from the console
 * 6. Replace the placeholder values below with your actual config
 */
(function (global) {
  'use strict';

  // Firebase configuration from Firebase Console
  var firebaseConfig = {
    apiKey: "AIzaSyCwKHouPUDG850_HXtSvvfj2oG9p07sCtg",
    authDomain: "ilars-659bc.firebaseapp.com",
    projectId: "ilars-659bc",
    storageBucket: "ilars-659bc.firebasestorage.app",
    messagingSenderId: "493975003147",
    appId: "1:493975003147:web:aa5df66108580443c4a70e",
    measurementId: "G-T04HN6CD83"
  };

  // Export config
  global.ILARS_FIREBASE_CONFIG = firebaseConfig;
})(typeof window !== 'undefined' ? window : this);
