// API service for backend communication.
// Every request has a 20 s timeout (AbortController). Every thrown error carries
//   .status  HTTP status; 0 for a network failure or the timeout
//   .detail  the JSON body's `detail`, else the status text (timeout: doctor.ui.common.timeout)
// The error message text is the same as before (views may still show it). DESIGN-SPEC §6.2.
class ApiService {
    constructor() {
        const config = window.ILARS_CONFIG || {};
        this.baseUrl = (config.API_BASE_URL || 'https://larsbackend-production.up.railway.app').replace(/\/$/, '');
    }

    async getAuthToken() {
        // Delegate auth state checks to ILARS_AUTH and global auth-check logic.
        // Firebase refreshes the token by itself shortly before it expires, so no forced refresh here.
        if (!window.ILARS_AUTH || !window.ILARS_AUTH.getIdToken) {
            throw new Error('Authentication not available');
        }
        return await window.ILARS_AUTH.getIdToken();
    }

    /**
     * fetch with the auth header, the timeout and error objects that carry .status and .detail.
     * prefix: text before "HTTP …" in the error message; withText: append the response body to the message.
     */
    async _request(url, init = {}, prefix = '', withText = true) {
        const token = await this.getAuthToken();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ApiService.TIMEOUT_MS);
        const headers = Object.assign({ 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, init.headers);
        try {
            const response = await fetch(url, Object.assign({}, init, { headers, signal: ctrl.signal }));
            if (response.ok) return await response.json();
            const errorText = await response.text();
            let detail = response.statusText;
            try {
                const body = JSON.parse(errorText);
                if (body && body.detail != null) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
            } catch (e) { /* not JSON: keep the status text */ }
            const err = new Error(`${prefix}HTTP ${response.status}: ${response.statusText}${withText ? '. ' + errorText : ''}`);
            err.status = response.status;
            err.detail = detail;
            throw err;
        } catch (e) {
            if (e && e.status != null) throw e;
            if (e && e.name === 'AbortError') {
                const msg = window.ILARS_UI.t('doctor.ui.common.timeout');
                const err = new Error(msg);
                err.status = 0;
                err.detail = msg;
                throw err;
            }
            // network failure (TypeError "Failed to fetch") or a body that is not JSON
            e.status = 0;
            e.detail = e.message;
            throw e;
        } finally {
            clearTimeout(timer);
        }
    }

    /** GET /doctors/me — used only by ILARS_PROFILE() (data/store.js), which caches it for the session. */
    getDoctorProfile() {
        return this._request(`${this.baseUrl}/doctors/me`, {}, '', false);
    }

    /** status: 'active' | 'inactive' | 'all'; include: e.g. 'lars_history' (API v2, sent only when asked). */
    getPatients(status = 'active', include) {
        const q = [];
        if (status) q.push('status=' + encodeURIComponent(status));
        if (include) q.push('include=' + encodeURIComponent(include));
        return this._request(`${this.baseUrl}/getPatients${q.length ? '?' + q.join('&') : ''}`);
    }

    createPatient() {
        return this._request(`${this.baseUrl}/createPatient`, { method: 'POST' }, 'Failed to create patient. ');
    }

    updatePatientStatus(patientCode, status, statusReason = null) {
        return this._request(`${this.baseUrl}/updatePatientStatus`, {
            method: 'POST',
            body: JSON.stringify({
                patient_code: patientCode,
                status: status,
                status_reason: statusReason
            })
        }, 'Failed to update status. ');
    }

    getPatientDetail(patientCode) {
        return this._request(`${this.baseUrl}/getPatientDetail?patient_code=${encodeURIComponent(patientCode)}`);
    }

    getPatientStatusHistory(patientCode) {
        return this._request(`${this.baseUrl}/getPatientStatusHistory?patient_code=${encodeURIComponent(patientCode)}`);
    }

    deletePatientStatusChange(historyId) {
        return this._request(`${this.baseUrl}/deletePatientStatusChange`, {
            method: 'POST',
            body: JSON.stringify({
                history_id: historyId
            })
        }, 'Failed to delete status. ');
    }

    // ---- Registry (Lithuanian colorectal cancer registry) ----

    _get(path) {
        return this._request(`${this.baseUrl}${path}`);
    }

    _post(path, body) {
        return this._request(`${this.baseUrl}${path}`, { method: 'POST', body: JSON.stringify(body || {}) });
    }

    getRegistryPatients() { return this._get('/getRegistryPatients'); }
    getRegistryPatientDetail(id) { return this._get(`/getRegistryPatientDetail?id=${encodeURIComponent(id)}`); }
    createRegistryPatient() { return this._post('/createRegistryPatient', {}); }
    updateRegistryPatient(id, data) { return this._post('/updateRegistryPatient', { id, data }); }
    deleteRegistryPatient(id) { return this._post('/deleteRegistryPatient', { id }); }
    linkRegistryToStudy(registryId, patientCode) { return this._post('/linkRegistryToStudy', { registry_id: registryId, patient_code: patientCode }); }
    unlinkRegistryFromStudy(registryId) { return this._post('/unlinkRegistryFromStudy', { registry_id: registryId }); }
    getLinkableStudyPatients() { return this._get('/getLinkableStudyPatients'); }
    getLinkableRegistryPatients() { return this._get('/getLinkableRegistryPatients'); }
}
ApiService.TIMEOUT_MS = 20000;
