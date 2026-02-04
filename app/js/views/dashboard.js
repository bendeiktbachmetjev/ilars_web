/**
 * iLARS Patient Web App — Dashboard view
 * getNextQuestionnaire, LARS chart, Fill it now button
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var loadingEl = document.getElementById('dashboard-loading');
  var nextCard = document.getElementById('dashboard-next-card');
  var nextDone = document.getElementById('dashboard-next-done');
  var nextError = document.getElementById('dashboard-next-error');
  var errorText = document.getElementById('dashboard-error-text');
  var reasonEl = document.getElementById('dashboard-next-reason');
  var typeEl = document.getElementById('dashboard-next-type');
  var fillBtn = document.getElementById('dashboard-fill-btn');
  var larsSection = document.getElementById('dashboard-lars-section');
  var larsChartEl = document.getElementById('dashboard-lars-chart');
  var larsPeriodsEl = document.getElementById('dashboard-lars-periods');

  var currentType = null;
  var currentLarsPeriod = 'weekly';
  var opts = {};

  var typeLabels = {
    daily: 'Daily questionnaire',
    weekly: 'Weekly LARS questionnaire',
    monthly: 'Monthly quality of life',
    eq5d5l: 'EQ-5D-5L quality of life'
  };

  function setVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.classList.remove('is-hidden');
    } else {
      el.classList.add('is-hidden');
    }
  }

  function loadNext() {
    setVisible(loadingEl, true);
    setVisible(nextCard, false);
    setVisible(nextDone, false);
    setVisible(nextError, false);

    API.getNextQuestionnaire(null, function (err, data) {
      setVisible(loadingEl, false);
      if (err) {
        setVisible(nextError, true);
        if (errorText) errorText.textContent = err.message || 'Failed to load.';
        return;
      }
      if (data.status !== 'ok') {
        setVisible(nextError, true);
        if (errorText) errorText.textContent = data.detail || 'Failed to load.';
        return;
      }

      currentType = data.questionnaire_type || null;
      if (!currentType) {
        setVisible(nextDone, true);
        return;
      }

      if (typeEl) typeEl.textContent = typeLabels[currentType] || currentType;
      setVisible(nextCard, true);
      if (fillBtn) {
        fillBtn.onclick = function () {
          if (opts.showScreen && currentType) {
            opts.showScreen(currentType);
          }
        };
      }
    });
  }

  function formatDate(str) {
    if (!str) return '';
    var d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.getMonth() + 1 + '/' + d.getDate();
  }

  function renderLarsChart(data) {
    if (!larsChartEl) return;
    var points = (data && data.data) || [];
    var hintEl = document.getElementById('dashboard-lars-hint');
    if (points.length === 0) {
      larsChartEl.innerHTML = '<p class="app-chart-empty">Complete weekly questionnaires to see your LARS score over time.</p>';
      if (hintEl) hintEl.classList.remove('is-hidden');
      return;
    }
    if (hintEl) hintEl.classList.add('is-hidden');
    var maxScore = 42;
    var padding = { top: 16, right: 16, bottom: 24, left: 40 };
    var width = 480;
    var height = 220;
    var chartW = width - padding.left - padding.right;
    var chartH = height - padding.top - padding.bottom;

    var scores = points.map(function (p) {
      var s = p.score != null ? p.score : p.total_score;
      var num = typeof s === 'number' ? s : parseInt(s, 10);
      return isNaN(num) ? 0 : Math.min(maxScore, Math.max(0, num));
    });

    var minS = 0;
    var maxS = maxScore;
    var range = maxS - minS || 1;
    var stepX = points.length > 1 ? chartW / (points.length - 1) : chartW;

    var toX = function (i) {
      return padding.left + i * stepX;
    };
    var toY = function (score) {
      var pct = (score - minS) / range;
      return padding.top + chartH - pct * chartH;
    };

    var pathD = scores.map(function (score, i) {
      return (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ',' + toY(score).toFixed(1);
    }).join(' ');

    var circles = scores.map(function (score, i) {
      var x = toX(i);
      var y = toY(score);
      var dateStr = points[i].date || '';
      var title = dateStr + (dateStr ? ': ' : '') + 'Score ' + score;
      return '<circle cx="' + x + '" cy="' + y + '" r="3.5" class="app-line-point"><title>' + title + '</title></circle>';
    }).join('');

    var yTicks = [0, 21, 42];
    var yLines = yTicks.map(function (t) {
      var y = toY(t);
      return '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" class="app-line-grid"/>';
    }).join('');

    var yLabels = yTicks.map(function (t) {
      var y = toY(t);
      return '<text x="' + (padding.left - 8) + '" y="' + (y + 4) + '" class="app-line-axis">' + t + '</text>';
    }).join('');

    var html = '<div class="app-line-chart-wrap">';
    html += '<svg class="app-line-chart" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';
    html += yLines;
    html += '<path d="' + pathD + '" class="app-line-path" fill="none"/>';
    html += circles;
    html += yLabels;
    html += '</svg>';
    html += '<div class="app-line-xlabels">';
    if (points.length > 0) {
      html += '<span>' + formatDate(points[0].date) + '</span>';
      if (points.length > 1) html += '<span>' + formatDate(points[points.length - 1].date) + '</span>';
    }
    html += '</div>';
    html += '</div>';
    larsChartEl.innerHTML = html;
  }

  function loadLars(period) {
    var p = period || currentLarsPeriod;
    currentLarsPeriod = p;
    API.getLarsData(null, p, function (err, data) {
      if (err || !data) return;
      renderLarsChart(data);
    });
  }

  function bindPeriodButtons() {
    if (!larsPeriodsEl) return;
    var btns = larsPeriodsEl.querySelectorAll('.app-period-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var period = btn.getAttribute('data-period');
        if (!period) return;
        btns.forEach(function (b) {
          b.classList.remove('is-active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        loadLars(period);
      });
    });
  }

  function refresh() {
    loadNext();
    loadLars();
  }

  function init(options) {
    opts = options || {};
    bindPeriodButtons();
    loadNext();
    loadLars();
    if (fillBtn) fillBtn.onclick = function () {
      if (opts.showScreen && currentType) opts.showScreen(currentType);
    };
  }

  global.ILARS_APP_DASHBOARD = {
    init: init,
    refresh: refresh
  };
})(typeof window !== 'undefined' ? window : this);
