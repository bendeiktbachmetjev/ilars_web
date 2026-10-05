/* data/store.js — the one place that fetches and caches shared data (DESIGN-SPEC §6.2). Namespace ILARS_DATA.store
   and window.ILARS_PROFILE.

   ILARS_PROFILE()            → Promise of the ONE cached GET /doctors/me per session (today it was called 3×).
                                Sets window.ILARS_IS_LT before anything renders (fixes the deep-link race), and
                                window.ILARS_IS_COORDINATOR (study coordinators: every LT hospital, read-only).
   store.patients({include})  → Promise of ILARS_DATA.adaptList(GET /getPatients?status=all[&include=…]);
                                one cache entry per `include` value.
   store.names()              → Promise of {code: "First Last"} from Firestore (the doctor's own patients).
   store.invalidate(what)     → drops 'patients' | 'names' | 'profile' entries.
                                'patients' after create patient, change status, delete status change;
                                'names' after edit name and after create patient with a name;
                                'profile' only for the gate's needs_profile retry (ui/boot.js).
   store.api()                → the shared ApiService instance (app.js and the views use the same one).
   A rejected request is never cached: the next call asks again. */
(function (g) {
  'use strict';
  var D = g.ILARS_DATA = g.ILARS_DATA || {};
  var api = null, profileP = null, namesP = null, patientsP = {};

  /* global ApiService (class declaration in api.js: a global binding, not a window property) */
  function A() { return api || (api = new ApiService()); }
  /** Cache a promise; forget it again if it rejects. */
  function keep(p, forget) { return p.catch(function (e) { forget(); throw e; }); }

  g.ILARS_PROFILE = function () {
    if (!profileP) {
      profileP = keep(A().getDoctorProfile().then(function (r) {
        g.ILARS_IS_LT = !!(r && r.is_lithuania);
        g.ILARS_IS_COORDINATOR = !!(r && r.is_coordinator);
        return r;
      }), function () { profileP = null; });
    }
    return profileP;
  };

  D.store = {
    api: A,
    patients: function (o) {
      var include = (o && o.include) || '';
      if (!patientsP[include]) {
        patientsP[include] = keep(A().getPatients('all', include || undefined).then(D.adaptList),
          function () { delete patientsP[include]; });
      }
      return patientsP[include];
    },
    names: function () {
      if (!namesP) {
        namesP = keep(new Promise(function (resolve, reject) {
          var auth = g.ILARS_AUTH, user = auth && auth.getCurrentUser && auth.getCurrentUser();
          if (!user || !auth.db) { resolve({}); return; }
          auth.db.collection('patients').where('doctorUid', '==', user.uid).get().then(function (snap) {
            var out = {};
            snap.forEach(function (doc) {
              var d = doc.data() || {}, n = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
              if (n) out[doc.id] = n;
            });
            resolve(out);
          }, reject);
        }), function () { namesP = null; });
      }
      return namesP;
    },
    invalidate: function (what) {
      if (what === 'patients') patientsP = {};
      else if (what === 'names') namesP = null;
      else if (what === 'profile') profileP = null;
    }
  };
})(window);
