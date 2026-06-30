/**
 * Registry list — national registry table (all Lithuanian hospitals).
 * Wide, horizontally scrollable table with all columns; the first column
 * (patient) is sticky. Names of OWN patients come from Firebase; for others
 * only LIN / personal ID is shown. Click a row to open the full form.
 *
 * Filter bar: free-text search across every column, multi-select by hospital
 * and by doctor (who added the record), and a "only my patients" toggle.
 */
class RegistryListView {
  constructor(api) {
    this.api = api;
    this.cached = null;
    this.names = {};        // registry id -> {firstName,lastName} (own records)
    this.studyNames = {};   // study patient_code -> "First Last" (own study patients, for link picker)
    this.filters = { search: '', hospitals: new Set(), doctors: new Set(), onlyMine: false };
    this._outsideBound = false;
  }

  _esc(s) { const d = document.createElement('div'); d.textContent = (s === null || s === undefined) ? '' : s; return d.innerHTML; }

  _fields() {
    const out = [];
    ILARS_REGISTRY.sections.forEach(s => s.fields.forEach(f => out.push(f)));
    return out;
  }

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

  // ---- Filtering ----
  _searchText(p, fields) {
    const parts = [
      this._displayName(p).main, p.lin, p.personal_id_code,
      p.hospital_name, this._ownerLabel(p), p.study_patient_code
    ];
    fields.forEach(f => parts.push(ILARS_REGISTRY.formatValue(f.key, p[f.key])));
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  _applyFilters(rows, fields) {
    const q = this.filters.search.trim().toLowerCase();
    return rows.filter(p => {
      if (this.filters.onlyMine && !p.is_mine) return false;
      if (this.filters.hospitals.size && !this.filters.hospitals.has(p.hospital_name || '')) return false;
      if (this.filters.doctors.size && !this.filters.doctors.has(this._ownerLabel(p))) return false;
      if (q && this._searchText(p, fields).indexOf(q) === -1) return false;
      return true;
    });
  }

  render() {
    const wrap = document.getElementById('registry-table-wrap');
    if (!wrap) return;

    if (!this.cached || this.cached.length === 0) {
      const filters = document.getElementById('registry-filters');
      if (filters) filters.innerHTML = '';
      wrap.innerHTML = '<div class="registry-empty">Registre dar nėra pacientų. Spauskite „Sukurti pacientą“.</div>';
      return;
    }

    this._buildFilterBar();
    this._renderTable();
  }

  _buildFilterBar() {
    const host = document.getElementById('registry-filters');
    if (!host) return;

    const hospitals = Array.from(new Set(this.cached.map(p => p.hospital_name).filter(Boolean))).sort();
    const doctors = Array.from(new Set(this.cached.map(p => this._ownerLabel(p)).filter(v => v && v !== '—'))).sort();

    host.innerHTML = `
      <input type="text" class="registry-search" id="registry-search" placeholder="Paieška pagal vardą, LIN, ID ar bet kurį stulpelį…">
      <div class="reg-filter" id="reg-filter-hospital"></div>
      <div class="reg-filter" id="reg-filter-doctor"></div>
      <label class="registry-only-mine${this.filters.onlyMine ? ' is-on' : ''}">
        <input type="checkbox" id="registry-only-mine" ${this.filters.onlyMine ? 'checked' : ''}> Tik mano
      </label>
      <button type="button" class="registry-reset" id="registry-reset">Išvalyti</button>
      <span class="registry-count" id="registry-count"></span>`;

    const search = host.querySelector('#registry-search');
    search.value = this.filters.search;
    search.addEventListener('input', () => { this.filters.search = search.value; this._renderTable(); });

    this._buildDropdown(host.querySelector('#reg-filter-hospital'), 'Ligoninė', hospitals, this.filters.hospitals);
    this._buildDropdown(host.querySelector('#reg-filter-doctor'), 'Gydytojas', doctors, this.filters.doctors);

    const mine = host.querySelector('#registry-only-mine');
    mine.addEventListener('change', () => {
      this.filters.onlyMine = mine.checked;
      mine.closest('.registry-only-mine').classList.toggle('is-on', mine.checked);
      this._renderTable();
    });

    host.querySelector('#registry-reset').addEventListener('click', () => {
      this.filters = { search: '', hospitals: new Set(), doctors: new Set(), onlyMine: false };
      this._buildFilterBar();
      this._renderTable();
    });

    if (!this._outsideBound) {
      this._outsideBound = true;
      document.addEventListener('click', (e) => {
        document.querySelectorAll('.reg-filter.is-open').forEach(el => {
          if (!el.contains(e.target)) el.classList.remove('is-open');
        });
      });
    }
  }

  _buildDropdown(host, labelBase, values, selectedSet) {
    const label = () => labelBase + (selectedSet.size ? ` (${selectedSet.size})` : '');
    host.innerHTML = `
      <button type="button" class="reg-filter-btn">${this._esc(label())} ▾</button>
      <div class="reg-filter-menu">
        ${values.length
          ? values.map(v => `<label class="reg-filter-opt"><input type="checkbox" value="${this._esc(v)}" ${selectedSet.has(v) ? 'checked' : ''}> ${this._esc(v)}</label>`).join('')
          : '<div class="reg-filter-opt" style="opacity:.6;cursor:default;">Nėra reikšmių</div>'}
      </div>`;
    const btn = host.querySelector('.reg-filter-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = host.classList.contains('is-open');
      document.querySelectorAll('.reg-filter.is-open').forEach(el => el.classList.remove('is-open'));
      host.classList.toggle('is-open', !wasOpen);
    });
    host.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedSet.add(cb.value); else selectedSet.delete(cb.value);
        btn.innerHTML = this._esc(label()) + ' ▾';
        this._renderTable();
      });
    });
  }

  _renderTable() {
    const wrap = document.getElementById('registry-table-wrap');
    if (!wrap) return;
    const fields = this._fields();
    const rows = this._applyFilters(this.cached, fields);

    const countEl = document.getElementById('registry-count');
    if (countEl) countEl.textContent = `Rodoma ${rows.length} iš ${this.cached.length}`;

    if (rows.length === 0) {
      wrap.innerHTML = '<div class="registry-empty">Pagal filtrą nieko nerasta.</div>';
      return;
    }

    const head = `
      <thead>
        <tr>
          <th class="reg-sticky">Pacientas</th>
          <th>Asmens ID</th>
          ${fields.map(f => `<th>${this._esc(f.label)}</th>`).join('')}
          <th>Ligoninė</th>
          <th>Gydytojas</th>
          <th>Tyrimas</th>
        </tr>
      </thead>`;

    const body = rows.map(p => {
      const nm = this._displayName(p);
      const nameCell = `<div class="reg-name-main">${this._esc(nm.main)}</div>${nm.sub ? `<div class="reg-name-sub">${this._esc(nm.sub)}</div>` : ''}`;
      const cells = fields.map(f => `<td>${this._esc(ILARS_REGISTRY.formatValue(f.key, p[f.key]))}</td>`).join('');
      const study = p.study_patient_code ? `<span class="reg-tag reg-tag-linked">${this._esc(p.study_patient_code)}</span>` : '<span class="reg-tag">—</span>';
      return `
        <tr data-id="${this._esc(p.id)}">
          <td class="reg-sticky">${nameCell}</td>
          <td>${this._esc(p.personal_id_code || '')}</td>
          ${cells}
          <td class="reg-owner">${this._esc(p.hospital_name || '')}</td>
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
