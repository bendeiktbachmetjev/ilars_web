/**
 * Registry detail — a full-page editing screen (route #registry/:id), NOT a popup.
 * Loads the record by id, renders identity + 9 section cards, with a floating
 * always-visible Save button. Owner can edit/delete; others see it read-only.
 * Names live in Firebase (collection registry_patients).
 */
class RegistryDetailView {
  constructor(api) {
    this.api = api;
    this.record = {};
    this.isMine = false;
    this.id = null;
    this._picker = null;
    this._firstName = '';
    this._lastName = '';
  }

  _esc(s) { const d = document.createElement('div'); d.textContent = (s === null || s === undefined) ? '' : s; return d.innerHTML; }
  _cont() { return document.getElementById('registry-detail-container'); }

  async load(id) {
    this.id = id;
    const cont = this._cont();
    if (!cont) return;
    cont.innerHTML = '<div class="registry-loading">Kraunama…</div>';
    try {
      const res = await this.api.getRegistryPatientDetail(id);
      if (res && res.status === 'ok' && res.patient) {
        this.record = res.patient;
        this.isMine = !!res.patient.is_mine;
        this.render();
        await this._loadName();
      } else {
        cont.innerHTML = '<div class="registry-empty">Įrašas nerastas.</div>';
      }
    } catch (e) {
      console.error('Registry detail load failed', e);
      cont.innerHTML = '<div class="registry-empty">Klaida įkeliant įrašą: ' + this._esc(e.message || '') + '</div>';
    }
  }

  render() {
    const cont = this._cont();
    const r = this.record;
    const ro = this.isMine ? '' : 'disabled';

    const navChips = ILARS_REGISTRY.sections.map(s =>
      `<button type="button" class="registry-nav-chip" data-sec="${s.id}">${this._esc(s.title)}</button>`
    ).join('');

    const sections = ILARS_REGISTRY.sections.map(sec => {
      const fields = sec.fields.map(f => this._fieldHtml(f, r[f.key], ro)).join('');
      return `<div class="reg-section is-open" id="sec-${sec.id}">
          <button type="button" class="reg-section-head">${this._esc(sec.title)}<span class="reg-section-chevron">▾</span></button>
          <div class="reg-section-body"><div class="reg-grid">${fields}</div></div>
        </div>`;
    }).join('');

    const nameRow = this.isMine ? `
        <div class="reg-field"><label>Vardas</label><input type="text" id="reg-name-first"></div>
        <div class="reg-field"><label>Pavardė</label><input type="text" id="reg-name-last"></div>` : '';

    cont.innerHTML = `
      <div class="registry-page-topbar">
        <button type="button" class="back-btn" id="reg-back">← Atgal į registrą</button>
        <div class="registry-page-title" id="registry-page-title">Pacientas</div>
        ${this.isMine
          ? `<button type="button" class="registry-delete-btn" id="reg-delete">Ištrinti</button>`
          : `<span class="reg-readonly-badge">Tik peržiūra</span>`}
      </div>

      <div class="registry-nav">${navChips}</div>

      <div class="registry-identity-card">
        <div class="reg-grid">
          ${nameRow}
          <div class="reg-field"><label>LIN (pseudonimizuotas)</label><input type="text" id="reg-f-lin" value="${this._esc(r.lin)}" ${ro}></div>
          <div class="reg-field"><label>Asmens ID kodas</label><input type="text" id="reg-f-personal_id_code" value="${this._esc(r.personal_id_code)}" ${ro}></div>
        </div>
        ${this.isMine ? `<p class="reg-gdpr">Vardas ir pavardė saugomi tik Firebase ir nepatenka į medicininę DB (GDPR pseudonimizacija).</p>` : ''}
        <div class="reg-link-row" id="reg-link-row">${this._linkHtml()}</div>
      </div>

      ${sections}
      <div class="registry-page-spacer"></div>
    `;

    // Floating save bar must live OUTSIDE the glassy .container: the container's
    // backdrop-filter would otherwise become the containing block for
    // position:fixed and pin the button to the container instead of the viewport.
    const view = document.getElementById('registry-detail-view');
    const oldBar = document.getElementById('registry-savebar-el');
    if (oldBar) oldBar.remove();
    if (this.isMine && view) {
      const bar = document.createElement('div');
      bar.id = 'registry-savebar-el';
      bar.className = 'registry-savebar';
      bar.innerHTML = `<span class="registry-form-msg" id="registry-form-msg"></span>
        <button type="button" class="registry-save-btn" id="reg-save">Išsaugoti</button>`;
      view.appendChild(bar);
      bar.querySelector('#reg-save').addEventListener('click', () => this.save());
    }

    cont.querySelector('#reg-back').addEventListener('click', () => window.app.navigate('list'));
    const delBtn = cont.querySelector('#reg-delete');
    if (delBtn) delBtn.addEventListener('click', () => this._confirmDelete());
    cont.querySelectorAll('.reg-section-head').forEach(h =>
      h.addEventListener('click', () => h.parentElement.classList.toggle('is-open')));
    cont.querySelectorAll('.registry-nav-chip').forEach(ch =>
      ch.addEventListener('click', () => {
        const el = document.getElementById('sec-' + ch.getAttribute('data-sec'));
        if (el) { el.classList.add('is-open'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      }));
    this._bindLink();
    this._updateTitle();

    // Auto BMI from weight + height
    ['weight_kg', 'height_cm'].forEach(k => {
      const el = document.getElementById('reg-f-' + k);
      if (el) el.addEventListener('input', () => this._recalcBmi());
    });
    this._recalcBmi();

    // Segmented buttons (bool + short selects): click to select, click again to clear.
    cont.querySelectorAll('.reg-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.closest('.reg-seg');
        const val = btn.getAttribute('data-val');
        const isSame = group.dataset.value === val;
        group.dataset.value = isSame ? '' : val;
        group.querySelectorAll('.reg-seg-btn').forEach(b => b.classList.toggle('is-on', !isSame && b === btn));
      });
    });
  }

  _fieldHtml(f, value, ro) {
    const id = 'reg-f-' + f.key;
    const v = (value === null || value === undefined) ? '' : value;

    // Few options -> segmented buttons in a row (bool, or selects with <= 6 options).
    let segOpts = null;
    if (f.type === 'bool') segOpts = [{ v: 0, l: 'Ne' }, { v: 1, l: 'Taip' }];
    else if (f.type === 'select' && f.options && f.options.length <= 6) segOpts = f.options;
    if (segOpts) {
      const btns = segOpts.map(o =>
        `<button type="button" class="reg-seg-btn${String(o.v) === String(v) ? ' is-on' : ''}" data-val="${this._esc(o.v)}" ${ro}>${this._esc(o.l)}</button>`
      ).join('');
      return `<div class="reg-field"><label>${this._esc(f.label)}</label><div class="reg-seg" id="${id}" data-value="${this._esc(v)}">${btns}</div></div>`;
    }

    let input;
    if (f.type === 'select') {
      const opts = ['<option value=""></option>'].concat(f.options.map(o =>
        `<option value="${this._esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${this._esc(o.l)}</option>`
      )).join('');
      input = `<select id="${id}" ${ro}>${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="${id}" rows="2" ${ro}>${this._esc(v)}</textarea>`;
    } else if (f.type === 'date') {
      input = `<input type="date" id="${id}" value="${this._esc(v)}" ${ro}>`;
    } else if (f.auto) {
      // Auto-computed (e.g. BMI) — read-only, filled from other fields
      input = `<input type="number" step="0.1" id="${id}" value="${this._esc(v)}" readonly class="reg-auto" title="Skaičiuojama automatiškai">`;
    } else if (f.type === 'int' || f.type === 'num') {
      input = `<input type="number" step="${f.type === 'num' ? '0.1' : '1'}" id="${id}" value="${this._esc(v)}" ${ro}>`;
    } else {
      input = `<input type="text" id="${id}" value="${this._esc(v)}" ${ro}>`;
    }
    return `<div class="reg-field"><label for="${id}">${this._esc(f.label)}</label>${input}</div>`;
  }

  _val(key) {
    const el = document.getElementById('reg-f-' + key);
    if (!el) return '';
    if (el.classList && el.classList.contains('reg-seg')) return el.dataset.value || '';
    return el.value;
  }

  _recalcBmi() {
    const bmiEl = document.getElementById('reg-f-bmi');
    if (!bmiEl) return;
    const wEl = document.getElementById('reg-f-weight_kg');
    const hEl = document.getElementById('reg-f-height_cm');
    const w = parseFloat(wEl && wEl.value);
    const h = parseFloat(hEl && hEl.value);
    if (w > 0 && h > 0) {
      const m = h / 100;
      bmiEl.value = (w / (m * m)).toFixed(1);
    }
  }

  collect() {
    const data = { lin: this._val('lin'), personal_id_code: this._val('personal_id_code') };
    ILARS_REGISTRY.sections.forEach(sec => sec.fields.forEach(f => { data[f.key] = this._val(f.key); }));
    return data;
  }

  async save() {
    if (!this.isMine || !this.id) return;
    const saveBtn = document.getElementById('reg-save');
    if (saveBtn) saveBtn.disabled = true;
    this._setMsg('Saugoma…');
    try {
      await this.api.updateRegistryPatient(this.id, this.collect());
      await this._saveName();
      this._setMsg('Išsaugota ✓', 'ok');
      if (window.RegistryListView) window.RegistryListView.cached = null;
      setTimeout(() => this._setMsg(''), 2500);
    } catch (e) {
      console.error('Registry save failed', e);
      this._setMsg('Klaida išsaugant: ' + (e.message || ''), 'err');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  _setMsg(text, kind) {
    const el = document.getElementById('registry-form-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'registry-form-msg' + (kind ? ' ' + kind : '');
    el.style.display = text ? 'inline-block' : 'none';
  }

  // ---- Delete ----
  _confirmDelete() {
    this._showOverlay(`
      <div class="registry-picker-title">Ištrinti įrašą?</div>
      <p class="registry-confirm-text">Ar tikrai norite ištrinti šį registro įrašą? Šio veiksmo atšaukti nebus galima.</p>
      <div class="registry-confirm-actions">
        <button type="button" class="reg-btn reg-btn-secondary" id="reg-del-cancel">Atšaukti</button>
        <button type="button" class="registry-delete-btn" id="reg-del-confirm">Ištrinti</button>
      </div>`);
    this._picker.querySelector('#reg-del-cancel').addEventListener('click', () => this._closeOverlay());
    this._picker.querySelector('#reg-del-confirm').addEventListener('click', () => this._doDelete());
  }

  async _doDelete() {
    try {
      await this.api.deleteRegistryPatient(this.id);
      try { const doc = this._nameDoc(); if (doc) await doc.delete(); } catch (e) { /* best effort */ }
      if (window.RegistryListView) window.RegistryListView.cached = null;
      this._closeOverlay();
      window.app.navigate('list');
    } catch (e) {
      console.error('Registry delete failed', e);
      alert('Klaida trinant: ' + (e.message || ''));
    }
  }

  // ---- Firebase name (own records) ----
  _nameDoc() {
    try {
      const auth = window.ILARS_AUTH;
      if (!auth || !auth.db || !this.id) return null;
      return auth.db.collection('registry_patients').doc(String(this.id));
    } catch (e) { return null; }
  }

  async _loadName() {
    if (!this.isMine) { this._updateTitle(); return; }
    const doc = this._nameDoc();
    if (!doc) return;
    try {
      const snap = await doc.get();
      const data = snap.exists ? snap.data() : {};
      this._firstName = data.firstName || '';
      this._lastName = data.lastName || '';
      const first = document.getElementById('reg-name-first');
      const last = document.getElementById('reg-name-last');
      if (first) first.value = this._firstName;
      if (last) last.value = this._lastName;
      this._updateTitle();
    } catch (e) { console.error('Load registry name failed', e); }
  }

  async _saveName() {
    const doc = this._nameDoc();
    if (!doc) return;
    const first = document.getElementById('reg-name-first');
    const last = document.getElementById('reg-name-last');
    const user = window.ILARS_AUTH && window.ILARS_AUTH.getCurrentUser();
    if (!user) return;
    this._firstName = first ? first.value.trim() : '';
    this._lastName = last ? last.value.trim() : '';
    try {
      await doc.set({ firstName: this._firstName, lastName: this._lastName, doctorUid: user.uid }, { merge: true });
      this._updateTitle();
    } catch (e) { console.error('Save registry name failed', e); }
  }

  _updateTitle() {
    const name = [this._firstName, this._lastName].filter(Boolean).join(' ').trim();
    const title = name || this.record.lin || this.record.personal_id_code || 'Pacientas';
    const el = document.getElementById('registry-page-title');
    if (el) el.textContent = title;
  }

  // ---- Linking registry -> study ----
  _linkHtml() {
    const code = this.record.study_patient_code;
    if (code) {
      return `<span class="reg-link-label">Susietas tyrimo pacientas:</span>
              <span class="reg-link-code">${this._esc(code)}</span>
              ${this.isMine ? `<button type="button" class="reg-btn reg-btn-link" id="reg-unlink-btn">Atsieti</button>` : ''}`;
    }
    return `<span class="reg-link-label">Tyrimo pacientas nesusietas</span>
            ${this.isMine ? `<button type="button" class="reg-btn reg-btn-link" id="reg-link-btn">Susieti su tyrimo pacientu</button>` : ''}`;
  }

  _bindLink() {
    const btnLink = document.getElementById('reg-link-btn');
    const btnUnlink = document.getElementById('reg-unlink-btn');
    if (btnLink) btnLink.addEventListener('click', () => this._openLinkPicker());
    if (btnUnlink) btnUnlink.addEventListener('click', () => this._unlink());
  }

  _refreshLinkRow() {
    const row = document.getElementById('reg-link-row');
    if (row) { row.innerHTML = this._linkHtml(); this._bindLink(); }
    if (window.RegistryListView) window.RegistryListView.cached = null;
  }

  async _openLinkPicker() {
    try {
      const res = await this.api.getLinkableStudyPatients();
      const list = (res && res.patients) || [];
      const names = (window.RegistryListView && window.RegistryListView.studyNames) || {};
      const rows = list.map(p => {
        const nm = names[p.patient_code];
        const label = nm ? `${nm} (${p.patient_code})` : p.patient_code;
        return `<button type="button" class="reg-pick-item" data-code="${this._esc(p.patient_code)}">${this._esc(label)}</button>`;
      }).join('') || '<p class="reg-empty">Nėra laisvų tyrimo pacientų.</p>';
      this._showOverlay(`<div class="registry-picker-title">Pasirinkite tyrimo pacientą</div>
        <div class="registry-picker-list">${rows}</div>
        <button type="button" class="reg-btn reg-btn-secondary" id="reg-pick-cancel">Atšaukti</button>`);
      this._picker.querySelector('#reg-pick-cancel').addEventListener('click', () => this._closeOverlay());
      this._picker.querySelectorAll('.reg-pick-item').forEach(item =>
        item.addEventListener('click', () => this._link(item.getAttribute('data-code'))));
    } catch (e) {
      this._setMsg('Klaida: ' + (e.message || ''), 'err');
    }
  }

  async _link(code) {
    try {
      await this.api.linkRegistryToStudy(this.id, code);
      this.record.study_patient_code = code;
      this._closeOverlay();
      this._refreshLinkRow();
    } catch (e) {
      this._closeOverlay();
      this._setMsg('Klaida susiejant: ' + (e.message || ''), 'err');
    }
  }

  async _unlink() {
    try {
      await this.api.unlinkRegistryFromStudy(this.id);
      this.record.study_patient_code = null;
      this._refreshLinkRow();
    } catch (e) {
      this._setMsg('Klaida atsiejant: ' + (e.message || ''), 'err');
    }
  }

  // ---- Overlay (link picker / delete confirm) ----
  _showOverlay(innerHtml) {
    this._closeOverlay();
    const p = document.createElement('div');
    p.className = 'registry-picker';
    p.innerHTML = `<div class="registry-picker-backdrop"></div>
      <div class="registry-picker-content">${innerHtml}</div>`;
    document.body.appendChild(p);
    this._picker = p;
    p.querySelector('.registry-picker-backdrop').addEventListener('click', () => this._closeOverlay());
  }

  _closeOverlay() {
    if (this._picker) { this._picker.remove(); this._picker = null; }
  }
}
