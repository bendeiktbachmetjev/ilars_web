/**
 * Registry list — national registry table (all Lithuanian hospitals).
 * Wide, horizontally scrollable table with all columns; the first column
 * (patient) is sticky. Names of OWN patients come from Firebase; for others
 * only LIN / personal ID is shown. Click a row to open the full form.
 */
class RegistryListView {
  constructor(api) {
    this.api = api;
    this.cached = null;
    this.names = {};        // registry id -> {firstName,lastName} (own records)
    this.studyNames = {};   // study patient_code -> "First Last" (own study patients, for link picker)
  }

  _esc(s) { const d = document.createElement('div'); d.textContent = (s === null || s === undefined) ? '' : s; return d.innerHTML; }

  async load(force) {
    const wrap = document.getElementById('registry-table-wrap');
    const errEl = document.getElementById('registry-error');
    if (errEl) errEl.style.display = 'none';
    if (this.cached && !force) { this.render(); return; }
    if (wrap && !this.cached) wrap.innerHTML = '<div class="registry-loading">Kraunama…</div>';

    try {
      const [res] = await Promise.all([this.api.getRegistryPatients(), this._loadNames()]);
      if (res && res.status === 'ok') {
        this.cached = res.patients || [];
        this.render();
      } else {
        this._showError('Nepavyko įkelti registro.');
      }
    } catch (e) {
      console.error('Registry load failed', e);
      this._showError('Klaida įkeliant registrą: ' + (e.message || ''));
    }
  }

  async _loadNames() {
    this.names = {};
    this.studyNames = {};
    try {
      const auth = window.ILARS_AUTH;
      const user = auth && auth.getCurrentUser && auth.getCurrentUser();
      if (!user || !auth.db) return;
      const [regSnap, studySnap] = await Promise.all([
        auth.db.collection('registry_patients').where('doctorUid', '==', user.uid).get(),
        auth.db.collection('patients').where('doctorUid', '==', user.uid).get()
      ]);
      regSnap.forEach(doc => { this.names[doc.id] = doc.data(); });
      studySnap.forEach(doc => {
        const d = doc.data();
        const nm = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
        if (nm) this.studyNames[doc.id] = nm;
      });
    } catch (e) { console.error('Registry names load failed', e); }
  }

  _displayName(p) {
    if (p.is_mine && this.names[p.id]) {
      const d = this.names[p.id];
      const nm = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
      if (nm) return { main: nm, sub: p.lin || p.personal_id_code || '' };
    }
    return { main: p.lin || p.personal_id_code || '—', sub: '' };
  }

  _ownerLabel(p) {
    const f = (p.owner_first_name || '').trim();
    const l = (p.owner_last_name || '').trim();
    if (l || f) return (f ? f.charAt(0).toUpperCase() + '. ' : '') + l;
    return p.owner_doctor_code || '—';
  }

  render() {
    const wrap = document.getElementById('registry-table-wrap');
    if (!wrap) return;
    const fields = [];
    ILARS_REGISTRY.sections.forEach(s => s.fields.forEach(f => fields.push(f)));

    if (!this.cached || this.cached.length === 0) {
      wrap.innerHTML = '<div class="registry-empty">Registre dar nėra pacientų. Spauskite „Sukurti pacientą“.</div>';
      return;
    }

    const head = `
      <thead>
        <tr>
          <th class="reg-sticky">Pacientas</th>
          <th>Asmens ID</th>
          ${fields.map(f => `<th>${this._esc(f.label)}</th>`).join('')}
          <th>Gydytojas</th>
          <th>Tyrimas</th>
        </tr>
      </thead>`;

    const body = this.cached.map(p => {
      const nm = this._displayName(p);
      const nameCell = `<div class="reg-name-main">${this._esc(nm.main)}</div>${nm.sub ? `<div class="reg-name-sub">${this._esc(nm.sub)}</div>` : ''}`;
      const cells = fields.map(f => `<td>${this._esc(ILARS_REGISTRY.formatValue(f.key, p[f.key]))}</td>`).join('');
      const study = p.study_patient_code ? `<span class="reg-tag reg-tag-linked">${this._esc(p.study_patient_code)}</span>` : '<span class="reg-tag">—</span>';
      return `
        <tr data-id="${this._esc(p.id)}">
          <td class="reg-sticky">${nameCell}</td>
          <td>${this._esc(p.personal_id_code || '')}</td>
          ${cells}
          <td class="reg-owner">${this._esc(this._ownerLabel(p))}</td>
          <td>${study}</td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="registry-table">${head}<tbody>${body}</tbody></table>`;
    wrap.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-id');
        if (id) window.app.navigate('registry/' + id);
      });
    });
  }

  async createPatient() {
    const btn = document.getElementById('registry-create-btn');
    if (btn) btn.disabled = true;
    try {
      const res = await this.api.createRegistryPatient();
      if (res && res.id) {
        this.cached = null; // refresh list when we come back
        window.app.navigate('registry/' + res.id);
      }
    } catch (e) {
      console.error('Create registry patient failed', e);
      this._showError('Klaida kuriant pacientą: ' + (e.message || ''));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  _showError(msg) {
    const el = document.getElementById('registry-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
}
