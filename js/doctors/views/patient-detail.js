// Patient detail view with charts
class PatientDetailView {
    constructor(api) {
        this.api = api;
        this.charts = {};
        this.currentCode = null;
        this.bindActions();
    }

    async load(patientCode) {
        const loadingEl = document.getElementById('patient-detail-loading');
        const errorEl = document.getElementById('patient-detail-error');
        const contentEl = document.getElementById('patient-detail-content');
        const patientCodeEl = document.getElementById('patient-detail-code');

        if (patientCodeEl) {
            patientCodeEl.textContent = patientCode;
        }
        this.currentCode = patientCode;

        if (loadingEl) loadingEl.style.display = 'block';
        if (errorEl) errorEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'none';

        try {
            const data = await this.api.getPatientDetail(patientCode);

            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'block';

            if (data.status === 'ok') {
                this.currentStatus = data.patient_status || 'active';
                this.updateStatusUI(this.currentStatus);
                this.renderCharts(data);
                this.loadStatusHistory(patientCode);
            } else {
                this.showError('Failed to load patient data: ' + (data.detail || 'Unknown error'));
            }
        } catch (error) {
            if (loadingEl) loadingEl.style.display = 'none';
            this.showError('Error loading patient data: ' + error.message);
            console.error('Full error:', error);
        }
    }

    bindActions() {
        const changeStatusSelect = document.getElementById('patient-change-status-select');
        if (changeStatusSelect && !changeStatusSelect._ilarsBound) {
            changeStatusSelect._ilarsBound = true;
            changeStatusSelect.addEventListener('change', (e) => this.setPatientStatus(e.target.value));
        }
    }

    _t(key) {
        return (window.ILARS_I18N && window.ILARS_I18N.t) ? window.ILARS_I18N.t(key) : key;
    }

    _dateLang() {
        return (window.ILARS_I18N && window.ILARS_I18N.getLang) ? window.ILARS_I18N.getLang() : 'en';
    }

    updateStatusUI(patientStatus) {
        const indicator = document.getElementById('patient-status-indicator');
        const select = document.getElementById('patient-change-status-select');
        if (!indicator || !select) return;

        const status = patientStatus || 'active';
        indicator.className = 'patient-status-badge ' + status;

        if (status === 'active') {
            indicator.textContent = this._t('doctor.status_active');
            indicator.style.background = 'var(--surface-color)'; // default active class
            indicator.style.color = '#38a169'; // default active color
        } else if (status === 'inactive') {
            indicator.textContent = this._t('doctor.status_inactive');
            indicator.style.background = 'var(--surface-color)';
            indicator.style.color = '#e53e3e';
        } else if (status === 'dead') {
            indicator.textContent = this._t('doctor.status_dead') || 'Dead';
            indicator.style.background = '#1a202c'; // dark background for dead
            indicator.style.color = '#e2e8f0';
        }

        // Keep the select showing the current status or a default 'Change status...'
        select.value = '';
    }

    async setPatientStatus(newStatus) {
        if (!this.currentCode || !this.api || !this.api.updatePatientStatus || !newStatus) return;

        const select = document.getElementById('patient-change-status-select');

        // Resolve translated status names
        let statusName = newStatus;
        if (newStatus === 'active') statusName = this._t('doctor.status_active');
        if (newStatus === 'inactive') statusName = this._t('doctor.status_inactive');
        if (newStatus === 'dead') statusName = this._t('doctor.status_dead') || 'Dead';

        let oldStatusName = this.currentStatus || 'active';
        if (oldStatusName === 'active') oldStatusName = this._t('doctor.status_active');
        if (oldStatusName === 'inactive') oldStatusName = this._t('doctor.status_inactive');
        if (oldStatusName === 'dead') oldStatusName = this._t('doctor.status_dead') || 'Dead';

        const today = new Date().toLocaleDateString(this._dateLang());
        let confirmMsg = this._t('doctor.confirm_status_change');
        if (confirmMsg && confirmMsg !== 'doctor.confirm_status_change') {
            confirmMsg = confirmMsg
                .replace('{date}', today)
                .replace('{new_status}', statusName)
                .replace('{old_status}', oldStatusName)
                // Fallback for older translations that only expected {status}
                .replace('{status}', statusName);
        } else {
            confirmMsg = `Are you sure you want to change the status from "${oldStatusName}" to "${statusName}" starting from ${today}?`;
        }

        this.showConfirmStatusModal(confirmMsg, newStatus, select);
    }

    showConfirmStatusModal(message, newStatus, selectElement) {
        const modal = document.getElementById('confirm-status-modal');
        const msgEl = document.getElementById('confirm-status-modal-message');
        const btnConfirm = document.getElementById('confirm-status-modal-confirm');
        const btnCancel = document.getElementById('confirm-status-modal-cancel');
        const btnClose = document.getElementById('confirm-status-modal-close');
        const backdrop = document.getElementById('confirm-status-modal-backdrop');

        if (!modal) {
            // fallback
            if (confirm(message)) {
                this.executeStatusChange(newStatus, selectElement);
            } else {
                if (selectElement) selectElement.value = '';
            }
            return;
        }

        msgEl.textContent = message;

        const hideModal = () => {
            modal.classList.remove('is-visible');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        const cancelHandler = () => {
            if (selectElement) selectElement.value = '';
            hideModal();
            cleanup();
        };

        const confirmHandler = () => {
            hideModal();
            cleanup();
            this.executeStatusChange(newStatus, selectElement);
        };

        const cleanup = () => {
            btnConfirm.removeEventListener('click', confirmHandler);
            btnCancel.removeEventListener('click', cancelHandler);
            if (btnClose) btnClose.removeEventListener('click', cancelHandler);
            if (backdrop) backdrop.removeEventListener('click', cancelHandler);
        };

        btnConfirm.addEventListener('click', confirmHandler);
        btnCancel.addEventListener('click', cancelHandler);
        if (btnClose) btnClose.addEventListener('click', cancelHandler);
        if (backdrop) backdrop.addEventListener('click', cancelHandler);

        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }

    async executeStatusChange(newStatus, select) {
        if (select) select.disabled = true;

        try {
            await this.api.updatePatientStatus(this.currentCode, newStatus);
            this.currentStatus = newStatus;
            this.updateStatusUI(newStatus);
            this.loadStatusHistory(this.currentCode);
        } catch (e) {
            alert('Failed to update status: ' + (e.message || 'Unknown error'));
            console.error('Update status error:', e);
            if (select) select.value = ''; // reset to placeholder
        } finally {
            if (select) select.disabled = false;
        }
    }

    navigateBackToList() {
        try {
            if (window.app && typeof window.app.navigate === 'function') {
                window.app.navigate('list');
            }
            if (window.PatientListView && typeof window.PatientListView.load === 'function') {
                window.PatientListView.isLoaded = false;
                window.PatientListView.load(true);
            }
        } catch (e) {
            console.error('Failed to navigate back to list:', e);
        }
    }

    async loadStatusHistory(patientCode) {
        const container = document.getElementById('patient-status-history-container');
        const tbody = document.getElementById('patient-status-history-tbody');
        if (!container || !tbody || !this.api.getPatientStatusHistory) return;

        try {
            const result = await this.api.getPatientStatusHistory(patientCode);
            if (result.status === 'ok' && result.history && result.history.length > 0) {
                tbody.innerHTML = '';
                result.history.forEach((item, index) => {
                    const tr = document.createElement('tr');

                    // Status Column
                    const tdNewWrap = document.createElement('td');
                    const tdNew = document.createElement('div');
                    tdNew.className = 'patient-status-badge ' + item.new_status;
                    tdNew.style.display = 'inline-block';
                    if (item.new_status === 'active') {
                        tdNew.textContent = this._t('doctor.status_active');
                    } else if (item.new_status === 'inactive') {
                        tdNew.textContent = this._t('doctor.status_inactive');
                    } else if (item.new_status === 'dead') {
                        tdNew.textContent = this._t('doctor.status_dead') || 'Dead';
                        tdNew.style.background = '#1a202c';
                        tdNew.style.color = '#e2e8f0';
                    } else {
                        tdNew.textContent = item.new_status;
                    }
                    tdNewWrap.appendChild(tdNew);
                    tr.appendChild(tdNewWrap);

                    // Date Column
                    const tdDate = document.createElement('td');
                    tdDate.className = 'date';
                    tdDate.textContent = item.changed_at ? new Date(item.changed_at).toLocaleString(this._dateLang()) : '-';
                    tr.appendChild(tdDate);

                    // Action Column (Delete button)
                    const tdAction = document.createElement('td');
                    tdAction.style.textAlign = 'right';
                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = `
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    `;
                    deleteBtn.style.cssText = 'background:transparent; border:none; color:#f87171; cursor:pointer; padding:6px; border-radius:6px; transition:all 0.2s;';
                    deleteBtn.onmouseover = () => deleteBtn.style.background = 'rgba(248, 113, 113, 0.1)';
                    deleteBtn.onmouseout = () => deleteBtn.style.background = 'transparent';

                    deleteBtn.onclick = async () => {
                        if (confirm('Are you sure you want to delete this status change?')) {
                            deleteBtn.disabled = true;
                            deleteBtn.style.opacity = '0.5';
                            try {
                                await this.api.deletePatientStatusChange(item.id);
                                // Reload page data to reflect reverted status and history
                                await this.load(this.currentCode);
                            } catch (e) {
                                alert('Failed to delete status: ' + (e.message || 'Unknown error'));
                                deleteBtn.disabled = false;
                                deleteBtn.style.opacity = '1';
                            }
                        }
                    };
                    tdAction.appendChild(deleteBtn);
                    tr.appendChild(tdAction);

                    tbody.appendChild(tr);
                });
                container.style.display = 'block';
            } else {
                container.style.display = 'none';
            }
        } catch (e) {
            console.error('Failed to load status history:', e);
            container.style.display = 'none';
        }
    }

    renderCharts(data) {
        // Destroy existing charts
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};

        // LARS Score Chart
        if (data.lars_scores && data.lars_scores.length > 0) {
            this.renderLarsChart(data.lars_scores);
        }

        // EQ-5D-5L Chart
        if (data.eq5d5l_scores && data.eq5d5l_scores.length > 0) {
            this.renderEq5d5lChart(data.eq5d5l_scores);
        }

        // Combined charts showing relationships
        if (data.lars_scores && data.daily_entries && data.lars_scores.length > 0 && data.daily_entries.length > 0) {
            this.renderLarsFoodChart(data.lars_scores, data.daily_entries);
            this.renderLarsSymptomsChart(data.lars_scores, data.daily_entries);
        }

        // Food Consumption Chart
        if (data.daily_entries && data.daily_entries.length > 0) {
            this.renderFoodChart(data.daily_entries);
        }

        // Drink Consumption Chart
        if (data.daily_entries && data.daily_entries.length > 0) {
            this.renderDrinkChart(data.daily_entries);
        }

        // Daily Steps Chart — always show, with empty state if no data
        const stepsContainer = document.getElementById('steps-chart-container');
        if (stepsContainer) {
            stepsContainer.style.display = 'block';
            if (data.daily_steps && data.daily_steps.length > 0) {
                this.renderStepsChart(data.daily_steps, data.lars_scores || []);
            } else {
                const ctx = document.getElementById('steps-chart');
                if (ctx) {
                    const parent = ctx.parentNode;
                    parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.5);font-size:15px;">' + this._t('doctor.no_steps_data') + '</div>';
                }
            }
        }
    }

    renderLarsChart(data) {
        const ctx = document.getElementById('lars-chart');
        if (!ctx) return;

        const labels = data.map(d => this.formatDateShort(d.date));
        const scores = data.map(d => d.score);

        this.charts.lars = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'LARS Score',
                    data: scores,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    spanGaps: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 42,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderEq5d5lChart(data) {
        const ctx = document.getElementById('eq5d5l-chart');
        if (!ctx) return;

        const labels = data.map(d => this.formatDateShort(d.date));
        const scores = data.map(d => d.score);

        this.charts.eq5d5l = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'EQ-5D-5L Health VAS',
                    data: scores,
                    borderColor: '#f093fb',
                    backgroundColor: 'rgba(240, 147, 251, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    spanGaps: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderFoodChart(data) {
        const ctx = document.getElementById('food-chart');
        if (!ctx) return;

        // Aggregate food consumption by date
        const labels = data.map(d => this.formatDateShort(d.date));
        const vegetables = data.map(d => d.food.vegetables_all);
        const fruits = data.map(d => d.food.fruits_with_skin + d.food.berries);
        const grains = data.map(d => d.food.whole_grains + d.food.whole_grain_bread);

        this.charts.food = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Vegetables',
                        data: vegetables,
                        backgroundColor: 'rgba(76, 175, 80, 0.6)',
                        borderColor: '#4caf50',
                        borderWidth: 1
                    },
                    {
                        label: 'Fruits',
                        data: fruits,
                        backgroundColor: 'rgba(255, 152, 0, 0.6)',
                        borderColor: '#ff9800',
                        borderWidth: 1
                    },
                    {
                        label: 'Grains',
                        data: grains,
                        backgroundColor: 'rgba(156, 39, 176, 0.6)',
                        borderColor: '#9c27b0',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderDrinkChart(data) {
        const ctx = document.getElementById('drink-chart');
        if (!ctx) return;

        const labels = data.map(d => this.formatDateShort(d.date));
        const water = data.map(d => d.drink.water);
        const coffee = data.map(d => d.drink.coffee);
        const tea = data.map(d => d.drink.tea);

        this.charts.drink = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Water',
                        data: water,
                        backgroundColor: 'rgba(33, 150, 243, 0.6)',
                        borderColor: '#2196f3',
                        borderWidth: 1
                    },
                    {
                        label: 'Coffee',
                        data: coffee,
                        backgroundColor: 'rgba(121, 85, 72, 0.6)',
                        borderColor: '#795548',
                        borderWidth: 1
                    },
                    {
                        label: 'Tea',
                        data: tea,
                        backgroundColor: 'rgba(76, 175, 80, 0.6)',
                        borderColor: '#4caf50',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderDailyMetricsChart(data) {
        const ctx = document.getElementById('daily-metrics-chart');
        if (!ctx) return;

        const labels = data.map(d => this.formatDateShort(d.date));
        const stoolCount = data.map(d => d.stool_count);
        const bloating = data.map(d => d.bloating);
        const impactScore = data.map(d => d.impact_score);

        this.charts.dailyMetrics = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Stool Count',
                        data: stoolCount,
                        borderColor: '#ff9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        borderWidth: 2,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Bloating',
                        data: bloating,
                        borderColor: '#9c27b0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                        borderWidth: 2,
                        yAxisID: 'y1',
                    },
                    {
                        label: 'Impact Score',
                        data: impactScore,
                        borderColor: '#f44336',
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        borderWidth: 2,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderLarsFoodChart(larsData, dailyData) {
        const ctx = document.getElementById('lars-food-chart');
        if (!ctx) return;

        // Create maps for LARS and daily data
        const larsMap = new Map();
        larsData.forEach(d => {
            const dateKey = d.date ? d.date.split('T')[0] : null;
            if (dateKey) {
                larsMap.set(dateKey, d.score);
            }
        });

        const dailyMap = new Map();
        dailyData.forEach(d => {
            const dateKey = d.date ? d.date.split('T')[0] : null;
            if (dateKey) {
                const totalFood = Object.values(d.food || {}).reduce((sum, val) => sum + (val || 0), 0);
                dailyMap.set(dateKey, totalFood);
            }
        });

        // Get all unique dates and sort them
        const allDates = new Set([...larsMap.keys(), ...dailyMap.keys()]);
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

        if (sortedDates.length === 0) return;

        // Create datasets - each point on its own date
        const labels = sortedDates.map(d => this.formatDateShort(d));
        const larsScores = sortedDates.map(date => larsMap.get(date) || null);
        const foodValues = sortedDates.map(date => dailyMap.get(date) || null);

        this.charts.larsFood = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'LARS Score',
                        data: larsScores,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        spanGaps: true,
                        showLine: true,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Total Food Consumption',
                        data: foodValues,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        spanGaps: true,
                        showLine: true,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += context.parsed.y;
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        max: 42,
                        title: {
                            display: true,
                            text: 'LARS Score',
                            color: 'rgba(255, 255, 255, 0.9)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Food Consumption',
                            color: 'rgba(255, 255, 255, 0.9)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderLarsSymptomsChart(larsData, dailyData) {
        const ctx = document.getElementById('lars-symptoms-chart');
        if (!ctx) return;

        // Create maps for LARS and daily data
        const larsMap = new Map();
        larsData.forEach(d => {
            const dateKey = d.date ? d.date.split('T')[0] : null;
            if (dateKey) {
                larsMap.set(dateKey, d.score);
            }
        });

        const dailyMap = new Map();
        dailyData.forEach(d => {
            const dateKey = d.date ? d.date.split('T')[0] : null;
            if (dateKey) {
                dailyMap.set(dateKey, {
                    bloating: d.bloating || 0,
                    impactScore: d.impact_score || 0,
                    stoolCount: d.stool_count || 0
                });
            }
        });

        // Get all unique dates and sort them
        const allDates = new Set([...larsMap.keys(), ...dailyMap.keys()]);
        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

        if (sortedDates.length === 0) return;

        // Create datasets - each point on its own date
        const labels = sortedDates.map(d => this.formatDateShort(d));
        const larsScores = sortedDates.map(date => larsMap.get(date) || null);
        const bloating = sortedDates.map(date => {
            const daily = dailyMap.get(date);
            return daily ? daily.bloating : null;
        });
        const impactScores = sortedDates.map(date => {
            const daily = dailyMap.get(date);
            return daily ? daily.impactScore : null;
        });

        this.charts.larsSymptoms = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'LARS Score',
                        data: larsScores,
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        spanGaps: true,
                        showLine: true,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Bloating',
                        data: bloating,
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251, 191, 36, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        spanGaps: true,
                        showLine: true,
                        yAxisID: 'y1',
                    },
                    {
                        label: 'Impact Score',
                        data: impactScores,
                        borderColor: '#f87171',
                        backgroundColor: 'rgba(248, 113, 113, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        spanGaps: true,
                        showLine: true,
                        yAxisID: 'y1',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        max: 42,
                        title: {
                            display: true,
                            text: 'LARS Score',
                            color: 'rgba(255, 255, 255, 0.9)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        max: 10,
                        title: {
                            display: true,
                            text: 'Symptoms (0-10)',
                            color: 'rgba(255, 255, 255, 0.9)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderStepsChart(stepsData, larsData) {
        const ctx = document.getElementById('steps-chart');
        if (!ctx) return;

        const labels = stepsData.map(d => this.formatDateShort(d.date));
        const steps = stepsData.map(d => d.steps);

        const larsMap = {};
        (larsData || []).forEach(d => { larsMap[d.date] = d.score; });
        const larsLine = stepsData.map(d => larsMap[d.date] !== undefined ? larsMap[d.date] : null);
        const hasLars = larsLine.some(v => v !== null);

        const datasets = [{
            label: this._t('doctor.chart_steps_label'),
            data: steps,
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'ySteps',
            order: 2,
        }];

        if (hasLars) {
            datasets.push({
                label: 'LARS Score',
                data: larsLine,
                type: 'line',
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                borderWidth: 2,
                pointRadius: 5,
                pointBackgroundColor: '#f59e0b',
                tension: 0.3,
                spanGaps: true,
                yAxisID: 'yLars',
                order: 1,
            });
        }

        const scales = {
            ySteps: {
                position: 'left',
                beginAtZero: true,
                ticks: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    callback: function (value) {
                        if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                        return value;
                    }
                },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
            },
            x: {
                ticks: { color: 'rgba(255, 255, 255, 0.7)' },
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
            },
        };

        if (hasLars) {
            scales.yLars = {
                position: 'right',
                min: 0,
                max: 42,
                ticks: { color: '#f59e0b' },
                grid: { drawOnChartArea: false },
                title: {
                    display: true,
                    text: 'LARS',
                    color: '#f59e0b',
                },
            };
        }

        this.charts.steps = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: 'rgba(255, 255, 255, 0.9)',
                            font: { size: 14 },
                        },
                    },
                },
                scales,
            },
        });
    }

    showError(message) {
        const errorEl = document.getElementById('patient-detail-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
    }

    formatDateShort(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString(this._dateLang(), { month: 'short', day: 'numeric' });
    }
}

// PatientDetailView will be initialized by App when needed

