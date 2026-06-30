/**
 * Registry list — national registry table (all Lithuanian hospitals).
 * Sticky first column (patient); hospital and doctor are columns 2 and 3.
 * Every other column has two header tools: sort (⇅) and filter (☰, Excel-style
 * value picker). "Atstatyti" clears all sort/filters back to the default order
 * (own patients first, then everyone else). Names of OWN patients come from
 * Firebase; others show LIN / personal ID. Click a row to open the full form.
 */
class RegistryListView {
  constructor(api) {
    this.api = api;
    this.cached = null;
    this.names = {};
    this.studyNames = {};
    this.sort = null;          // { key, dir: 'asc'|'desc' } or null
    this.colFilters = {};      // key -> Set(allowed display values)
    this._pop = null;
    this._outsideBound = false;
    this._cols = null;
    this.colByKey = {};
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

  // ---- Column model ----
  _columns() {
    if (this._cols) return this._cols;
    const self = this;
    const cols = [
      { key: '__patient', label: 'Pacientas', sticky: true, tools: false, numeric: false,
        display: p => self._displayName(p).main, raw: p => self._displayName(p).main },
      { key: 'hospital_name', label: 'Ligoninė', tools: true, numeric: false,
        display: p => p.hospital_name || '', raw: p => p.hospital_name || '' },
      { key: '__owner', label: 'Gydytojas', tools: true, numeric: false,
        display: p => self._ownerLabel(p), raw: p => self._ownerLabel(p) },
      { key: 'personal_id_code', label: 'Asmens ID', tools: true, numeric: false,
        display: p => p.personal_id_code || '', raw: p => p.personal_id_code || '' }
    ];
    ILARS_REGISTRY.sections.forEach(s => s.fields.forEach(f => {
      const numeric = (f.type === 'int' || f.type === 'num' || f.type === 'bool');
      cols.push({
        key: f.key, label: f.label, tools: true, numeric,
        display: p => ILARS_REGISTRY.formatValue(f.key, p[f.key]),
        raw: p => numeric ? ((p[f.key] === '' || p[f.key] == null) ? null : Number(p[f.key]))
                          : ILARS_REGISTRY.formatValue(f.key, p[f.key])
      });
    }));
    cols.push({ key: 'study_patient_code', label: 'Tyrimas', tools: true, numeric: false,
      display: p => p.study_patient_code || '', raw: p => p.study_patient_code || '' });

    this._cols = cols;
    this.colByKey = {};
    cols.forEach(c => { this.colByKey[c.key] = c; });
    return cols;
  }

  _activeFilterKeys() {
    return Object.keys(this.colFilters).filter(k => this.colFilters[k] && this.colFilters[k].size);
  }

  _applyColFilters(rows) {
    const keys = this._activeFilterKeys();
    if (!keys.length) return rows;
    return rows.filter(p => keys.every(k => this.colFilters[k].has(this.colByKey[k].display(p))));
  }

  _sortRows(rows) {
    if (!this.sort || !this.sort.key) return rows;
    const col = this.colByKey[this.sort.key];
    if (!col) return rows;
    const dir = this.sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => {
      let va = col.raw(a), vb = col.raw(b);
      const ea = (va === null || va === undefined || va === '');
      const eb = (vb === null || vb === undefined || vb === '');
      if (ea && eb) return 0;
      if (ea) return 1;   // empties always last
      if (eb) return -1;
      if (col.numeric) return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'lt') * dir;
    });
  }

  // ---- Render ----
  render() {
    const wrap = document.getElementById('registry-table-wrap');
    if (!wrap) return;
    const bar = document.getElementById('registry-filters');
    if (!this.cached || this.cached.length === 0) {
      if (bar) bar.innerHTML = '';
      wrap.innerHTML = '<div class="registry-empty">Registre dar nėra pacientų. Spauskite „Sukurti pacientą“.</div>';
      return;
    }
    if (bar) {
      bar.innerHTML = `<button type="button" class="registry-export-btn" id="registry-export">⇩ Eksportuoti</button>
        <button type="button" class="registry-reset" id="registry-reset">↺ Atstatyti</button>
        <span class="registry-count" id="registry-count"></span>`;
      bar.querySelector('#registry-reset').addEventListener('click', () => {
        this.sort = null; this.colFilters = {}; this._closePopover(); this._renderTable();
      });
      const exp = bar.querySelector('#registry-export');
      exp.addEventListener('click', (e) => { e.stopPropagation(); this._openExportMenu(exp); });
    }
    this._bindOutside();
    this._renderTable();
  }

  _thHtml(c) {
    if (!c.tools) return `<th class="${c.sticky ? 'reg-sticky' : ''}">${this._esc(c.label)}</th>`;
    const sorted = this.sort && this.sort.key === c.key;
    const sortGlyph = sorted ? (this.sort.dir === 'desc' ? '↓' : '↑') : '⇅';
    const filterOn = this.colFilters[c.key] && this.colFilters[c.key].size;
    return `<th>
      <div class="reg-th">
        <span class="reg-th-label">${this._esc(c.label)}</span>
        <span class="reg-th-tools">
          <button type="button" class="reg-th-sort${sorted ? ' is-active' : ''}" data-key="${this._esc(c.key)}" title="Rūšiuoti">${sortGlyph}</button>
          <button type="button" class="reg-th-filter${filterOn ? ' is-active' : ''}" data-key="${this._esc(c.key)}" title="Filtruoti">☰</button>
        </span>
      </div>
    </th>`;
  }

  _tdHtml(c, p) {
    if (c.key === '__patient') {
      const nm = this._displayName(p);
      return `<td class="reg-sticky"><div class="reg-name-main">${this._esc(nm.main)}</div>${nm.sub ? `<div class="reg-name-sub">${this._esc(nm.sub)}</div>` : ''}</td>`;
    }
    if (c.key === 'study_patient_code') {
      return p.study_patient_code
        ? `<td><span class="reg-tag reg-tag-linked">${this._esc(p.study_patient_code)}</span></td>`
        : '<td><span class="reg-tag">—</span></td>';
    }
    const cls = (c.key === 'hospital_name' || c.key === '__owner') ? ' class="reg-owner"' : '';
    return `<td${cls}>${this._esc(c.display(p))}</td>`;
  }

  _renderTable() {
    const wrap = document.getElementById('registry-table-wrap');
    if (!wrap) return;
    const cols = this._columns();
    let rows = this._sortRows(this._applyColFilters(this.cached));

    const countEl = document.getElementById('registry-count');
    if (countEl) countEl.textContent = `Rodoma ${rows.length} iš ${this.cached.length}`;

    if (rows.length === 0) {
      wrap.innerHTML = '<div class="registry-empty">Pagal filtrą nieko nerasta.</div>';
      return;
    }

    const head = '<tr>' + cols.map(c => this._thHtml(c)).join('') + '</tr>';
    const body = rows.map(p => '<tr data-id="' + this._esc(p.id) + '">' + cols.map(c => this._tdHtml(c, p)).join('') + '</tr>').join('');
    wrap.innerHTML = `<table class="registry-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll('tbody tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-id');
        if (id) window.app.navigate('registry/' + id);
      });
    });
    wrap.querySelectorAll('.reg-th-sort').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this._toggleSort(b.getAttribute('data-key')); });
    });
    wrap.querySelectorAll('.reg-th-filter').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this._openFilter(b.getAttribute('data-key'), b); });
    });
  }

  _toggleSort(key) {
    if (!this.sort || this.sort.key !== key) this.sort = { key, dir: 'asc' };
    else if (this.sort.dir === 'asc') this.sort.dir = 'desc';
    else this.sort = null;
    this._closePopover();
    this._renderTable();
  }

  // ---- Per-column filter popover ----
  _distinct(key) {
    const col = this.colByKey[key];
    const set = new Set(this.cached.map(p => col.display(p)));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'lt'));
  }

  _openFilter(key, btn) {
    const open = this._pop && this._pop._key === key;
    this._closePopover();
    if (open) return; // toggle off
    const cur = this.colFilters[key] || null;
    const vals = this._distinct(key);
    const pop = document.createElement('div');
    pop.className = 'reg-col-pop';
    pop._key = key;
    pop.innerHTML = `
      <input type="text" class="reg-pop-search" placeholder="Ieškoti…">
      <div class="reg-pop-actions">
        <button type="button" data-act="all">Visi</button>
        <button type="button" data-act="none">Jokio</button>
      </div>
      <div class="reg-pop-list">
        ${vals.map(v => `<label class="reg-filter-opt"><input type="checkbox" value="${this._esc(v)}" ${(!cur || cur.has(v)) ? 'checked' : ''}> ${this._esc(v === '' ? '(tuščia)' : v)}</label>`).join('')}
      </div>
      <div class="reg-pop-foot">
        <button type="button" class="reg-pop-apply">Taikyti</button>
      </div>`;
    document.body.appendChild(pop);
    this._pop = pop;

    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + 'px';

    const search = pop.querySelector('.reg-pop-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      pop.querySelectorAll('.reg-pop-list .reg-filter-opt').forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().indexOf(q) === -1 ? 'none' : '';
      });
    });
    pop.querySelector('[data-act="all"]').addEventListener('click', () => {
      pop.querySelectorAll('.reg-pop-list .reg-filter-opt').forEach(opt => {
        if (opt.style.display !== 'none') opt.querySelector('input').checked = true;
      });
    });
    pop.querySelector('[data-act="none"]').addEventListener('click', () => {
      pop.querySelectorAll('.reg-pop-list .reg-filter-opt').forEach(opt => {
        if (opt.style.display !== 'none') opt.querySelector('input').checked = false;
      });
    });
    pop.querySelector('.reg-pop-apply').addEventListener('click', () => {
      const checked = Array.from(pop.querySelectorAll('.reg-pop-list input:checked')).map(i => i.value);
      if (checked.length === vals.length) delete this.colFilters[key];
      else this.colFilters[key] = new Set(checked);
      this._closePopover();
      this._renderTable();
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }

  _closePopover() {
    if (this._pop) { this._pop.remove(); this._pop = null; }
  }

  _bindOutside() {
    if (this._outsideBound) return;
    this._outsideBound = true;
    document.addEventListener('click', () => this._closePopover());
  }

  // ---- Export to Excel ----
  _ownNameOnly(p) {
    if (p.is_mine && this.names[p.id]) {
      const d = this.names[p.id];
      return [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
    }
    return '';
  }

  _exportColumns() {
    const self = this;
    const cols = [
      { h: 'Vardas Pavardė', v: p => self._ownNameOnly(p) },
      { h: 'LIN', v: p => p.lin || '' },
      { h: 'Asmens ID', v: p => p.personal_id_code || '' },
      { h: 'Ligoninė', v: p => p.hospital_name || '' },
      { h: 'Gydytojas', v: p => self._ownerLabel(p) }
    ];
    ILARS_REGISTRY.sections.forEach(s => s.fields.forEach(f => {
      cols.push({ h: f.label, v: p => ILARS_REGISTRY.formatValue(f.key, p[f.key]) });
    }));
    cols.push({ h: 'Susietas tyrimas', v: p => p.study_patient_code || '' });
    return cols;
  }

  _buildAoa(scope) {
    const cols = this._exportColumns();
    const rows = scope === 'all' ? this.cached : this._sortRows(this._applyColFilters(this.cached));
    const aoa = [cols.map(c => c.h)];
    rows.forEach(p => aoa.push(cols.map(c => c.v(p))));
    return aoa;
  }

  _ensureXlsx() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Nepavyko įkelti eksporto bibliotekos'));
      document.head.appendChild(s);
    });
  }

  async _export(scope) {
    try {
      const aoa = this._buildAoa(scope);
      await this._ensureXlsx();
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Registras');
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `registras_${scope === 'all' ? 'visi' : 'filtruoti'}_${date}.xlsx`);
    } catch (e) {
      console.error('Registry export failed', e);
      this._showError('Klaida eksportuojant: ' + (e.message || ''));
    }
  }

  _openExportMenu(btn) {
    const open = this._pop && this._pop._export;
    this._closePopover();
    if (open) return;
    const all = this.cached.length;
    const shown = this._sortRows(this._applyColFilters(this.cached)).length;
    const pop = document.createElement('div');
    pop.className = 'reg-col-pop reg-export-pop';
    pop._export = true;
    pop.innerHTML = `
      <button type="button" class="reg-export-opt" data-scope="all">Visi duomenys (${all})</button>
      <button type="button" class="reg-export-opt" data-scope="view">Tik rodomi / filtruoti (${shown})</button>`;
    document.body.appendChild(pop);
    this._pop = pop;
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + 'px';
    pop.querySelectorAll('.reg-export-opt').forEach(b => {
      b.addEventListener('click', () => { const sc = b.getAttribute('data-scope'); this._closePopover(); this._export(sc); });
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
  }

  async createPatient() {
    const btn = document.getElementById('registry-create-btn');
    if (btn) btn.disabled = true;
    try {
      const res = await this.api.createRegistryPatient();
      if (res && res.id) {
        this.cached = null;
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
