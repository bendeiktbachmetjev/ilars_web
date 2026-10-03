/* charts/loader.js — lazy Apache ECharts 6.1.0 (full build, SVG renderer), jsDelivr with SRI, one retry from cdnjs
   (byte-identical file, same hash). Started on route entry in parallel with the data request.
   DESIGN-SPEC §3.6, §6.3. Namespace ILARS_CHARTS. */
(function (g) {
  'use strict';
  var C = g.ILARS_CHARTS = g.ILARS_CHARTS || {};
  var SRI = 'sha384-C2iskrW/uPW46KzOjrvJIQo4YkV8lkD+QS0CrDN18IIPIpT/g2USu8bTP3nvmIAD';
  var URLS = ['https://cdn.jsdelivr.net/npm/echarts@6.1.0/dist/echarts.min.js',
              'https://cdnjs.cloudflare.com/ajax/libs/echarts/6.1.0/echarts.min.js'];
  var p = null;
  function inject(url) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url; s.integrity = SRI; s.crossOrigin = 'anonymous'; s.async = true;
      var timer = setTimeout(function () { rej(new Error('timeout')); }, 10000);
      s.onload = function () { clearTimeout(timer); g.echarts ? res(g.echarts) : rej(new Error('no echarts')); };
      s.onerror = function () { clearTimeout(timer); s.remove(); rej(new Error('load failed: ' + url)); };
      document.head.appendChild(s);
    });
  }
  C.load = function () {
    if (g.echarts) return Promise.resolve(g.echarts);
    if (!p) p = inject(URLS[0]).catch(function () { return inject(URLS[1]); }).catch(function (e) { p = null; throw e; });
    return p;
  };
})(window);
