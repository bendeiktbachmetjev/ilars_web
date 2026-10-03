/* ui/motion.js — segmented control, view transitions, staggered reveal, KPI count-up, skeleton timing.
   DESIGN-SPEC §3.2, §5. Namespace ILARS_UI. */
(function (g) {
  'use strict';
  var UI = g.ILARS_UI;
  var reduce = g.matchMedia('(prefers-reduced-motion: reduce)');
  UI.reducedMotion = function () { return reduce.matches; };
  function cssMs(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? parseFloat(v) * (v.indexOf('ms') > -1 ? 1 : 1000) : fallback;
  }

  // ---------------------------------------------------------------- segmented control (view switcher)
  /** el = .ui-seg with <button data-v aria-pressed>. Keyboard: ONE Tab stop (roving tabindex on the selected
      button); ←/→/Home/End move and select. The thumb follows the measured button (--x/--w), so unequal widths
      and overflow work. When the options do not fit, .is-overflowing makes the group scroll sideways with an edge
      fade, and the selected option is kept in view. opts.debounce (ms): the visual selection is immediate, the
      callback waits (chart cards: holding an arrow key does not re-render a chart per key press). */
  UI.seg = function (el, onChange, opts) {
    opts = opts || {};
    var btns = Array.prototype.slice.call(el.querySelectorAll(':scope > button'));
    el.style.setProperty('--n', btns.length);
    var cur = Math.max(0, btns.findIndex(function (b) { return b.getAttribute('aria-pressed') === 'true'; })), timer;
    function edges() {
      el.classList.toggle('is-fade-start', el.scrollLeft > 2);
      el.classList.toggle('is-fade-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }
    function place() {
      var b = btns[cur]; if (!b || !b.offsetWidth) return;
      var first = !el.style.getPropertyValue('--w');
      if (first) el.classList.add('is-measuring');
      el.classList.remove('is-overflowing');
      var over = el.scrollWidth > el.clientWidth + 1;
      el.classList.toggle('is-overflowing', over);
      el.style.setProperty('--x', (b.offsetLeft - 2) + 'px');
      el.style.setProperty('--w', b.offsetWidth + 'px');
      if (over) {
        var l = b.offsetLeft, r = l + b.offsetWidth;
        if (l < el.scrollLeft + 24) el.scrollLeft = Math.max(0, l - 24);
        else if (r > el.scrollLeft + el.clientWidth - 24) el.scrollLeft = r - el.clientWidth + 24;
        edges();
      }
      if (first) requestAnimationFrame(function () { el.classList.remove('is-measuring'); });
    }
    function set(i, silent) {
      cur = i; el.style.setProperty('--i', i);
      btns.forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      place();
      if (silent || !onChange) return;
      clearTimeout(timer);
      if (opts.debounce) timer = setTimeout(function () { onChange(btns[cur].dataset.v, btns[cur], cur); }, opts.debounce);
      else onChange(btns[i].dataset.v, btns[i], i);
    }
    set(cur, true);
    btns.forEach(function (b, i) { b.addEventListener('click', function () { if (i !== cur) set(i); }); });
    el.addEventListener('keydown', function (e) {
      var n = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: btns.length - 1 }[e.key];
      if (n == null) return;
      n = (n + btns.length) % btns.length; set(n); btns[n].focus(); e.preventDefault();
    });
    el.addEventListener('scroll', edges, { passive: true });
    if (g.ResizeObserver) new ResizeObserver(function () { place(); }).observe(el);
    return { set: set, place: place, get value() { return btns[cur].dataset.v; }, select: function (v) { var i = btns.findIndex(function (b) { return b.dataset.v === v; }); if (i > -1) set(i, true); } };
  };
  UI.segHtml = function (id, items, selected, opts) {
    opts = opts || {};
    return '<div class="ui-seg ' + (opts.cls || 'ui-seg--sm') + '"' + (id ? ' id="' + id + '"' : '') + ' role="group" aria-label="' + UI.esc(opts.label || '') + '" style="--n:' + items.length + ';--i:' + Math.max(0, items.map(function (x) { return x.v; }).indexOf(selected)) + '">' +
      items.map(function (it) {
        return '<button type="button" data-v="' + UI.esc(it.v) + '" aria-pressed="' + (it.v === selected) + '" tabindex="' + (it.v === selected ? 0 : -1) + '"' + (it.title ? ' aria-label="' + UI.esc(it.title) + '"' : '') + '>' +
          (it.icon ? UI.icon(it.icon) : '') + (it.label != null ? '<span>' + UI.esc(it.label) + '</span>' : '') + (it.count != null ? ' <span class="count">' + it.count + '</span>' : '') + '</button>';
      }).join('') + '</div>';
  };

  // ---------------------------------------------------------------- view transitions (same-document)
  /** kind: 'forward' | 'back' | 'swap' | 'list'. Never await data inside the update callback. */
  UI.transition = function (update, kind) {
    if (!document.startViewTransition || UI.reducedMotion() || document.querySelector('dialog[open]')) { update(); return Promise.resolve(); }
    var root = document.documentElement;
    root.dataset.vt = kind || 'swap';
    var vt = document.startViewTransition(update);
    vt.finished.finally(function () { delete root.dataset.vt; });
    return vt.updateCallbackDone;
  };

  // ---------------------------------------------------------------- staggered reveal (first render of a view only)
  UI.reveal = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('.ui-reveal'), function (el, i) {
      el.style.setProperty('--i', el.dataset.i != null ? el.dataset.i : Math.min(i, 10));
    });
  };
  // each .ui-reveal element animates once in its lifetime: showing a view again (display none → block) never replays it
  document.addEventListener('animationend', function (e) {
    if (e.target.classList && e.target.classList.contains('ui-reveal')) e.target.classList.remove('ui-reveal');
  });

  // ---------------------------------------------------------------- KPI count-up
  /** Final value is announced once (sr-only sibling or aria-label); width reserved so units never jump. */
  UI.countUp = function (el, to, o) {
    o = o || {};
    var dec = o.decimals || 0, dur = cssMs('--dur-count', 900), prefix = o.prefix || '', suffix = o.suffix || '';
    var fmt = function (v) { return prefix + UI.fmtNum(v, dec) + suffix; };
    el.textContent = fmt(to);
    el.style.display = 'inline-block';
    el.style.minWidth = Math.ceil(el.getBoundingClientRect().width) + 'px';
    if (UI.reducedMotion() || !isFinite(to)) return;
    el.setAttribute('aria-hidden', 'true');
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = fmt(to); el.after(sr);
    var start = performance.now() + (o.delay || 0);
    el.textContent = fmt(0);
    requestAnimationFrame(function frame(now) {
      var p = Math.max(0, Math.min(1, (now - start) / dur)), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(to * e);
      if (p < 1) requestAnimationFrame(frame); else el.textContent = fmt(to);
    });
  };
  UI.countAll = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-count]'), function (el, i) {
      UI.countUp(el, parseFloat(el.dataset.count), { decimals: +(el.dataset.dec || 0), prefix: el.dataset.prefix || '', suffix: el.dataset.suffix || '', delay: 120 + i * 40 });
    });
  };

  // ---------------------------------------------------------------- skeleton timing
  /** Skeleton appears only if loading takes > --skeleton-delay (250 ms) and then stays ≥ --skeleton-min (400 ms).
      Fast loads never flash a skeleton. Returns the render promise. */
  UI.withSkeleton = function (showSkeleton, load, render) {
    var delay = cssMs('--skeleton-delay', 250), min = cssMs('--skeleton-min', 400), shownAt = 0;
    var timer = setTimeout(function () { showSkeleton(); shownAt = performance.now(); }, delay);
    return Promise.resolve().then(load).then(function (data) {
      clearTimeout(timer);
      var wait = shownAt ? Math.max(0, min - (performance.now() - shownAt)) : 0;
      return new Promise(function (r) { setTimeout(r, wait); }).then(function () { return render(data); });
    }, function (err) { clearTimeout(timer); throw err; });
  };
  UI.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
})(window);
