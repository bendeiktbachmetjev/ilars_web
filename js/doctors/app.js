// Main application router (DESIGN-SPEC §4.1.1).
// Routes: #patients · #overview · #registry · #patient/<code> · #registry/<id>; '' and #list → the default.
// The hash is the only source of truth for the workspace and the iLARS tab. Routing starts after window.ILARS_BOOT
// (gate + profile + translations, ui/boot.js) — no auth polling here.
class App {
    constructor() {
        this.api = window.ILARS_DATA.store.api();
        this.depth = null;          // 0 = list route, 1 = detail route; null before the first route
        this.route = null;
    }

    start() {
        window.ILARS_TABS.init(this.api);
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute(true);
    }

    parse() {
        const [route, arg] = window.location.hash.slice(1).split('/');
        return { route: route || '', arg: arg ? decodeURIComponent(arg) : null };
    }

    /** Default and forbidden routes are rewritten in place (replaceState: no extra history entry). */
    canonical() {
        const lt = !!window.ILARS_IS_LT;
        const fallback = lt ? 'registry' : 'patients';
        let h = this.parse();
        const known = ['patients', 'overview', 'registry'].indexOf(h.route) > -1 || (h.route === 'patient' && h.arg);
        if (!known) h = { route: fallback, arg: null };
        if (h.route === 'patients' || h.route === 'overview') h.arg = null;
        if (h.route === 'registry' && !lt) h = { route: 'patients', arg: null };   // the backend answers 403 for non-LT
        const hash = '#' + h.route + (h.arg ? '/' + encodeURIComponent(h.arg) : '');
        if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
        return h;
    }

    /** '<view> · iLARS'; patient routes show the grouped code, never the name (titles land in history). */
    title(h) {
        const UI = window.ILARS_UI;
        if (h.route === 'patient') return UI.fmtCode(h.arg).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (h.route === 'registry') return 'Registras';
        return UI.t(h.route === 'overview' ? 'doctor.ui.overview.title' : 'doctor.ui.patients.title');
    }

    showView(id) {
        let shown = null;
        document.querySelectorAll('.view').forEach(view => {
            const on = view.id === id;
            view.classList.toggle('active', on);
            view.style.display = on ? 'block' : 'none';
            if (on) shown = view;
        });
        return shown;
    }

    /** Renders the route into its view (no transition, no focus move). Returns the view element. */
    render(h, restore) {
        let view;
        // detail routes: the switch follows the hash too (list routes get it from ILARS_TABS.show → setMode)
        if (h.arg) window.ILARS_TABS.syncToggle(h.route === 'registry' ? 'registry' : 'study');
        if (h.route === 'patient') {
            view = this.showView('patient-detail-view');
            if (!window.PatientDetailView) window.PatientDetailView = new PatientDetailView(this.api);
            window.PatientDetailView.load(h.arg);
        } else if (h.route === 'registry' && h.arg) {
            view = this.showView('registry-detail-view');
            if (!window.RegistryDetailView) window.RegistryDetailView = new RegistryDetailView(this.api);
            window.RegistryDetailView.load(h.arg);
        } else {
            view = this.showView('patient-list-view');
            window.ILARS_TABS.show(this.api, {
                mode: h.route === 'registry' ? 'registry' : 'study',
                tab: h.route === 'overview' ? 'overview' : 'patients',
                restore: !!restore
            });
        }
        document.title = this.title(h) + ' · iLARS';
        window.ILARS_UI.reveal(view);
        return view;
    }

    handleRoute(first) {
        const h = this.canonical();
        const depth = h.arg ? 1 : 0;
        const kind = first || this.depth === null ? null : depth > this.depth ? 'forward' : depth < this.depth ? 'back' : 'swap';
        const prev = this.route;
        const leftPatient = prev && prev.route === 'patient' && (h.route !== 'patient' || h.arg !== prev.arg);
        this.depth = depth;
        this.route = h;
        // the chart library loads in parallel with the data request on chart routes (charts/loader.js)
        if (h.route === 'patient' || h.route === 'overview') window.ILARS_CHARTS.load().catch(() => { /* cards fall back to tables */ });

        let view;
        const update = () => {
            // inside the update: the outgoing view-transition snapshot still shows the charts
            if (leftPatient) window.ILARS_CHARTS.disposeAll(document.getElementById('patient-detail-view'));
            view = this.render(h, kind === 'back');
            if (kind !== 'back') window.scrollTo(0, 0);
        };
        const done = () => {
            if (!kind) return;                                   // first render: focus stays at the top (skip link first)
            if (kind === 'back' && h.route === 'patients') return; // the list focuses the row of the patient just viewed
            let target = view.querySelector('#registry-mode[style*="block"] h1, #study-mode[style*="block"] h1') || view.querySelector('h1');
            if (!target) { view.tabIndex = -1; target = view; } else if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
            target.focus({ preventScroll: true });
        };
        if (kind) window.ILARS_UI.transition(update, kind).then(done);
        else { update(); done(); }
    }

    /** Language change: re-render the current view in place (no transition, focus and scroll stay). */
    rerender() {
        if (!this.route) return;
        window.ILARS_UI.patchAria();
        // The open registry record is Lithuanian in every UI language. Re-rendering it would reload the record and
        // throw away unsaved edits and the scroll position, so (as before the redesign) a language change leaves it alone.
        if (this.route.route === 'registry' && this.route.arg) {
            document.title = this.title(this.route) + ' · iLARS';
            return;
        }
        this.render(this.route, false);
    }

    navigate(path) {
        window.location.hash = path;
    }
}

// Initialize app when DOM is ready; routing starts after the gate (ui/boot.js)
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
    window.ILARS_BOOT.then(() => window.app.start());

    // Re-render dynamic content when the language changes (i18n.js has re-applied the static texts)
    if (window.ILARS_I18N) {
        window.ILARS_I18N._onLangChange = function () {
            window.app.rerender();
        };
    }
});
