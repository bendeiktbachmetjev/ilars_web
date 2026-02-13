// Patient list view
class PatientListView {
    constructor(api) {
        this.api = api;
        this.isLoaded = false;
        this.cachedData = null;
        this.createButton = document.getElementById('btn-create-patient');
        this.bindCreateButton();
    }

    async load(forceReload = false) {
        const errorEl = document.getElementById('patient-list-error');
        const tableEl = document.getElementById('patients-table');
        const tbodyEl = document.getElementById('patients-tbody');

        // If already loaded and not forcing reload, use cached data
        if (this.isLoaded && !forceReload && this.cachedData) {
            if (errorEl) errorEl.style.display = 'none';
            this.renderTables(this.cachedData, tbodyEl, tableEl);
            return;
        }

        // Show skeleton loader only on first load
        if (!this.isLoaded) {
            this.showSkeletonLoader(tbodyEl, tableEl);
        }
        if (errorEl) errorEl.style.display = 'none';

        try {
            const [activeData, inactiveData] = await Promise.all([
                this.api.getPatients('active'),
                this.api.getPatients('inactive')
            ]);

            if (errorEl) errorEl.style.display = 'none';

            if (activeData.status === 'ok' && activeData.patients) {
                this.cachedData = {
                    patients: activeData.patients,
                    inactivePatients: (inactiveData.status === 'ok' && inactiveData.patients) ? inactiveData.patients : []
                };
                this.isLoaded = true;
                this.renderTables(this.cachedData, tbodyEl, tableEl);
            } else {
                this.showError('Failed to load patients: ' + (activeData.detail || 'Unknown error'));
            }
        } catch (error) {
            const errorMsg = error.message || 'Unknown error';
            this.showError('Error loading patients: ' + errorMsg);
            console.error('Full error:', error);
        }
    }

    bindCreateButton() {
        if (!this.createButton || this.createButton._ilarsBound) {
            return;
        }
        this.createButton._ilarsBound = true;
        this.createButton.addEventListener('click', () => {
            this.handleCreatePatient();
        });
    }

    async handleCreatePatient() {
        if (!this.api || !this.api.createPatient) {
            this.showError('Create patient API not available.');
            return;
        }

        const errorEl = document.getElementById('patient-list-error');
        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        }

        const btn = this.createButton;
        const originalText = btn ? btn.textContent : '';

        try {
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Creating...';
            }

            const data = await this.api.createPatient();

            const code = data && data.patient_code ? data.patient_code : 'Unknown';
            // Simple, clear feedback with patient code
            alert('New patient created. Patient code: ' + code);

            // Force reload list to include new patient
            this.isLoaded = false;
            await this.load(true);
        } catch (error) {
            const msg = error.message || 'Failed to create patient.';
            this.showError(msg);
            console.error('Create patient error:', error);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || 'Create patient';
            }
        }
    }

    showSkeletonLoader(tbodyEl, tableEl) {
        // Show table with skeleton rows
        tableEl.style.display = 'table';
        tbodyEl.innerHTML = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton-cell" style="width: 80%;"></div></td>
                <td><div class="skeleton-cell" style="width: 60%;"></div></td>
                <td><div class="skeleton-cell" style="width: 40%;"></div></td>
                <td><div class="skeleton-cell" style="width: 40%;"></div></td>
                <td><div class="skeleton-cell" style="width: 70%;"></div></td>
                <td><div class="skeleton-cell" style="width: 70%;"></div></td>
            </tr>
        `).join('');
    }

    renderTables(data, tbodyEl, tableEl) {
        const inactiveTbodyEl = document.getElementById('patients-inactive-tbody');
        const inactiveTableEl = document.getElementById('patients-inactive-table');
        const inactiveSectionEl = document.getElementById('patients-inactive-section');

        this.renderTable(data.patients, tbodyEl, tableEl, true);
        if (inactiveTbodyEl && inactiveTableEl && inactiveSectionEl) {
            const inactiveList = data.inactivePatients || [];
            if (inactiveList.length > 0) {
                inactiveSectionEl.style.display = 'block';
                this.renderTable(inactiveList, inactiveTbodyEl, inactiveTableEl, false);
            } else {
                inactiveSectionEl.style.display = 'none';
            }
        }
    }

    renderTable(patients, tbodyEl, tableEl, isActive) {
        if (!patients || patients.length === 0) {
            tbodyEl.innerHTML = '<tr><td colspan="7" class="empty">No patients found</td></tr>';
            tableEl.style.display = 'table';
        } else {
            tbodyEl.innerHTML = patients.map(patient => {
                // Format LARS score with date and color class
                let larsDisplay = '-';
                let larsClass = '';
                if (patient.last_lars_score !== null && patient.last_lars_score !== undefined) {
                    const larsScore = patient.last_lars_score;
                    const larsDate = this.formatDate(patient.last_lars_date);
                    
                    if (larsScore <= 20) {
                        larsClass = 'good';
                    } else if (larsScore <= 29) {
                        larsClass = 'warning';
                    } else {
                        larsClass = 'bad';
                    }
                    
                    larsDisplay = `${larsScore}${larsDate ? ` <span class="date-part">(${larsDate})</span>` : ''}`;
                }
                
                // Format EQ-5D-5L score with date and color class
                let eq5d5lDisplay = '-';
                let eq5d5lClass = '';
                if (patient.last_eq5d5l_score !== null && patient.last_eq5d5l_score !== undefined) {
                    const eq5d5lScore = patient.last_eq5d5l_score;
                    const eq5d5lDate = this.formatDate(patient.last_eq5d5l_date);
                    
                    if (eq5d5lScore >= 70) {
                        eq5d5lClass = 'good';
                    } else if (eq5d5lScore >= 50) {
                        eq5d5lClass = 'warning';
                    } else {
                        eq5d5lClass = 'bad';
                    }
                    
                    eq5d5lDisplay = `${eq5d5lScore}${eq5d5lDate ? ` <span class="date-part">(${eq5d5lDate})</span>` : ''}`;
                }

                // Format doctor display name: first initial + last name, or fallback to doctor_code
                let doctorDisplay = '-';
                const firstName = (patient.doctor_first_name || '').trim();
                const lastName = (patient.doctor_last_name || '').trim();
                if (lastName || firstName) {
                    const initial = firstName ? (firstName.charAt(0).toUpperCase() + '.') : '';
                    doctorDisplay = (initial ? initial + ' ' : '') + lastName;
                } else if (patient.doctor_code) {
                    doctorDisplay = patient.doctor_code;
                }
                
                return `
                    <tr onclick="window.app.navigate('patient/${this.escapeHtml(patient.patient_code)}')">
                        <td class="patient-code">${this.escapeHtml(patient.patient_code)}</td>
                        <td class="date">${this.formatDate(patient.created_at)}</td>
                        <td class="count">${patient.weekly_count}</td>
                        <td class="count">${patient.monthly_count}</td>
                        <td class="score ${larsClass}">${larsDisplay}</td>
                        <td class="score ${eq5d5lClass}">${eq5d5lDisplay}</td>
                        <td class="doctor-cell">${this.escapeHtml(doctorDisplay)}</td>
                    </tr>
                `;
            }).join('');
            tableEl.style.display = 'table';
        }
    }

    showError(message) {
        const errorEl = document.getElementById('patient-list-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    formatDate(dateString) {
        if (!dateString) return null;
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// PatientListView will be initialized by App when needed

