// API service for backend communication
class ApiService {
    constructor() {
        const config = window.ILARS_CONFIG || {};
        this.baseUrl = (config.API_BASE_URL || 'https://larsbackend-production.up.railway.app').replace(/\/$/, '');
    }

    async getAuthToken() {
        if (!window.ILARS_AUTH || !window.ILARS_AUTH.getIdToken) {
            throw new Error('Authentication not available');
        }
        return await window.ILARS_AUTH.getIdToken(true);
    }

    async getPatients() {
        const token = await this.getAuthToken();
        const response = await fetch(`${this.baseUrl}/getPatients`, {
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

