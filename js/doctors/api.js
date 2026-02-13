// API service for backend communication
class ApiService {
    constructor() {
        const config = window.ILARS_CONFIG || {};
        this.baseUrl = (config.API_BASE_URL || 'https://larsbackend-production.up.railway.app').replace(/\/$/, '');
    }

    async getAuthToken() {
        // Delegate auth state checks to ILARS_AUTH and global auth-check logic.
        // Here we only ensure the helper exists and request a fresh token.
        if (!window.ILARS_AUTH || !window.ILARS_AUTH.getIdToken) {
            throw new Error('Authentication not available');
        }
        return await window.ILARS_AUTH.getIdToken(true);
    }

    async getPatients(status = 'active') {
        const token = await this.getAuthToken();
        const url = status ? `${this.baseUrl}/getPatients?status=${encodeURIComponent(status)}` : `${this.baseUrl}/getPatients`;
        const response = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return await response.json();
    }

    async createPatient() {
        const token = await this.getAuthToken();
        const response = await fetch(`${this.baseUrl}/createPatient`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create patient. HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return await response.json();
    }

    async updatePatientStatus(patientCode, status, statusReason = null) {
        const token = await this.getAuthToken();
        const response = await fetch(`${this.baseUrl}/updatePatientStatus`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                patient_code: patientCode,
                status: status,
                status_reason: statusReason
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update status. HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return await response.json();
    }

    async getPatientDetail(patientCode) {
        const token = await this.getAuthToken();
        const url = `${this.baseUrl}/getPatientDetail?patient_code=${encodeURIComponent(patientCode)}`;
        console.log('Fetching patient detail from:', url);
        const response = await fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return await response.json();
    }
}

