// Main application router
class App {
    constructor() {
        this.api = new ApiService();
        this.currentView = null;
        this.init();
    }

    init() {
        // Handle hash changes for routing
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    }

    handleRoute() {
        const hash = window.location.hash.slice(1);
        const [route, ...params] = hash.split('/');

        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
            view.style.display = 'none';
        });

        switch(route) {
            case 'patient':
                if (params[0]) {
                    this.showPatientDetail(params[0]);
                } else {
                    this.showPatientList();
                }
                break;
            case '':
            case 'list':
            default:
                this.showPatientList();
                break;
        }
    }

    showPatientList() {
        const view = document.getElementById('patient-list-view');
        if (view) {
            view.classList.add('active');
            view.style.display = 'block';
            // Initialize PatientListView if not exists
            if (!window.PatientListView && this.api) {
                window.PatientListView = new PatientListView(this.api);
            }
            if (window.PatientListView) {
                window.PatientListView.load();
            }
        }
    }

    showPatientDetail(patientCode) {
        const view = document.getElementById('patient-detail-view');
        if (view) {
            view.classList.add('active');
            view.style.display = 'block';
            // Initialize PatientDetailView if not exists
            if (!window.PatientDetailView && this.api) {
                window.PatientDetailView = new PatientDetailView(this.api);
            }
            if (window.PatientDetailView) {
                window.PatientDetailView.load(patientCode);
            }
        }
    }

    navigate(path) {
        window.location.hash = path;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

