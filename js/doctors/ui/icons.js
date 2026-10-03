/* ui/icons.js — stroke icon sprite (24×24, 1.75 stroke, SF-Symbols-like), injected once.
   Use: ILARS_ICONS.icon('name', 'i--sm') -> '<svg class="i i--sm" aria-hidden="true"><use href="#i-name"/></svg>'.
   Icons are decorative: the control next to them always carries a word or an aria-label. */
(function () {
  'use strict';
  var P = {
    pulse: '<path d="M3 12h3.5l2.5-6.5 5 13 2.5-6.5H21"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="18" r=".9" fill="currentColor"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'chev-right': '<path d="m9.5 6 6 6-6 6"/>',
    'chev-left': '<path d="m14.5 6-6 6 6 6"/>',
    'chev-down': '<path d="m6 9.5 6 6 6-6"/>',
    'chev-updown': '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
    download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    sort: '<path d="M8 4v16m0 0-3.5-3.5M8 20l3.5-3.5M16 20V4m0 0-3.5 3.5M16 4l3.5 3.5"/>',
    'sort-desc': '<path d="M12 4v16m0 0-5-5m5 5 5-5"/>',
    'sort-asc': '<path d="M12 20V4m0 0-5 5m5-5 5 5"/>',
    filter: '<path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    pencil: '<path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".8" fill="currentColor"/>',
    line: '<path d="M3.5 17.5 9 11l4 3.5 7.5-8.5"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="13" cy="14.5" r="1.2" fill="currentColor"/>',
    bars: '<path d="M5 20v-7M10 20V8M15 20v-5M20 20V5"/>',
    donut: '<path d="M12 3.5a8.5 8.5 0 1 1-8.2 6.3"/><path d="M12 3.5v4.2a4.3 4.3 0 1 1-4.2 3.3L3.8 9.8"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/>',
    table: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 10h17M3.5 14.5h17M9 10v9"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.7 3.8-5.6 7.5-5.6s6.6 1.9 7.5 5.6"/>',
    users: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.5c.8-3.3 3.2-5 6.2-5s5.4 1.7 6.2 5"/><path d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4M17.8 14.6c1.8.6 3 2.2 3.5 4.9"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z"/>',
    alert: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r=".8" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
    'arrow-down': '<path d="M12 5v14m0 0-5-5m5 5 5-5"/>',
    'arrow-up': '<path d="M12 19V5m0 0-5 5m5-5 5 5"/>',
    'arrow-right': '<path d="M5 12h14m0 0-5-5m5 5-5 5"/>',
    steps: '<path d="M8.5 3.5c1.9 0 2.8 2 2.6 4.6-.2 2.2-.9 3.4-2.3 3.4S6.4 10.6 6.2 8.4C6 5.8 6.6 3.5 8.5 3.5zM6.6 14h4.4l-.3 2.2a2.1 2.1 0 0 1-4.2-.2zM15.5 8c1.9 0 2.5 2.3 2.3 4.9-.2 2.2-1.2 3.1-2.6 3.1s-2.1-1.2-2.3-3.4C12.7 10 13.6 8 15.5 8zM13.1 18.5h4.4l-.2 1.6a2.1 2.1 0 0 1-4.2-.1z"/>',
    heart: '<path d="M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 6.8a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10-7.5 10z"/>',
    drop: '<path d="M12 3.8s6 6.4 6 10.7a6 6 0 0 1-12 0c0-4.3 6-10.7 6-10.7z"/>',
    leaf: '<path d="M5 19c0-8 5-13.5 14-14-.4 9-6 14-14 14z"/><path d="M5 19c3-4 6-6.5 9.5-8.5"/>',
    form: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
    sparkle: '<path d="M12 4.5 13.6 10.4 19.5 12 13.6 13.6 12 19.5 10.4 13.6 4.5 12 10.4 10.4z"/>',
    more: '<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>',
    hospital: '<path d="M4.5 20.5V8l7.5-4.5L19.5 8v12.5"/><path d="M12 9.5v5M9.5 12h5M3 20.5h18"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    'chev-up': '<path d="m6 14.5 6-6 6 6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    wifi: '<path d="M3 9.5a13 13 0 0 1 18 0M6.2 12.8a8.5 8.5 0 0 1 11.6 0M9.4 16a4 4 0 0 1 5.2 0"/><circle cx="12" cy="19" r=".9" fill="currentColor"/>',
    logout: '<path d="M14.5 4.5h-8a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8"/><path d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5"/>',
  };
  var s = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
  Object.keys(P).forEach(function (k) { s += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + P[k] + '</symbol>'; });
  s += '</svg>';
  function inject() { if (!document.getElementById('i-pulse')) document.body.insertAdjacentHTML('afterbegin', s); }
  if (document.body) inject(); else document.addEventListener('DOMContentLoaded', inject);
  function icon(name, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>'; }
  window.ILARS_ICONS = { icon: icon, names: Object.keys(P) };
})();
