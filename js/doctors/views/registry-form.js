/**
 * Registry form — large modal with the full ~110-field record, grouped into
 * collapsible sections (built from ILARS_REGISTRY). Owner can edit; other
 * doctors see it read-only. Names live in Firebase (collection registry_patients).
 */
class RegistryFormView {
  constructor(api) {
    this.api = api;
    this.record = null;
    this.isMine = false;
    this.modal = null;
    this._build();
  }

  _esc(s) { const d = document.createElement('div'); d.textContent = (s === null || s === undefined) ? '' : s; return d.innerHTML; }

  _build() {
    if (document.getElementById('registry-form-modal')) { this.modal = document.getElementById('registry-form-modal'); return; }
    const modal = document.createElement('div');
    modal.id = 'registry-form-modal';
    modal.className = 'registry-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="registry-modal-backdrop"></div>
      <div class="registry-modal-content">
        <div class="registry-modal-header">
          <div class="registry-modal-title" id="registry-form-title">Pacientas</div>
          <button type="button" class="registry-modal-close" id="registry-form-close" aria-label="Close">×</button>
        </div>
        <div class="registry-modal-scroll">
          <div class="registry-identity" id="registry-form-identity"></div>
          <div id="registry-form-sections"></div>
        </div>
        <div class="registry-modal-footer">
          <div class="registry-form-msg" id="registry-form-msg"></div>
          <div class="registry-modal-actions">
            <button type="button" class="reg-btn reg-btn-secondary" id="registry-form-cancel">Uždaryti</button>
            <button type="button" class="reg-btn reg-btn-primary" id="registry-form-save">Išsaugoti</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    this.modal = modal;

    modal.querySelector('.registry-modal-backdrop').addEventListener('click', () => this.close());
    modal.querySelector('#registry-form-close').addEventListener('click', () => this.close());
    modal.querySelector('#registry-form-cancel').addEventListener('click', () => this.close());
    modal.querySelector('#registry-form-save').addEventListener('click', () => this.save());
  }

  async open(record, isMine) {
    this.record = record || {};
    this.isMine = !!isMine;
    this._renderIdentity();
    this._renderSections();
    this._setMsg('');

    const saveBtn = this.modal.querySelector('#registry-form-save');
    saveBtn.style.display = this.isMine ? '' : 'none';

    this.modal.classList.add('is-visible');
    this.modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    await this._loadName();
  }

  close() {
    this.modal.classList.remove('is-visible');
    this.modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  _renderIdentity() {
    const r = this.record;
    const ro = this.isMine ? '' : 'disabled';
    const linkHtml = this._linkHtml();
    let nameRow = '';
    if (this.isMine) {
      nameRow = `
        <div class="reg-field">
          <label>Vardas</label>
          <input type="text" id="reg-name-first" ${ro}>
        </div>
        <div class="reg-field">
          <label>Pavardė</label>
          <input type="text" id="reg-name-last" ${ro}>
        </div>`;
    }
    this.modal.querySelector('#registry-form-identity').innerHTML = `
      <div class="reg-grid">
        ${nameRow}
        <div class="reg-field">
          <label>LIN (pseudonimizuotas)</label>
          <input type="text" id="reg-f-lin" value="${this._esc(r.lin)}" ${ro}>
        </div>
        <div class="reg-field">
          <label>Asmens ID kodas</label>
          <input type="text" id="reg-f-personal_id_code" value="${this._esc(r.personal_id_code)}" ${ro}>
        </div>
      </div>
      ${this.isMine ? `<p class="reg-gdpr">Vardas ir pavardė saugomi tik Firebase ir nepatenka į medicininę DB (GDPR pseudonimizacija).</p>` : ''}
      <div class="reg-link-row" id="reg-link-row">${linkHtml}</div>`;

    if (this.isMine) {
      const btnLink = this.modal.querySelector('#reg-link-btn');
      const btnUnlink = this.modal.querySelector('#reg-unlink-btn');
      if (btnLink) btnLink.addEventListener('click', () => this._openLinkPicker());
      if (btnUnlink) btnUnlink.addEventListener('click', () => this._unlink());
    }
  }

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

  _renderSections() {
    const ro = this.isMine ? '' : 'disabled';
    const r = this.record;
    const html = ILARS_REGISTRY.sections.map((sec, idx) => {
      const fields = sec.fields.map(f => this._fieldHtml(f, r[f.key], ro)).join('');
      return `
        <div class="reg-section ${idx === 0 ? 'is-open' : ''}">
          <button type="button" class="reg-section-head">${this._esc(sec.title)}<span class="reg-section-chevron">▾</span></button>
          <div class="reg-section-body"><div class="reg-grid">${fields}</div></div>
        </div>`;
    }).join('');
    const container = this.modal.querySelector('#registry-form-sections');
    container.innerHTML = html;
    container.querySelectorAll('.reg-section-head').forEach(head => {
      head.addEventListener('click', () => head.parentElement.classList.toggle('is-open'));
    });
  }

  _fieldHtml(f, value, ro) {
    const id = 'reg-f-' + f.key;
    const v = (value === null || value === undefined) ? '' : value;
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
    } else if (f.type === 'int' || f.type === 'num') {
      input = `<input type="number" step="${f.type === 'num' ? '0.1' : '1'}" id="${id}" value="${this._esc(v)}" ${ro}>`;
    } else {
      input = `<input type="text" id="${id}" value="${this._esc(v)}" ${ro}>`;
    }
    return `<div class="reg-field"><label for="${id}">${this._esc(f.label)}</label>${input}</div>`;
  }

  _val(key) {
    const el = this.modal.querySelector('#reg-f-' + key);
    return el ? el.value : '';
  }

  collect() {
    const data = { lin: this._val('lin'), personal_id_code: this._val('personal_id_code') };
    ILARS_REGISTRY.sections.forEach(sec => {
      sec.fields.forEach(f => { data[f.key] = this._val(f.key); });
    });
    return data;
  }

  async save() {
    if (!this.isMine || !this.record.id) return;
    const saveBtn = this.modal.querySelector('#registry-form-save');
    saveBtn.disabled = true;
    this._setMsg('Saugoma…');
    try {
      await this.api.updateRegistryPatient(this.record.id, this.collect());
      await this._saveName();
      this._setMsg('Išsaugota ✓', 'ok');
      if (window.RegistryListView) window.RegistryListView.load(true);
      setTimeout(() => this.close(), 600);
    } catch (e) {
      console.error('Registry save failed', e);
      this._setMsg('Klaida išsaugant: ' + (e.message || ''), 'err');
    } finally {
      saveBtn.disabled = false;
    }
  }

  _setMsg(text, kind) {
    const el = this.modal.querySelector('#registry-form-msg');
    el.textContent = text || '';
    el.className = 'registry-form-msg' + (kind ? ' ' + kind : '');
  }

  // ---- Firebase name (own records only) ----
  _nameDoc() {
    try {
      const auth = window.ILARS_AUTH;
      if (!auth || !auth.db || !this.record.id) return null;
      return auth.db.collection('registry_patients').doc(String(this.record.id));
    } catch (e) { return null; }
  }

  async _loadName() {
    if (!this.isMine) return;
    const doc = this._nameDoc();
    if (!doc) return;
    try {
      const snap = await doc.get();
      const data = snap.exists ? snap.data() : {};
      const first = this.modal.querySelector('#reg-name-first');
      const last = this.modal.querySelector('#reg-name-last');
      if (first) first.value = data.firstName || '';
      if (last) last.value = data.lastName || '';
      this._updateTitle(data.firstName, data.lastName);
    } catch (e) { console.error('Load registry name failed', e); }
  }

  async _saveName() {
    const doc = this._nameDoc();
    if (!doc) return;
    const first = this.modal.querySelector('#reg-name-first');
    const last = this.modal.querySelector('#reg-name-last');
    const user = window.ILARS_AUTH && window.ILARS_AUTH.getCurrentUser();
    if (!user) return;
    try {
      await doc.set({
        firstName: first ? first.value.trim() : '',
        lastName: last ? last.value.trim() : '',
        doctorUid: user.uid
      }, { merge: true });
      this._updateTitle(first ? first.value : '', last ? last.value : '');
    } catch (e) { console.error('Save registry name failed', e); }
  }

  _updateTitle(first, last) {
    const name = [first, last].filter(Boolean).join(' ').trim();
    const title = name || this.record.lin || this.record.personal_id_code || 'Pacientas';
    this.modal.querySelector('#registry-form-title').textContent = title;
  }

  // ---- Linking registry -> study ----
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
      this._showPicker('Pasirinkite tyrimo pacientą', rows, (el) => this._link(el.getAttribute('data-code')));
    } catch (e) {
      this._setMsg('Klaida: ' + (e.message || ''), 'err');
    }
  }

  async _link(code) {
    try {
      await this.api.linkRegistryToStudy(this.record.id, code);
      this.record.study_patient_code = code;
      this._closePicker();
      this._renderIdentity();
      await this._loadName();
      if (window.RegistryListView) window.RegistryListView.load(true);
    } catch (e) {
      this._setMsg('Klaida susiejant: ' + (e.message || ''), 'err');
    }
  }

  async _unlink() {
    try {
      await this.api.unlinkRegistryFromStudy(this.record.id);
      this.record.study_patient_code = null;
      this._renderIdentity();
      await this._loadName();
      if (window.RegistryListView) window.RegistryListView.load(true);
    } catch (e) {
      this._setMsg('Klaida atsiejant: ' + (e.message || ''), 'err');
    }
  }

  _showPicker(title, rowsHtml, onPick) {
    this._closePicker();
    const p = document.createElement('div');
    p.className = 'registry-picker';
    p.innerHTML = `
      <div class="registry-picker-backdrop"></div>
      <div class="registry-picker-content">
        <div class="registry-picker-title">${this._esc(title)}</div>
        <div class="registry-picker-list">${rowsHtml}</div>
        <button type="button" class="reg-btn reg-btn-secondary registry-picker-cancel">Atšaukti</button>
      </div>`;
    document.body.appendChild(p);
    this._picker = p;
    p.querySelector('.registry-picker-backdrop').addEventListener('click', () => this._closePicker());
    p.querySelector('.registry-picker-cancel').addEventListener('click', () => this._closePicker());
    p.querySelectorAll('.reg-pick-item').forEach(item => item.addEventListener('click', () => onPick(item)));
  }

  _closePicker() {
    if (this._picker) { this._picker.remove(); this._picker = null; }
  }
}
