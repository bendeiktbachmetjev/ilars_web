/**
 * Doctor setup/registration page
 * Handles hospital code entry and profile completion
 * Hospital can only be assigned through code - no manual selection
 */
(function (global) {
  'use strict';

  var CONFIG = global.ILARS_CONFIG;
  if (!CONFIG) {
    console.error('ILARS_CONFIG not loaded');
    return;
  }

  var API_BASE = (CONFIG.API_BASE_URL || '').replace(/\/$/, '');
  var form = null;
  var inputFirstName = null;
  var inputLastName = null;
  var inputHospitalCode = null;
  var inputHospitalId = null;
  var hospitalNameDisplay = null;
  var hospitalNameGroup = null;
  var btnSubmit = null;
  var btnText = null;
  var btnLoading = null;
  var errorEl = null;
  var successEl = null;
  var doctorCodeDisplay = null;

  function getElements() {
    form = document.getElementById('setup-form');
    inputFirstName = document.getElementById('setup-first-name');
    inputLastName = document.getElementById('setup-last-name');
    inputHospitalCode = document.getElementById('setup-hospital-code');
    inputHospitalId = document.getElementById('setup-hospital-id');
    hospitalNameDisplay = document.getElementById('setup-hospital-name-display');
    hospitalNameGroup = document.getElementById('setup-hospital-name-group');
    btnSubmit = document.getElementById('setup-submit');
    btnText = document.getElementById('setup-btn-text');
    btnLoading = document.getElementById('setup-btn-loading');
    errorEl = document.getElementById('setup-error');
    successEl = document.getElementById('setup-success');
    doctorCodeDisplay = document.getElementById('doctor-code-display');
  }

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg || '';
      errorEl.classList.toggle('is-visible', !!msg);
    }
  }

  function showSuccess(doctorCode) {
    if (successEl) {
      successEl.classList.add('is-visible');
      if (doctorCodeDisplay && doctorCode) {
        doctorCodeDisplay.textContent = doctorCode;
      }
    }
  }

  function setLoading(isLoading) {
    if (btnSubmit) btnSubmit.disabled = isLoading;
    if (btnText) btnText.style.display = isLoading ? 'none' : 'block';
    if (btnLoading) btnLoading.style.display = isLoading ? 'flex' : 'none';
  }

  function prefillFromGoogle() {
    var name = global.sessionStorage.getItem('ilars_doctor_name') || '';
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

  function validateHospitalCode(code) {
    if (!code || !code.trim()) {
      console.log('validateHospitalCode: empty code');
      return Promise.resolve(null);
    }
    code = code.trim().toUpperCase();
    
    // Validate code format - should be alphanumeric, no special chars
    if (!/^[A-Z0-9]+$/.test(code)) {
      console.log('validateHospitalCode: invalid code format', code);
      return Promise.resolve({ error: 'Invalid code format. Use only letters and numbers.' });
    }
    
    var url = API_BASE + '/hospitals/by-code/' + encodeURIComponent(code);
    console.log('Validating hospital code:', code, 'URL:', url);
    
    return fetch(url)
      .then(function (r) {
        console.log('Hospital code validation response:', r.status);
        if (!r.ok) {
          if (r.status === 404) {
            return { error: 'Hospital code not found or inactive' };
          }
          return r.text().then(function(text) {
            console.error('Hospital code validation error:', text);
            return { error: 'Failed to validate hospital code' };
          });
        }
        return r.json();
      })
      .then(function (data) {
        console.log('Hospital code validation result:', data);
        if (data.status === 'ok' && data.hospital) {
          console.log('Hospital found:', data.hospital.name);
          return data.hospital;
        }
        if (data.error) {
          return { error: data.error };
        }
        return null;
      })
      .catch(function (err) {
        console.error('Hospital code validation exception:', err);
        return { error: 'Failed to validate hospital code' };
      });
  }

  function handleHospitalCodeInput() {
    if (!inputHospitalCode) return;
    var code = inputHospitalCode.value.trim().toUpperCase();
    
    // Validate code format before processing
    if (code && !/^[A-Z0-9]+$/.test(code)) {
      console.log('Invalid characters in hospital code:', code);
      showError('Invalid code format. Use only letters and numbers.');
      return;
    }
    
    inputHospitalCode.value = code;
    
    // Clear previous hospital selection
    if (hospitalNameGroup) hospitalNameGroup.style.display = 'none';
    if (inputHospitalId) inputHospitalId.value = '';
    if (hospitalNameDisplay) hospitalNameDisplay.value = '';
    showError(''); // Clear errors when user types
    
    if (code.length >= 8) { // Complex codes are at least 8 characters
      console.log('Validating hospital code:', code);
      validateHospitalCode(code).then(function (result) {
        if (result && result.error) {
          console.log('Hospital code validation error:', result.error);
          showError(result.error);
          return;
        }
        if (result && result.id && result.name) {
          // Show hospital name and save ID
          console.log('Hospital code validated successfully:', result.name);
          if (inputHospitalId) inputHospitalId.value = result.id;
          if (hospitalNameDisplay) hospitalNameDisplay.value = result.name;
          if (hospitalNameGroup) hospitalNameGroup.style.display = 'block';
          showError(''); // Clear any previous errors
        } else if (code.length >= 12) {
          // Only show error if code is complete (12 chars)
          console.log('Hospital code not found after full validation');
          showError('Hospital code not found or inactive. Please check your code and try again.');
        }
      });
    } else if (code.length > 0) {
      console.log('Hospital code too short:', code.length);
    }
  }

  function saveProfile() {
    getElements();
    showError('');

    var firstName = inputFirstName && inputFirstName.value ? inputFirstName.value.trim() : '';
    var lastName = inputLastName && inputLastName.value ? inputLastName.value.trim() : '';
    var hospitalCode = inputHospitalCode && inputHospitalCode.value ? inputHospitalCode.value.trim().toUpperCase() : '';
    var hospitalId = inputHospitalId && inputHospitalId.value ? inputHospitalId.value.trim() : '';

    if (!hospitalCode) {
      showError('Please enter your hospital code.');
      return;
    }

    // Validate hospital code exists before submission
    if (!inputHospitalId || !inputHospitalId.value) {
      showError('Please enter a valid hospital code. The code will be validated when you submit.');
      return;
    }

    setLoading(true);

    // Ensure Firebase Auth is initialized
    if (!global.ILARS_AUTH) {
      showError('Authentication service not available. Please refresh the page.');
      setLoading(false);
      setTimeout(function() {
        global.location.href = 'login.html';
      }, 2000);
      return;
    }

    if (!global.ILARS_AUTH.auth) {
      if (global.ILARS_AUTH.init) {
        if (!global.ILARS_AUTH.init()) {
          showError('Failed to initialize authentication. Please refresh the page.');
          setLoading(false);
          setTimeout(function() {
            global.location.href = 'login.html';
          }, 2000);
          return;
        }
      } else {
        showError('Authentication not initialized. Please refresh the page.');
        setLoading(false);
        setTimeout(function() {
          global.location.href = 'login.html';
        }, 2000);
        return;
      }
    }

    // Check if user is signed in - wait a bit for auth to initialize
    function attemptSave() {
      if (!global.ILARS_AUTH.auth) {
        // Try to initialize if not done yet
        if (global.ILARS_AUTH.init) {
          global.ILARS_AUTH.init();
        }
        // Wait a bit and retry
        setTimeout(function() {
          if (!global.ILARS_AUTH.auth || !global.ILARS_AUTH.auth.currentUser) {
            showError('Please wait while we verify your session...');
            setTimeout(attemptSave, 500);
            return;
          }
          attemptSave();
        }, 500);
        return;
      }

      if (!global.ILARS_AUTH.auth.currentUser) {
        showError('You are not signed in. Please go back and sign in with Google.');
        setLoading(false);
        setTimeout(function() {
          global.location.href = 'login.html';
        }, 2000);
        return;
      }

      // Get fresh token (force refresh)
      global.ILARS_AUTH.getIdToken(true)
        .then(function (token) {
          if (!token) {
            console.error('No token received from getIdToken');
            throw new Error('Failed to get authentication token. Your session may have expired. Please sign in again.');
          }
          
          console.log('Got token, length:', token.length, 'First 20 chars:', token.substring(0, 20));

          // Profile already exists (auto-created on login), we're just updating it with hospital
          var body = {
            first_name: firstName || null,
            last_name: lastName || null,
            hospital_code: hospitalCode
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
            if (!r.ok) {
              var errorMsg = data.detail || 'Failed to save profile';
              if (r.status === 401) {
                errorMsg = 'Session expired. Please sign in again.';
              }
              throw new Error(errorMsg);
            }
            return data;
          });
        })
        .then(function (data) {
          // Profile saved successfully - redirect immediately
          console.log('Profile saved successfully, redirecting to dashboard...');
          
          // Mark profile as completed
          global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
          
          // Redirect immediately to dashboard
          global.location.href = 'doctor.html';
        })
        .catch(function (err) {
          console.error('Save profile error:', err);
          var errorMsg = err.message || 'Failed to save. Please try again.';
          
          // Handle token-related errors
          if (errorMsg.includes('token') || errorMsg.includes('expired') || errorMsg.includes('401') || 
              errorMsg.includes('No user signed in') || errorMsg.includes('session')) {
            errorMsg = 'Your session has expired. Please refresh the page and sign in again.';
            showError(errorMsg);
            setLoading(false);
            setTimeout(function() {
              global.location.href = 'login.html';
            }, 3000);
            return;
          }
          
          showError(errorMsg);
          setLoading(false);
        });
    }

    attemptSave();
  }

  function init() {
    getElements();
    if (!form) return;

    prefillFromGoogle();

    if (inputHospitalCode) {
      inputHospitalCode.addEventListener('input', handleHospitalCodeInput);
      inputHospitalCode.addEventListener('blur', handleHospitalCodeInput);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      saveProfile();
    });

    // Ensure profile exists and check if hospital is already assigned
    function ensureProfileExists() {
      if (!global.ILARS_AUTH || !CONFIG) {
        setTimeout(ensureProfileExists, 200);
        return;
      }

      // Ensure Firebase Auth is initialized
      if (!global.ILARS_AUTH.auth && global.ILARS_AUTH.init) {
        if (!global.ILARS_AUTH.init()) {
          setTimeout(ensureProfileExists, 200);
          return;
        }
      }

      // Wait for auth state
      setTimeout(function() {
        if (!global.ILARS_AUTH.auth || !global.ILARS_AUTH.auth.currentUser) {
          console.log('No user signed in, waiting...');
          setTimeout(ensureProfileExists, 500);
          return;
        }

        // Call /doctors/me to auto-create profile if needed
        // Use forceRefresh to get fresh token
        if (global.ILARS_AUTH.getIdToken) {
          global.ILARS_AUTH.getIdToken(true).then(function (token) {
            if (!token) {
              console.error('No token available - cannot create profile');
              return;
            }
            
            console.log('Got token for /doctors/me, length:', token.length, 'First 20 chars:', token.substring(0, 20));
            console.log('Calling /doctors/me to ensure profile exists...', API_BASE + '/doctors/me');
            
            return fetch(API_BASE + '/doctors/me', {
              method: 'GET',
              headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              }
            }).then(function (r) {
              console.log('Response status:', r.status);
              if (!r.ok) {
                console.error('API error:', r.status, r.statusText);
                return r.text().then(function(text) {
                  console.error('Error response:', text);
                  throw new Error('API error: ' + r.status);
                });
              }
              return r.json();
            }).then(function (data) {
              console.log('Profile check result:', data);
              if (data && data.status === 'ok') {
                console.log('Profile exists or was created successfully');
                if (data.profile && !data.needs_profile) {
                  // Profile complete with hospital - redirect to dashboard
                  console.log('Profile complete, redirecting to dashboard');
                  global.location.href = 'doctor.html';
                } else {
                  // Profile exists but no hospital - continue with setup
                  console.log('Profile exists, hospital needed');
                  // Prefill form if data available
                  if (data.profile) {
                    prefillFromGoogle();
                  }
                }
              }
            }).catch(function (err) {
              console.error('Profile check error:', err);
              // Continue with setup if check fails - don't redirect
            });
          }).catch(function (err) {
            console.error('Token error:', err);
            // Continue with setup - don't redirect
          });
        } else {
          console.error('getIdToken function not available');
        }
      }, 500);
    }

    ensureProfileExists();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
