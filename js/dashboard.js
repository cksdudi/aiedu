/* ============================================================
   dashboard.js — 홈(수료 현황) 화면
   ============================================================ */
(function () {
  'use strict';
  var esc = UI.esc, pct = UI.pct, Stats = UI.Stats;

  UI.renderHeader('index.html');
  Store.boot();

  var state = { members: [], materials: [], completions: [], material: '__ALL__', bureau: '', sort: 'rate', q: '' };

  Store.subscribe('members', function (d) { state.members = d; render(); });
  Store.subscribe('materials', function (d) { state.materials = d; fillMaterialFilter(); render(); });
  Store.subscribe('completions', function (d) { state.completions = d; render(); });

  document.getElementById('fMaterial').addEventListener('change', function (e) { state.material = e.target.value; render(); });
  document.getElementById('fBureau').addEventListener('change', function (e) { state.bureau = e.target.value; render(); });
  document.getElementById('sortDept').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('searchName').addEventListener('input', function (e) { state.q = e.target.value.trim(); renderNotDone(); });
  document.getElementById('btnCsv').addEventListener('click', exportCsv);

  function fillMaterialFilter() {
    var sel = document.getElementById('fMaterial');
    var cur = sel.value;
    var act = Stats.activeMaterials(state.materials);
    sel.innerHTML = '<option value="__ALL__">전체 과정(모두 수료 기준)</option>' +
      act.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.title) + '</option>'; }).join('');
    sel.value = act.some(function (m) { return m.id === cur; }) ? cur : '__ALL__';
    state.material = sel.value;
  }

  function fillBureauFilter(members) {
    var sel = document.getElementById('fBureau');
    var cur = sel.value;
    var list = [];
    members.forEach(function (m) { if (m.bureau && list.indexOf(m.bureau) < 0) list.push(m.bureau); });
    list.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    sel.innerHTML = '<option value="">전체</option>' +
      list.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b) + '</option>'; }).join('');
    sel.value = list.indexOf(cur) >= 0 ? cur : '';
    state.bureau = sel.value;
  }

  var lastView = null;

  function render() {
    fillBureauFilter(state.members);
    var all = state.members;
    var doneMap = Stats.doneMap(all, state.materials, state.completions, state.material);
    var members = state.bureau ? all.filter(function (m) { return m.bureau === state.bureau; }) : all;

    var total = members.length;
    var done = members.filter(function (m) { return doneMap[m.id]; }).length;
    lastView = { members: members, doneMap: doneMap, total: total, done: done };

    /* KPI */
    var actCount = Stats.activeMaterials(state.materials).length;
    var courseLabel = state.material === '__ALL__' ? ('전체 ' + actCount + '개 과정' ) :
      (state.materials.filter(function (m) { return m.id === state.material; })[0] || {}).title || '';
    document.getElementById('kpis').innerHTML =
      kpi('교육 대상', total + '<small>명</small>', state.bureau ? state.bureau : '전체 실국') +
      kpi('수료', done + '<small>명</small>', esc(courseLabel)) +
      kpi('미수료', (total - done) + '<small>명</small>', (total - done) > 0 ? '독려 대상' : '전원 수료') +
      kpi('수료율', pct(done, total) + '<small>%</small>', done + ' / ' + total, true);

    if (!total) {
      document.getElementById('chartBureau').innerHTML = emptyMsg('명단이 아직 등록되지 않았습니다. 관리자 화면에서 엑셀 명단을 업로드해 주세요.');
      document.getElementById('chartRank').innerHTML = emptyMsg('명단 등록 후 표시됩니다.');
      document.getElementById('tblDept').innerHTML = emptyMsg('명단 등록 후 표시됩니다.');
      document.getElementById('chartMaterial').innerHTML = emptyMsg(actCount ? '수료자가 아직 없습니다.' : '등록된 교육자료가 없습니다.');
      document.getElementById('tblNotDone').innerHTML = '';
      return;
    }

    /* 실국별 */
    var byB = Stats.groupBy(members, doneMap, function (m) { return m.bureau; })
      .sort(function (a, b) { return b.rate - a.rate || b.total - a.total; });
    document.getElementById('chartBureau').innerHTML = UI.barChart(byB);

    /* 직급별 */
    var byR = Stats.groupBy(members, doneMap, function (m) { return m.rank; })
      .sort(function (a, b) { return UI.rankRank(a.key) - UI.rankRank(b.key) || a.key.localeCompare(b.key, 'ko'); });
    document.getElementById('chartRank').innerHTML = UI.barChart(byR, { color: 'var(--series-3)' });

    /* 부서별 표 */
    var byD = Stats.groupBy(members, doneMap, function (m) { return (m.bureau || '(미지정)') + ' ▸ ' + (m.dept || '(미지정)'); });
    byD.sort(function (a, b) {
      if (state.sort === 'rate') return a.rate - b.rate || b.total - a.total;
      if (state.sort === 'rateDesc') return b.rate - a.rate || b.total - a.total;
      if (state.sort === 'total') return b.total - a.total;
      return a.key.localeCompare(b.key, 'ko');
    });
    document.getElementById('tblDept').innerHTML =
      '<table class="data"><thead><tr>' +
        '<th>실국</th><th>부서</th><th class="num">대상</th><th class="num">수료</th><th class="num">미수료</th><th>수료율</th>' +
      '</tr></thead><tbody>' +
      byD.map(function (r) {
        var p = r.key.split(' ▸ ');
        return '<tr><td>' + esc(p[0]) + '</td><td>' + esc(p[1]) + '</td>' +
          '<td class="num">' + r.total + '</td><td class="num">' + r.done + '</td>' +
          '<td class="num">' + (r.total - r.done) + '</td>' +
          '<td>' + UI.miniBar(r.rate) + '<strong style="font-variant-numeric:tabular-nums">' + r.rate + '%</strong></td></tr>';
      }).join('') +
      '</tbody></table>';

    /* 과정별 */
    var act = Stats.activeMaterials(state.materials);
    if (!act.length) {
      document.getElementById('chartMaterial').innerHTML = emptyMsg('등록된 교육자료가 없습니다.');
    } else {
      var ids = {}; members.forEach(function (m) { ids[m.id] = 1; });
      var rows = act.map(function (mt) {
        var d = state.completions.filter(function (c) { return c.materialId === mt.id && ids[c.memberId]; }).length;
        return { key: mt.title || '(제목없음)', total: members.length, done: d, rate: pct(d, members.length) };
      });
      document.getElementById('chartMaterial').innerHTML = UI.barChart(rows, { color: 'var(--series-2)', labelWidth: 'minmax(140px,260px)' });
    }

    renderNotDone();
  }

  function renderNotDone() {
    if (!lastView) return;
    var q = state.q;
    var list = lastView.members.filter(function (m) { return !lastView.doneMap[m.id]; });
    document.getElementById('notDoneDesc').textContent =
      '총 ' + list.length + '명 · 선택한 과정을 아직 이수하지 않은 직원입니다.';
    if (q) {
      list = list.filter(function (m) {
        return (m.name || '').indexOf(q) >= 0 || (m.dept || '').indexOf(q) >= 0 || (m.bureau || '').indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      return (a.bureau || '').localeCompare(b.bureau || '', 'ko') ||
             (a.dept || '').localeCompare(b.dept || '', 'ko') ||
             UI.rankRank(a.rank) - UI.rankRank(b.rank);
    });
    var show = list.slice(0, 300);
    document.getElementById('tblNotDone').innerHTML = !list.length
      ? '<div class="empty">🎉 해당 조건의 전원이 수료했습니다.</div>'
      : '<table class="data"><thead><tr><th>실국</th><th>부서</th><th>직급</th><th>성명</th></tr></thead><tbody>' +
        show.map(function (m) {
          return '<tr><td>' + esc(m.bureau) + '</td><td>' + esc(m.dept) + '</td><td>' + esc(m.rank) + '</td><td>' + esc(m.name) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        (list.length > show.length ? '<p class="hint">상위 ' + show.length + '명만 표시했습니다. 전체는 CSV로 내려받으세요.</p>' : '');
  }

  function kpi(label, value, note, hero) {
    return '<div class="kpi' + (hero ? ' kpi--hero' : '') + '">' +
      '<div class="kpi__label">' + label + '</div>' +
      '<div class="kpi__value">' + value + '</div>' +
      '<div class="kpi__note">' + note + '</div></div>';
  }
  function emptyMsg(t) { return '<div class="empty">' + esc(t) + '</div>'; }

  function exportCsv() {
    if (!lastView || !lastView.members.length) { UI.toast('내보낼 자료가 없습니다.', true); return; }
    var act = Stats.activeMaterials(state.materials);
    var per = Stats.doneMap(state.members, state.materials, state.completions, '__ALL__').__per;
    var head = ['순번', '실국', '부서', '직급', '성명', '수료여부'].concat(act.map(function (m) { return m.title; }));
    var rows = [head];
    lastView.members.forEach(function (m, i) {
      var r = [i + 1, m.bureau || '', m.dept || '', m.rank || '', m.name || '',
        lastView.doneMap[m.id] ? '수료' : '미수료'];
      act.forEach(function (mt) {
        var c = state.completions.filter(function (x) { return x.memberId === m.id && x.materialId === mt.id; })[0];
        r.push(c ? UI.fmtDate(c.completedAt) : '');
      });
      rows.push(r);
    });
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : n; };
    UI.downloadCSV('교육수료현황_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.csv', rows);
    UI.toast('CSV 파일을 내려받았습니다.');
  }
})();
