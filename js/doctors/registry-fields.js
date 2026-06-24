/**
 * Registry field definitions — single source of truth for the registry table
 * AND the registry form. Lithuanian colorectal cancer registry.
 *
 * Each field: { key, label, type, options? }
 *   type: 'text' | 'textarea' | 'date' | 'int' | 'num' | 'select'
 *   options (for 'select'): [{ v: <stored value>, l: <Lithuanian label> }]
 *
 * Stored values match the DB CHECK constraints in migration_registry_patients.sql.
 */
(function (global) {
  'use strict';

  var YESNO = [{ v: 0, l: 'Ne' }, { v: 1, l: 'Taip' }];
  function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push({ v: i, l: String(i) }); return o; }
  function opts(arr) { return arr.map(function (x) { return { v: x, l: x }; }); }

  var SECTIONS = [
    {
      id: 'demographics',
      title: 'Demografija ir bazinė informacija',
      fields: [
        { key: 'birth_date', label: 'Gimimo data', type: 'date' },
        { key: 'sex', label: 'Lytis', type: 'select', options: [{ v: 0, l: 'Moteris' }, { v: 1, l: 'Vyras' }] },
        { key: 'diagnosis_date', label: 'Diagnozės data', type: 'date' },
        { key: 'index_operation_date', label: 'Operacijos data (index)', type: 'date' },
        { key: 'age_at_diagnosis', label: 'Amžius diagnozės metu', type: 'int' },
        { key: 'height_cm', label: 'Ūgis, cm', type: 'int' },
        { key: 'weight_kg', label: 'Svoris, kg', type: 'num' },
        { key: 'bmi', label: 'KMI', type: 'num' },
        { key: 'asa_score', label: 'ASA score', type: 'select', options: range(1, 5) },
        { key: 'ecog', label: 'ECOG', type: 'select', options: range(0, 4) },
        { key: 'family_crc_history', label: 'Šeiminė CRC anamnezė', type: 'select', options: YESNO },
        { key: 'diabetes', label: 'Cukrinis diabetas', type: 'select', options: YESNO },
        { key: 'cardiovascular_disease', label: 'Širdies kraujagyslių ligos', type: 'select', options: YESNO },
        { key: 'glucocorticoid_use', label: 'Gliukokortikoidų vartojimas', type: 'select', options: YESNO },
        { key: 'cea_pre_treatment', label: 'CEA prieš gydymą, ng/ml', type: 'num' },
        { key: 'prehabilitation', label: 'Prehabilitation', type: 'select', options: YESNO }
      ]
    },
    {
      id: 'staging',
      title: 'MRT / klinikinis stadijavimas',
      fields: [
        { key: 'mri_date', label: 'MRT atlikimo data', type: 'date' },
        { key: 'ct', label: 'cT', type: 'select', options: opts(['cT1', 'cT2', 'cT3', 'cT4a', 'cT4b']) },
        { key: 'cn', label: 'cN', type: 'select', options: opts(['cN0', 'cN1', 'cN2']) },
        { key: 'cm', label: 'cM', type: 'select', options: opts(['cM0', 'cM1']) },
        { key: 'clinical_stage', label: 'Klinikinė stadija', type: 'select', options: opts(['I', 'II', 'III', 'IV']) },
        { key: 'emvi', label: 'EMVI', type: 'select', options: YESNO },
        { key: 'mrf', label: 'MRF (mesorectal fascia)', type: 'select', options: [{ v: 0, l: 'Laisvas' }, { v: 1, l: 'Grėsmė' }, { v: 2, l: 'Invazija' }] },
        { key: 'tumor_distance_anus_cm', label: 'Naviko lokacija nuo išangės, cm', type: 'num' },
        { key: 'tumor_distance_arj_cm', label: 'Naviko lokacija nuo ARJ, cm', type: 'num' },
        { key: 'sphincter_invasion', label: 'Naviko augimas į sfinkterį', type: 'select', options: YESNO },
        { key: 'circumferential', label: 'Cirkuliarumas', type: 'select', options: [{ v: 0, l: 'Ne' }, { v: 1, l: '<50%' }, { v: 2, l: '>50%' }] },
        { key: 'mesorectal_ln_mri', label: 'Mesorektaliniai l/m (MRI)', type: 'select', options: [{ v: 0, l: 'Neigiami' }, { v: 1, l: 'Teigiami' }] }
      ]
    },
    {
      id: 'neoadjuvant',
      title: 'Neoadjuvantinis gydymas',
      fields: [
        { key: 'nct', label: 'Neoadjuvantinis gydymas (nCT)', type: 'select', options: YESNO },
        { key: 'nct_start_date', label: 'nCT pradžios data', type: 'date' },
        { key: 'nct_end_date', label: 'nCT pabaigos data', type: 'date' },
        { key: 'nct_scheme', label: 'nCT schema', type: 'select', options: opts(['CAPOX', 'FOLFOX', 'FOLFIRI', 'kita']) },
        { key: 'nct_cycles', label: 'nCT ciklų skaičius', type: 'int' },
        { key: 'nrt_start_date', label: 'nRT pradžios data', type: 'date' },
        { key: 'nrt_end_date', label: 'nRT pabaigos data', type: 'date' },
        { key: 'nrt_dose_gy', label: 'nRT dozė, Gy', type: 'num' },
        { key: 'new_mts_after_neoadj', label: 'Naujos MTS po neoadj. gyd.', type: 'select', options: YESNO },
        { key: 'mrtrg', label: 'mrTRG', type: 'select', options: range(1, 5) }
      ]
    },
    {
      id: 'surgery',
      title: 'Operacija',
      fields: [
        { key: 'operation_date', label: 'Operacijos data', type: 'date' },
        { key: 'operation_type', label: 'Operacijos tipas', type: 'select', options: opts(['LAR', 'APR', 'Hartmann', 'TaTME', 'PME', 'kita']) },
        { key: 'operation_approach', label: 'Operacijos būdas', type: 'select', options: [{ v: 1, l: 'Atvira' }, { v: 2, l: 'Laparoskopinė' }, { v: 3, l: 'Robotinė' }] },
        { key: 'conversion', label: 'Konversija', type: 'select', options: YESNO },
        { key: 'operation_duration_min', label: 'Operacijos trukmė, min.', type: 'int' },
        { key: 'blood_loss_ml', label: 'Netekto kraujo kiekis, ml', type: 'int' },
        { key: 'tme_quality', label: 'TME kokybė (Quirke)', type: 'select', options: [{ v: 1, l: 'Complete' }, { v: 2, l: 'Nearly complete' }, { v: 3, l: 'Incomplete' }] },
        { key: 'ileostomy', label: 'Ileostomija', type: 'select', options: YESNO },
        { key: 'anastomosis_type', label: 'Anastomozės tipas', type: 'select', options: opts(['colorectal', 'coloanal', 'nėra']) },
        { key: 'ileostomy_closure_date', label: 'Ileostomos uždarymo data', type: 'date' },
        { key: 'complications', label: 'Komplikacijos', type: 'select', options: YESNO },
        { key: 'clavien_dindo', label: 'Clavien-Dindo', type: 'select', options: opts(['0', 'I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V']) },
        { key: 'anastomotic_leak', label: 'Anastomozės nesandarumas', type: 'select', options: YESNO },
        { key: 'reoperation_30d', label: 'Reoperacija per 30 d.', type: 'select', options: YESNO },
        { key: 'rehospitalization_30d', label: 'Pakartotinė hosp. per 30 d.', type: 'select', options: YESNO },
        { key: 'hospital_stay_days', label: 'Hospitalizacijos trukmė, d.', type: 'int' },
        { key: 'death_30d', label: 'Mirtis per 30 d.', type: 'select', options: YESNO },
        { key: 'complications_icd10', label: 'Komplikacijos (ICD-10 kodai)', type: 'text' }
      ]
    },
    {
      id: 'pathology',
      title: 'Patologija',
      fields: [
        { key: 'pt', label: 'pT', type: 'select', options: opts(['pT0', 'pT1', 'pT2', 'pT3', 'pT4a', 'pT4b']) },
        { key: 'pn', label: 'pN', type: 'select', options: opts(['pN0', 'pN1a', 'pN1b', 'pN1c', 'pN2a', 'pN2b']) },
        { key: 'pm', label: 'pM', type: 'select', options: opts(['pM0', 'pM1a', 'pM1b', 'pM1c']) },
        { key: 'ptnm_stage', label: 'pTNM stadija', type: 'select', options: opts(['0', 'I', 'IIA', 'IIB', 'IIC', 'IIIA', 'IIIB', 'IIIC', 'IVA', 'IVB', 'IVC']) },
        { key: 'histology_type', label: 'Histologinis tipas', type: 'select', options: opts(['adenokarcinoma', 'mucinozinė', 'signetinis', 'kita']) },
        { key: 'histology_grade', label: 'Histologinis Grade', type: 'select', options: opts(['G1', 'G2', 'G3']) },
        { key: 'resection_margin', label: 'Rezekciniai kraštai (R)', type: 'select', options: opts(['R0', 'R1', 'R2']) },
        { key: 'proximal_margin_cm', label: 'Proksimalinis kraštas, cm', type: 'num' },
        { key: 'distal_margin_cm', label: 'Distalinis kraštas, cm', type: 'num' },
        { key: 'ln_removed', label: 'Pašalintų l/m skaičius', type: 'int' },
        { key: 'ln_positive', label: 'Teigiamų l/m skaičius', type: 'int' },
        { key: 'lvi', label: 'LVI (limfovaskulinė invazija)', type: 'select', options: YESNO },
        { key: 'pni', label: 'PNI (perineurinė invazija)', type: 'select', options: YESNO },
        { key: 'dworak_trg', label: 'Dworak TRG', type: 'select', options: range(1, 4) },
        { key: 'specimen_length_cm', label: 'Preparato ilgis, cm', type: 'num' },
        { key: 'cea_post_op', label: 'CEA po operacijos (pirmas), ng/ml', type: 'num' }
      ]
    },
    {
      id: 'molecular',
      title: 'Molekulinė diagnostika',
      fields: [
        { key: 'kras_status', label: 'KRAS statusas', type: 'select', options: opts(['wt', 'mut', 'neatlikta']) },
        { key: 'kras_mutation', label: 'KRAS mutacija (jei teigiama)', type: 'text' },
        { key: 'nras_status', label: 'NRAS statusas', type: 'select', options: opts(['wt', 'mut', 'neatlikta']) },
        { key: 'braf_status', label: 'BRAF statusas', type: 'select', options: opts(['wt', 'mut', 'neatlikta']) },
        { key: 'mmr_msi_status', label: 'dMMR / MSI statusas', type: 'select', options: opts(['pMMR/MSS', 'dMMR/MSI-H', 'neatlikta']) },
        { key: 'mlh1', label: 'MLH1', type: 'select', options: opts(['išreikštas', 'prarastas', 'neatliktas']) },
        { key: 'msh2', label: 'MSH2', type: 'select', options: opts(['išreikštas', 'prarastas', 'neatliktas']) },
        { key: 'msh6', label: 'MSH6', type: 'select', options: opts(['išreikštas', 'prarastas', 'neatliktas']) },
        { key: 'pms2', label: 'PMS2', type: 'select', options: opts(['išreikštas', 'prarastas', 'neatliktas']) },
        { key: 'her2', label: 'HER2', type: 'select', options: opts(['neg', 'poz(2+)', 'poz(3+)', 'neatlikta']) }
      ]
    },
    {
      id: 'adjuvant',
      title: 'Adjuvantinis gydymas',
      fields: [
        { key: 'act_scheme', label: 'aCT schema', type: 'select', options: opts(['CAPOX', 'FOLFOX', 'FOLFIRI', 'nėra']) },
        { key: 'act_start_date', label: 'aCT pradžios data', type: 'date' },
        { key: 'act_end_date', label: 'aCT pabaigos data', type: 'date' },
        { key: 'act_cycles', label: 'aCT ciklų skaičius', type: 'int' },
        { key: 'art', label: 'aRT', type: 'select', options: YESNO },
        { key: 'art_dose_gy', label: 'aRT dozė, Gy', type: 'num' }
      ]
    },
    {
      id: 'followup',
      title: 'Stebėjimas / baigtys',
      fields: [
        { key: 'mts_development', label: 'MTS išsivystymas', type: 'select', options: YESNO },
        { key: 'mts_location', label: 'MTS lokacija', type: 'text' },
        { key: 'local_recurrence', label: 'Vietinis recidyvas', type: 'select', options: YESNO },
        { key: 'recurrence_date', label: 'Recidyvo data', type: 'date' },
        { key: 'last_contact_date', label: 'Paskutinis kontaktas', type: 'date' },
        { key: 'vital_status', label: 'Gyvybingumo statusas', type: 'select', options: [{ v: 0, l: 'Gyvas' }, { v: 1, l: 'Miręs' }] },
        { key: 'death_date', label: 'Mirties data', type: 'date' },
        { key: 'cancer_related_death', label: 'Su vėžiu susijusi mirtis', type: 'select', options: YESNO },
        { key: 'notes', label: 'Pastabos', type: 'textarea' }
      ]
    },
    {
      id: 'proms',
      title: 'PROMs (LARS / Wexner)',
      fields: [
        { key: 'lars_baseline', label: 'LARS prieš operaciją (baseline)', type: 'int' },
        { key: 'lars_0m', label: 'LARS score 0 mėn.', type: 'int' },
        { key: 'lars_3m', label: 'LARS score 3 mėn.', type: 'int' },
        { key: 'lars_6m', label: 'LARS score 6 mėn.', type: 'int' },
        { key: 'lars_12m', label: 'LARS score 12 mėn.', type: 'int' },
        { key: 'lars_category_12m', label: 'LARS kategorija 12 mėn.', type: 'select', options: [{ v: 0, l: 'Ne' }, { v: 1, l: 'Minor' }, { v: 2, l: 'Major' }] },
        { key: 'wexner_0m', label: 'Wexner score 0 mėn.', type: 'int' },
        { key: 'wexner_12m', label: 'Wexner score 12 mėn.', type: 'int' }
      ]
    }
  ];

  // Flat lookup: key -> field (with section), for table rendering & value formatting.
  var BY_KEY = {};
  SECTIONS.forEach(function (s) {
    s.fields.forEach(function (f) { BY_KEY[f.key] = f; });
  });

  // Yes/No fields render as a single checkbox (checked = Taip / 1, unchecked = Ne / 0).
  SECTIONS.forEach(function (s) {
    s.fields.forEach(function (f) { if (f.options === YESNO) f.type = 'bool'; });
  });

  // BMI (KMI) is computed automatically from weight + height.
  if (BY_KEY.bmi) BY_KEY.bmi.auto = true;

  // Allowed numeric ranges (mirror DB CHECK/type limits) — used for client-side
  // validation so out-of-range typos are caught before saving, not as a 500.
  var RANGES = {
    age_at_diagnosis: [0, 130], height_cm: [0, 300], weight_kg: [0, 999], bmi: [0, 999],
    cea_pre_treatment: [0, 99999], cea_post_op: [0, 99999],
    tumor_distance_anus_cm: [0, 999], tumor_distance_arj_cm: [0, 999],
    proximal_margin_cm: [0, 999], distal_margin_cm: [0, 999], specimen_length_cm: [0, 999],
    nrt_dose_gy: [0, 999], art_dose_gy: [0, 999],
    nct_cycles: [0, 99], act_cycles: [0, 99],
    operation_duration_min: [0, 3000], blood_loss_ml: [0, 30000], hospital_stay_days: [0, 3000],
    ln_removed: [0, 300], ln_positive: [0, 300],
    lars_baseline: [0, 42], lars_0m: [0, 42], lars_3m: [0, 42], lars_6m: [0, 42], lars_12m: [0, 42],
    wexner_0m: [0, 20], wexner_12m: [0, 20]
  };
  Object.keys(RANGES).forEach(function (k) {
    if (BY_KEY[k]) { BY_KEY[k].min = RANGES[k][0]; BY_KEY[k].max = RANGES[k][1]; }
  });

  // Columns shown by default in the registry table summary (before the scrollable rest).
  var PRIMARY_KEYS = ['sex', 'diagnosis_date', 'operation_date', 'clinical_stage', 'ptnm_stage'];

  function formatValue(key, value) {
    if (value === null || value === undefined || value === '') return '';
    var f = BY_KEY[key];
    if (!f) return String(value);
    if (f.type === 'bool') return String(value) === '1' ? 'Taip' : (String(value) === '0' ? 'Ne' : '');
    if (f.type === 'select' && f.options) {
      for (var i = 0; i < f.options.length; i++) {
        if (String(f.options[i].v) === String(value)) return f.options[i].l;
      }
    }
    return String(value);
  }

  global.ILARS_REGISTRY = {
    sections: SECTIONS,
    byKey: BY_KEY,
    primaryKeys: PRIMARY_KEYS,
    formatValue: formatValue
  };
})(typeof window !== 'undefined' ? window : this);
