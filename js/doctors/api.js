// API service for backend communication
class ApiService {
    constructor() {
        this.baseUrl = 'https://larsbackend-production.up.railway.app';
    }

    async getPatients() {
        const response = await fetch(`${this.baseUrl}/getPatients`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    async getPatientDetail(patientCode) {
        const url = `${this.baseUrl}/getPatientDetail?patient_code=${encodeURIComponent(patientCode)}`;
        console.log('Fetching patient detail from:', url);
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }
        return await response.json();
    }
}

