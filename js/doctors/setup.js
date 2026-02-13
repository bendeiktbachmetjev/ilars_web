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
  var inputDob = null;
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
    inputDob = document.getElementById('setup-dob');
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
    if (!code || !code.trim()) return Promise.resolve(null);
    code = code.trim().toUpperCase();
    return fetch(API_BASE + '/hospitals/by-code/' + encodeURIComponent(code))
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 404) {
            return { error: 'Hospital code not found or inactive' };
          }
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        if (data.status === 'ok' && data.hospital) {
          return data.hospital;
        }
        if (data.error) {
          return { error: data.error };
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function handleHospitalCodeInput() {
    if (!inputHospitalCode) return;
    var code = inputHospitalCode.value.trim().toUpperCase();
    inputHospitalCode.value = code;
    
    // Clear previous hospital selection
    if (hospitalNameGroup) hospitalNameGroup.style.display = 'none';
    if (inputHospitalId) inputHospitalId.value = '';
    if (hospitalNameDisplay) hospitalNameDisplay.value = '';
    
    if (code.length >= 8) { // Complex codes are at least 8 characters
      validateHospitalCode(code).then(function (result) {
        if (result && result.error) {
          showError(result.error);
          return;
        }
        if (result && result.id && result.name) {
          // Show hospital name and save ID
          if (inputHospitalId) inputHospitalId.value = result.id;
          if (hospitalNameDisplay) hospitalNameDisplay.value = result.name;
          if (hospitalNameGroup) hospitalNameGroup.style.display = 'block';
          showError('');
        } else if (code.length >= 12) {
          // Only show error if code is complete (12 chars)
          showError('Hospital code not found or inactive. Please check your code and try again.');
        }
      });
    } else {
      showError('');
    }
  }

  function saveProfile() {
    getElements();
    showError('');

    var firstName = inputFirstName && inputFirstName.value ? inputFirstName.value.trim() : '';
    var lastName = inputLastName && inputLastName.value ? inputLastName.value.trim() : '';
    var hospitalCode = inputHospitalCode && inputHospitalCode.value ? inputHospitalCode.value.trim().toUpperCase() : '';
    var hospitalId = inputHospitalId && inputHospitalId.value ? inputHospitalId.value.trim() : '';
    var dob = inputDob && inputDob.value ? inputDob.value.trim() : '';

    if (!hospitalCode) {
      showError('Please enter your hospital code.');
      return;
    }

    // Note: hospitalId will be resolved from hospitalCode during save
    // We validate the code exists before allowing submission

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
            throw new Error('Failed to get authentication token. Your session may have expired. Please sign in again.');
          }

          // Profile already exists (auto-created on login), we're just updating it with hospital
          var body = {
            first_name: firstName || null,
            last_name: lastName || null,
            hospital_code: hospitalCode, // Required - API resolves hospital_id
            date_of_birth: dob || null
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
          // Profile saved successfully - wait a moment for database to commit
          console.log('Profile saved successfully, verifying in database...');
          
          if (data.doctor_code) {
            showSuccess(data.doctor_code);
          }
          
          // Wait 2 seconds for database to commit, then verify
          setTimeout(function() {
            // Verify profile was saved by checking database
            if (!global.ILARS_AUTH || !global.ILARS_AUTH.getIdToken) {
              // If auth not available, redirect anyway
              global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
              global.location.href = 'doctor.html';
              return;
            }
            
            global.ILARS_AUTH.getIdToken(true).then(function(token) {
              if (!token) {
                // Token issue, but profile was saved - redirect anyway
                global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
                global.location.href = 'doctor.html';
                return;
              }
              
              // Verify profile is complete in database
              return fetch(API_BASE + '/doctors/me', {
                headers: { 'Authorization': 'Bearer ' + token }
              }).then(function(r) {
                return r.json().then(function(verifyData) {
                  return { ok: r.ok, data: verifyData };
                });
              });
            }).then(function(verifyResult) {
              if (verifyResult && verifyResult.data && verifyResult.data.status === 'ok' && !verifyResult.data.needs_profile) {
                // Profile confirmed complete in database
                console.log('Profile verified in database, redirecting to dashboard');
                global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
                global.location.href = 'doctor.html';
              } else {
                // Profile not yet complete in database, wait a bit more and retry
                console.log('Profile not yet complete, waiting...');
                setTimeout(function() {
                  global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
                  global.location.href = 'doctor.html';
                }, 2000);
              }
            }).catch(function(err) {
              console.error('Verification error:', err);
              // Even if verification fails, redirect - profile was saved
              global.sessionStorage.setItem('ilars_doctor_profile_completed', '1');
              global.location.href = 'doctor.html';
            });
          }, 2000);
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

    // Check if profile already completed
    function checkExistingProfile() {
      if (!global.ILARS_AUTH) {
        // Wait for auth to load
        setTimeout(checkExistingProfile, 200);
        return;
      }

      // Ensure Firebase Auth is initialized
      if (!global.ILARS_AUTH.auth && global.ILARS_AUTH.init) {
        if (!global.ILARS_AUTH.init()) {
          console.log('Firebase Auth initialization failed, continuing with setup');
          return;
        }
      }

      // Check if user is signed in
      if (!global.ILARS_AUTH.auth || !global.ILARS_AUTH.auth.currentUser) {
        console.log('No user signed in, continuing with setup');
        return;
      }

      if (global.ILARS_AUTH.getIdToken) {
        global.ILARS_AUTH.getIdToken(true).then(function (token) {
          if (!token) {
            console.log('No token available, continuing with setup');
            return;
          }
          return fetch(API_BASE + '/doctors/me', {
            headers: { 'Authorization': 'Bearer ' + token }
          });
        }).then(function (r) {
          if (!r) return;
          return r.json();
        }).then(function (data) {
          if (data && data.status === 'ok' && data.profile && !data.needs_profile) {
            // Profile already complete, redirect to dashboard
            global.location.href = 'doctor.html';
          }
        }).catch(function (err) {
          console.log('Profile check:', err);
          // Continue with setup if check fails
        });
      }
    }

    checkExistingProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
