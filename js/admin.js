/* ============================================================
   admin.js — 관리자 화면
   ============================================================ */
(function () {
  'use strict';
  var esc = UI.esc, Stats = UI.Stats, CFG = window.APP_CONFIG || {};
  var SESSION_KEY = 'eduhub.admin';

  UI.renderHeader('admin.html');
  Store.boot();

  var state = { members: [], materials: [], completions: [], tab: 'members', q: '', pending: null };

  Store.subscribe('members', function (d) { state.members = d; if (authed()) paint(); });
  Store.subscribe('materials', function (d) { state.materials = d; if (authed()) paint(); });
  Store.subscribe('completions', function (d) { state.completions = d; if (authed()) paint(); });
  Store.subscribe('settings', function () { if (!authed()) renderGate(); });

  function authed() { return sessionStorage.getItem(SESSION_KEY) === '1'; }

  /* ================= 로그인 ================= */
  function renderGate() {
    if (authed()) return open();
    document.getElementById('gate').innerHTML =
      '<section class="card" style="max-width:420px">' +
        '<h2 class="card__title">관리자 인증</h2>' +
        '<p class="card__desc">관리자 비밀번호를 입력하세요.</p>' +
        '<label class="field"><span>비밀번호</span><input type="password" id="pw" autocomplete="current-password"></label>' +
        '<button class="btn btn--primary" id="btnLogin">확인</button>' +
        '<p class="hint" id="loginHint"></p>' +
      '</section>';
    var pw = document.getElementById('pw');
    pw.onkeydown = function (e) { if (e.key === 'Enter') login(); };
    document.getElementById('btnLogin').onclick = login;
    setTimeout(function () { pw.focus(); }, 50);

    function login() {
      var val = pw.value;
      if (!val) return;
      UI.hash(val).then(function (h) {
        var saved = Store.settings().adminHash;
        if (saved) {
          if (h === saved) return open();
          document.getElementById('loginHint').textContent = '비밀번호가 일치하지 않습니다.';
          pw.value = ''; pw.focus();
        } else if (val === (CFG.defaultAdminPassword || 'admin1234')) {
          Store.saveSettings({ adminHash: h }).then(open, open);
        } else {
          document.getElementById('loginHint').textContent = '비밀번호가 일치하지 않습니다.';
          pw.value = ''; pw.focus();
        }
      });
    }
  }

  function open() {
    sessionStorage.setItem(SESSION_KEY, '1');
    document.getElementById('gate').innerHTML = '';
    document.getElementById('admin').hidden = false;
    UI.$$('.tabs button').forEach(function (b) {
      b.onclick = function () {
        state.tab = b.getAttribute('data-tab');
        UI.$$('.tabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        paint();
      };
    });
    paint();
  }

  function paint() {
    var p = document.getElementById('panel');
    if (!p || document.getElementById('admin').hidden) return;
    if (state.tab === 'members') return paintMembers(p);
    if (state.tab === 'materials') return paintMaterials(p);
    if (state.tab === 'records') return paintRecords(p);
    return paintSettings(p);
  }

  /* ================= 1. 명단 관리 ================= */
  function paintMembers(p) {
    var list = state.members.slice();
    if (state.q) {
      var q = state.q;
      list = list.filter(function (m) {
        return [m.bureau, m.dept, m.name, m.rank].join(' ').indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      return (a.bureau || '').localeCompare(b.bureau || '', 'ko') ||
             (a.dept || '').localeCompare(b.dept || '', 'ko') ||
             UI.rankRank(a.rank) - UI.rankRank(b.rank) ||
             (a.name || '').localeCompare(b.name || '', 'ko');
    });
    var show = list.slice(0, 500);

    p.innerHTML =
      '<section class="card">' +
        '<h2 class="card__title">엑셀로 명단 일괄 등록</h2>' +
        '<p class="card__desc">엑셀 파일(.xlsx/.xls/.csv)을 업로드하고 <strong>[📥 엑셀 명단 저장하기]</strong> 버튼을 누르면 DB에 즉시 저장됩니다. (권장 열: <strong>실국 · 부서 · 직급 · 성명</strong>)</p>' +
        '<div class="grid grid--2">' +
          '<label class="field"><span>1. 엑셀 파일 선택 *</span><input type="file" id="xls" accept=".xlsx,.xls,.csv"></label>' +
          '<label class="field"><span>2. 등록 방식 선택</span><select id="mergeMode">' +
            '<option value="replace">전체 교체 — 기존 명단을 지우고 새로 등록</option>' +
            '<option value="merge">추가 · 병합 — 새 사람만 추가(중복 제외)</option>' +
          '</select></label>' +
        '</div>' +
        '<div class="btn-row" style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<button class="btn btn--primary" id="btnSaveXls" style="font-weight:bold;padding:10px 18px">📥 엑셀 명단 저장하기</button>' +
          '<button class="btn btn--sm" id="btnTemplate">엑셀 양식 내려받기</button>' +
        '</div>' +
        '<div id="preview" style="margin-top:12px"></div>' +
      '</section>' +

      '<section class="card">' +
        '<div class="card__head">' +
          '<div><h2 class="card__title">명단 (' + state.members.length + '명)</h2>' +
          '<p class="card__desc">행을 눌러 수정하거나 삭제할 수 있습니다.</p></div>' +
          '<div class="card__head-actions">' +
            '<input type="text" id="mq" placeholder="검색" value="' + esc(state.q) + '" style="width:180px">' +
            '<button class="btn btn--sm btn--primary" id="btnAdd">+ 직원 추가</button>' +
            '<button class="btn btn--sm" id="btnExportM">명단 내려받기</button>' +
            '<button class="btn btn--sm btn--danger" id="btnClearM">전체 삭제</button>' +
          '</div>' +
        '</div>' +
        '<div class="table-scroll">' +
          (list.length
            ? '<table class="data"><thead><tr><th class="num">#</th><th>실국</th><th>부서</th><th>직급</th><th>성명</th><th>관리</th></tr></thead><tbody>' +
              show.map(function (m, i) {
                return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(m.bureau) + '</td><td>' + esc(m.dept) + '</td>' +
                  '<td>' + esc(m.rank) + '</td><td>' + esc(m.name) + '</td>' +
                  '<td><button class="btn btn--sm" data-edit="' + esc(m.id) + '">수정</button> ' +
                  '<button class="btn btn--sm btn--danger" data-del="' + esc(m.id) + '">삭제</button></td></tr>';
              }).join('') + '</tbody></table>' +
              (list.length > show.length ? '<p class="hint">상위 500명만 표시했습니다. 검색으로 좁혀 보세요.</p>' : '')
            : '<div class="empty">등록된 명단이 없습니다. 위에서 엑셀 파일을 업로드 후 저장하세요.</div>') +
        '</div>' +
      '</section>';

    var xlsInput = document.getElementById('xls');
    xlsInput.onchange = onExcel;
    document.getElementById('btnSaveXls').onclick = function () {
      if (state.pending && state.pending.length) {
        applyPending();
      } else if (xlsInput.files && xlsInput.files[0]) {
        onExcel({ target: xlsInput }, function () { applyPending(); });
      } else {
        UI.toast('엑셀 파일(.xlsx/.csv)을 먼저 선택해 주세요.', true);
      }
    };
    document.getElementById('btnTemplate').onclick = downloadTemplate;
    document.getElementById('mq').oninput = function (e) { state.q = e.target.value.trim(); paint(); };
    document.getElementById('btnAdd').onclick = function () { editMember(null); };
    document.getElementById('btnExportM').onclick = exportMembers;
    document.getElementById('btnClearM').onclick = function () {
      if (!confirm('명단 ' + state.members.length + '명을 모두 삭제합니다. 수료 기록은 남습니다. 계속할까요?')) return;
      Store.clear('members').then(function () { UI.toast('명단을 삭제했습니다.'); });
    };
    UI.$$('[data-edit]', p).forEach(function (b) {
      b.onclick = function () {
        editMember(state.members.filter(function (m) { return m.id === b.getAttribute('data-edit'); })[0]);
      };
    });
    UI.$$('[data-del]', p).forEach(function (b) {
      b.onclick = function () {
        var m = state.members.filter(function (x) { return x.id === b.getAttribute('data-del'); })[0];
        if (!m || !confirm(m.name + ' 님을 명단에서 삭제할까요?')) return;
        Store.remove('members', m.id).then(function () { UI.toast('삭제했습니다.'); });
      };
    });
  }

  function editMember(m) {
    var isNew = !m;
    m = m || { bureau: '', dept: '', name: '', rank: '' };
    UI.modal(
      '<h3>' + (isNew ? '직원 추가' : '직원 정보 수정') + '</h3>' +
      '<div class="grid grid--2">' +
        f('실국', 'bureau', m.bureau) + f('부서', 'dept', m.dept) +
        f('성명', 'name', m.name) + f('직급', 'rank', m.rank) +
      '</div>' +
      '<div class="btn-row"><button class="btn btn--primary" id="ok">저장</button><button class="btn" id="cancel">취소</button></div>',
      function (root, close) {
        root.querySelector('#cancel').onclick = close;
        root.querySelector('#ok').onclick = function () {
          var o = { id: m.id, bureau: v('bureau'), dept: v('dept'), name: v('name'), rank: v('rank') };
          if (!o.name) { UI.toast('성명을 입력하세요.', true); return; }
          if (!o.id) { o.id = Store.uid(); o.createdAt = Date.now(); }
          Store.put('members', o).then(function () { UI.toast('저장했습니다.'); close(); });
        };
        function v(k) { return root.querySelector('[name=' + k + ']').value.trim(); }
      }
    );
    function f(label, name, val) {
      return '<label class="field"><span>' + label + '</span><input type="text" name="' + name + '" value="' + esc(val || '') + '"></label>';
    }
  }

  /* ---------- 엑셀 읽기 ---------- */
  var HEAD = {
    bureau: ['실국', '실국명', '소속실국', '소속 실국', '국', '본부', '실·국', '실/국', '소속1', '상위부서', '실국구분', '기관'],
    dept:   ['부서', '부서명', '소속부서', '소속 부서', '과', '담당관', '소속', '팀', '소속2', '하위부서', '과명', '소속명'],
    name:   ['성명', '이름', '직원명', '성 명', '이 름', '성명(한글)', '직원성명', '성명(필수)', '대상자', '성명/이름'],
    rank:   ['직급', '직위', '급수', '계급', '직급명', '직위명', '직책', '직급/직위'],
    seq:    ['순번', '번호', 'no', 'NO', '연번', 'No.', 'N O']
  };
  function matchHead(cell) {
    if (cell == null) return null;
    var raw = String(cell).trim();
    if (!raw) return null;
    // 특수문자·공백 제거 후 소문자 변환
    var s = raw.replace(/[\s\(\)\[\]\._\-·\/]/g, '').toLowerCase();
    for (var key in HEAD) {
      for (var i = 0; i < HEAD[key].length; i++) {
        var target = HEAD[key][i].replace(/[\s\(\)\[\]\._\-·\/]/g, '').toLowerCase();
        // 완전 일치
        if (s === target) return key;
        // 셀 텍스트 안에 키워드가 포함된 경우 (단, 셀 텍스트 길이가 키워드의 2배 이내일 때만)
        if (target.length >= 2 && s.length <= target.length * 2 && s.indexOf(target) >= 0) return key;
      }
    }
    return null;
  }

  function onExcel(e, callback) {
    var file = e.target && e.target.files && e.target.files[0];
    if (!file) return;
    var isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    var fr = new FileReader();

    if (isCsv) {                       // CSV 는 외부 라이브러리 없이 직접 처리
      fr.onload = function () {
        try {
          parseRows(parseCsv(stripBom(fr.result)));
          if (callback) callback();
        }
        catch (err) { console.error(err); UI.toast('CSV 파일을 읽지 못했습니다.', true); }
      };
      fr.readAsText(file, 'utf-8');
      return;
    }

    if (typeof XLSX === 'undefined') {
      UI.toast('엑셀 변환 기능을 불러오지 못했습니다. 엑셀에서 "CSV UTF-8"로 저장한 뒤 올려 주세요.', true);
      return;
    }
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
        parseRows(rows);
        if (callback) callback();
      } catch (err) {
        console.error(err);
        UI.toast('엑셀 파일을 읽지 못했습니다: ' + (err.message || err), true);
      }
    };
    fr.readAsArrayBuffer(file);
  }

  function stripBom(t) { return t.charCodeAt(0) === 0xFEFF ? t.slice(1) : t; }

  /** 따옴표를 지원하는 간이 CSV 파서 */
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function parseRows(rows) {
    var headIdx = -1, map = null;
    var maxHit = 0, bestRow = -1, bestMap = null;
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var m = {}, hit = 0;
      rows[r].forEach(function (cell, c) {
        var k = matchHead(cell);
        if (k && k !== 'seq' && m[k] === undefined) { m[k] = c; hit++; }
      });
      if (hit > maxHit) { maxHit = hit; bestRow = r; bestMap = m; }
    }
    if (maxHit >= 2 || (maxHit === 1 && bestMap && bestMap.name !== undefined)) {
      headIdx = bestRow; map = bestMap;
    }
    console.log('[parseRows] Header detection: row=' + headIdx + ', hits=' + maxHit + ', map=', map);
    if (headIdx >= 0 && rows[headIdx]) {
      console.log('[parseRows] Header row contents:', rows[headIdx].map(function(c) { return String(c).trim(); }));
    }

    // fallback: 머리글을 찾지 못한 경우 (순번, 실국, 부서, 성명, 직급 또는 실국, 부서, 직급, 성명 추측)
    if (headIdx < 0 && rows.length > 0) {
      headIdx = 0;
      map = { bureau: 0, dept: 1, rank: 2, name: 3 };
      if (rows[0].length >= 5) {
        map = { bureau: 1, dept: 2, name: 3, rank: 4 };
      }
    }

    var box = document.getElementById('preview');
    if (headIdx < 0 || !map) {
      box.innerHTML = '<div class="notice" style="border-left-color:var(--critical)">' +
        '<strong>머리글을 찾지 못했습니다.</strong><br>첫 행에 <code>실국 · 부서 · 직급 · 성명</code> 열 이름이 있는지 확인해 주세요.</div>';
      return;
    }
    var out = [];
    var startRow = headIdx + 1;
    // If the guessed header row doesn't look like headers (e.g. strict fallback), we might need to read from row 0.
    // But safely start from headIdx + 1, unless headIdx is 0 and it's a raw data file without headers.
    if (headIdx === 0 && map.name !== undefined && matchHead(rows[0][map.name]) !== 'name') {
      startRow = 0;
    }
    for (var i = startRow; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.length) continue;
      var nameIdx = map.name !== undefined ? map.name : 3;
      var name = txt(row[nameIdx]);
      if (!name || name === '성명' || name === '이름') continue;
      out.push({
        bureau: map.bureau !== undefined ? txt(row[map.bureau]) : '',
        dept: map.dept !== undefined ? txt(row[map.dept]) : '',
        name: map.name !== undefined ? txt(row[map.name]) : name,
        rank: map.rank !== undefined ? txt(row[map.rank]) : '',
        createdAt: Date.now()
      });
    }
    function txt(v) { return String(v == null ? '' : v).trim(); }

    if (!out.length) {
      box.innerHTML = '<div class="notice" style="border-left-color:var(--critical)">읽을 수 있는 데이터 행이 없습니다. 엑셀 파일 내용을 확인해 주세요.</div>';
      return;
    }
    state.pending = out;
    box.innerHTML =
      '<div class="notice" style="border-left-color:var(--good)">' +
        '<strong>' + out.length + '명</strong>의 명단을 읽었습니다. ' +
        '(헤더 ' + (headIdx + 1) + '행, 열 매핑: ' +
        (map.bureau !== undefined ? '실국=' + (map.bureau + 1) + '열 ' : '') +
        (map.dept !== undefined ? '부서=' + (map.dept + 1) + '열 ' : '') +
        (map.name !== undefined ? '성명=' + (map.name + 1) + '열 ' : '') +
        (map.rank !== undefined ? '직급=' + (map.rank + 1) + '열' : '') + ')' +
        '<br>아래 <strong>[📥 엑셀 명단 저장하기]</strong> 또는 <strong>[명단 등록 완료]</strong> 버튼을 누르면 DB에 저장됩니다.</div>' +
      '<div class="table-scroll"><table class="data"><thead><tr><th class="num">#</th><th>실국</th><th>부서</th><th>직급</th><th>성명</th></tr></thead><tbody>' +
        out.slice(0, 8).map(function (m, i) {
          return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(m.bureau) + '</td><td>' + esc(m.dept) + '</td><td>' + esc(m.rank) + '</td><td>' + esc(m.name) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' +
      (out.length > 8 ? '<p class="hint">앞 8명만 미리보기로 표시했습니다.</p>' : '') +
      '<div class="btn-row" style="margin-top:12px"><button class="btn btn--primary" id="btnApply" style="font-weight:bold">명단 등록 완료</button>' +
      '<button class="btn" id="btnCancelUp">취소</button></div>';

    document.getElementById('btnCancelUp').onclick = function () {
      state.pending = null; box.innerHTML = ''; document.getElementById('xls').value = '';
    };
    document.getElementById('btnApply').onclick = applyPending;
  }

  function applyPending() {
    var mode = document.getElementById('mergeMode').value;
    var incoming = state.pending || [];
    if (!incoming.length) {
      UI.toast('등록할 명단 데이터가 없습니다. 엑셀 파일을 다시 선택해 주세요.', true);
      return;
    }
    var btn = document.getElementById('btnApply');
    var btnSaveXls = document.getElementById('btnSaveXls');
    if (btn) { btn.disabled = true; btn.textContent = '등록 중… (' + incoming.length + '명)'; }
    if (btnSaveXls) { btnSaveXls.disabled = true; btnSaveXls.textContent = '저장 중… (' + incoming.length + '명)'; }

    var task;
    if (mode === 'replace') {
      task = Store.clear('members').then(function () { return Store.putMany('members', incoming); });
    } else {
      var seen = {};
      state.members.forEach(function (m) { seen[key(m)] = 1; });
      var fresh = incoming.filter(function (m) { if (seen[key(m)]) return false; seen[key(m)] = 1; return true; });
      task = fresh.length ? Store.putMany('members', fresh) : Promise.resolve(0);
    }
    task.then(function (n) {
      state.pending = null;
      var msg = mode === 'replace' ? incoming.length + '명으로 명단을 교체·저장했습니다.' : (n || 0) + '명을 명단에 추가·저장했습니다.';
      UI.toast(msg);
      alert(msg);
      paint();
    }).catch(function (e) {
      console.error(e);
      var errMsg = e.message || String(e);
      if (errMsg.indexOf('insufficient permissions') >= 0 || errMsg.indexOf('permission-denied') >= 0) {
        UI.toast('Firebase 권한 허용이 필요합니다.', true);
        alert(
          '🔒 [Firebase 데이터베이스 권한 오류]\n\n' +
          'Firebase 콘솔 보안 규칙이 쓰기를 차단하고 있습니다.\n\n' +
          '【 해결 방법 (1분 소요) 】\n' +
          '1. Firebase 콘솔(https://console.firebase.google.com) 접속\n' +
          '2. 내 프로젝트(ddang-8edd6) > Firestore Database > [규칙] 탭 선택\n' +
          '3. 아래 규칙으로 수정 후 [게시] 버튼 클릭:\n\n' +
          'rules_version = \'2\';\n' +
          'service cloud.firestore {\n' +
          '  match /databases/{database}/documents {\n' +
          '    match /{col}/{docId} {\n' +
          '      allow read, write: if col in [\'members\', \'materials\', \'completions\', \'settings\'];\n' +
          '    }\n' +
          '  }\n' +
          '}'
        );
      } else {
        UI.toast('저장 실패: ' + errMsg, true);
        alert('저장에 실패했습니다.\n사유: ' + errMsg);
      }
      if (btn) { btn.disabled = false; btn.textContent = '명단 등록 완료'; }
      if (btnSaveXls) { btnSaveXls.disabled = false; btnSaveXls.textContent = '📥 엑셀 명단 저장하기'; }
    });
    function key(m) { return [m.bureau, m.dept, m.name, m.rank].join('|'); }
  }

  function downloadTemplate() {
    UI.downloadCSV('교육대상자_명단양식.csv', [
      ['순번', '실국', '부서', '성명', '직급'],
      [1, '기획조정실', '홍보담당관', '홍길동', '팀장'],
      [2, '기획조정실', '기획담당관', '김철수', '주무관']
    ]);
    UI.toast('양식을 내려받았습니다. 엑셀에서 열어 작성하세요.');
  }

  function exportMembers() {
    var rows = [['순번', '실국', '부서', '성명', '직급']];
    state.members.forEach(function (m, i) { rows.push([i + 1, m.bureau, m.dept, m.name, m.rank]); });
    UI.downloadCSV('교육대상자_명단.csv', rows);
  }

  /* ================= 2. 교육자료 · 퀴즈 ================= */
  function paintMaterials(p) {
    var list = Stats.activeMaterials(state.materials)
      .concat(state.materials.filter(function (m) { return m.active === false; }));
    p.innerHTML =
      '<section class="card">' +
        '<div class="card__head"><div>' +
          '<h2 class="card__title">교육자료 (' + state.materials.length + '건)</h2>' +
          '<p class="card__desc">영상·문서 링크를 올리거나 파일을 직접 업로드합니다. 교육 수료 시 공통 수료 응답 3문항(난이도, 주요 키워드, 느낀점 및 평가)이 자동으로 제공됩니다.</p>' +
        '</div><div class="card__head-actions">' +
          '<button class="btn btn--primary btn--sm" id="btnNewMat">+ 교육자료 등록</button>' +
        '</div></div>' +
        (list.length
          ? '<div class="table-scroll"><table class="data"><thead><tr>' +
            '<th>제목</th><th>유형</th><th>수료 조건</th><th class="num">수료</th><th>공개</th><th>관리</th></tr></thead><tbody>' +
            list.map(function (m) {
              var cnt = state.completions.filter(function (c) { return c.materialId === m.id; }).length;
              return '<tr><td><strong>' + esc(m.title) + '</strong>' +
                (m.desc ? '<br><span class="hint">' + esc(String(m.desc).slice(0, 50)) + '</span>' : '') + '</td>' +
                '<td>' + (m.file ? '파일 · ' + esc(UI.fmtSize(m.file.size)) : '링크') + '</td>' +
                '<td>공통 응답 3문항</td>' +
                '<td class="num">' + cnt + '명</td>' +
                '<td>' + (m.active === false ? '<span class="badge">비공개</span>' : '<span class="badge badge--done">공개</span>') + '</td>' +
                '<td><button class="btn btn--sm" data-me="' + esc(m.id) + '">수정</button> ' +
                '<button class="btn btn--sm btn--danger" data-md="' + esc(m.id) + '">삭제</button></td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="empty">등록된 교육자료가 없습니다.</div>') +
      '</section>';

    document.getElementById('btnNewMat').onclick = function () { editMaterial(null); };
    UI.$$('[data-me]', p).forEach(function (b) {
      b.onclick = function () { editMaterial(state.materials.filter(function (m) { return m.id === b.getAttribute('data-me'); })[0]); };
    });
    UI.$$('[data-md]', p).forEach(function (b) {
      b.onclick = function () {
        var m = state.materials.filter(function (x) { return x.id === b.getAttribute('data-md'); })[0];
        if (!m || !confirm('"' + m.title + '" 자료를 삭제할까요? 관련 수료 기록은 남습니다.')) return;
        Store.deleteUploadedFile(m.file).then(function () { return Store.remove('materials', m.id); })
          .then(function () { UI.toast('삭제했습니다.'); });
      };
    });
  }

  function editMaterial(m) {
    var isNew = !m;
    m = m || { title: '', desc: '', url: '', minViewSec: 0, active: true };
    var uploaded = m.file || null;

    UI.modal(
      '<h3>' + (isNew ? '교육자료 등록' : '교육자료 수정') + '</h3>' +
      '<label class="field"><span>제목 *</span><input type="text" name="title" value="' + esc(m.title) + '" placeholder="예) 2026년 상반기 청렴교육"></label>' +
      '<label class="field"><span>설명</span><textarea name="desc" placeholder="교육 개요·유의사항 등">' + esc(m.desc || '') + '</textarea></label>' +
      '<label class="field"><span>자료 주소(URL)</span><input type="text" name="url" value="' + esc(m.url || '') + '" placeholder="https://www.youtube.com/watch?v=... 또는 문서 링크"></label>' +
      '<label class="field"><span>또는 파일 업로드</span><input type="file" name="file">' +
        '<span class="hint" id="fileHint">' + (uploaded ? '현재 파일: ' + esc(uploaded.name) + ' (' + UI.fmtSize(uploaded.size) + ')' :
          '영상은 유튜브 등에 올린 뒤 URL 등록을 권장합니다. (최대 ' + (CFG.maxUploadMB || 20) + 'MB)') + '</span></label>' +
      '<div class="grid grid--2">' +
        '<label class="field"><span>최소 시청 시간(초)</span><input type="number" name="minViewSec" min="0" value="' + (m.minViewSec || 0) + '">' +
          '<span class="hint">0이면 제한 없음. 예) 300 = 5분 후 작성 가능</span></label>' +
        '<label class="field"><span>공개 여부</span><select name="active">' +
          '<option value="1"' + (m.active === false ? '' : ' selected') + '>공개 (수료 집계 포함)</option>' +
          '<option value="0"' + (m.active === false ? ' selected' : '') + '>비공개</option></select></label>' +
      '</div>' +
      '<div class="card" style="background:var(--surface-2);margin:16px 0;padding:12px;border-radius:8px">' +
        '<h4 style="margin:0 0 6px;font-size:14px">수료 필수 응답 문항 (자동 적용)</h4>' +
        '<ol style="margin:0;padding-left:18px;font-size:13px;color:var(--text-secondary)">' +
          '<li>귀하가 느끼는 난이도 정도</li>' +
          '<li>영상의 주요 키워드(3개이상)</li>' +
          '<li>느낀점 및 평가(업무적용가능성, 재미 등)</li>' +
        '</ol>' +
        '<p class="hint" style="margin:6px 0 0">※ 교육생이 위 3가지 문항에 모두 답변하면 정답 검증 없이 수료 처리됩니다.</p>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:6px">' +
        '<button class="btn btn--primary" id="ok">저장</button>' +
        '<button class="btn" id="cancel">취소</button>' +
        '<span class="hint" id="saveHint" style="margin:0;align-self:center"></span>' +
      '</div>',
      function (root, close) {
        root.querySelector('#cancel').onclick = close;
        var fileInput = root.querySelector('[name=file]');
        fileInput.onchange = function () {
          var f = fileInput.files[0];
          if (!f) return;
          root.querySelector('#fileHint').textContent = '업로드 대기: ' + f.name + ' (' + UI.fmtSize(f.size) + ')';
        };
        root.querySelector('#ok').onclick = function () {
          var title = val('title');
          if (!title) { UI.toast('제목을 입력하세요.', true); return; }
          var hint = root.querySelector('#saveHint');
          var btn = root.querySelector('#ok');
          btn.disabled = true; hint.textContent = '저장 중…';

          var f = fileInput.files[0];
          var pre = f ? Store.uploadFile(f, function (pc) { hint.textContent = '업로드 중… ' + pc + '%'; })
                      : Promise.resolve(uploaded);
          pre.then(function (fileInfo) {
            var rec = {
              id: m.id, title: title, desc: val('desc'),
              url: f && fileInfo ? fileInfo.url : val('url'),
              file: fileInfo ? { name: fileInfo.name, size: fileInfo.size, kind: fileInfo.kind, path: fileInfo.path || '', mime: (f && f.type) || (uploaded && uploaded.mime) || '' } : null,
              minViewSec: Number(val('minViewSec') || 0),
              active: root.querySelector('[name=active]').value === '1',
              createdAt: m.createdAt || Date.now(),
              updatedAt: Date.now()
            };
            if (!rec.url) throw new Error('자료 주소(URL)를 입력하거나 파일을 업로드하세요.');
            if (!rec.file) delete rec.file;
            return Store.put('materials', rec);
          }).then(function () {
            UI.toast('저장했습니다.'); close();
          }).catch(function (err) {
            console.error(err);
            hint.textContent = '';
            btn.disabled = false;
            alert('저장 실패\n\n' + (err.message || err));
          });
        };
        function val(k) {
          var el = root.querySelector('[name=' + k + ']');
          return el ? String(el.value).trim() : '';
        }
      }
    );
  }

  /* ================= 3. 수료 현황 ================= */
  function paintRecords(p) {
    var recs = state.completions.slice().sort(function (a, b) { return (b.completedAt || 0) - (a.completedAt || 0); });
    var byId = {}; state.members.forEach(function (m) { byId[m.id] = m; });
    p.innerHTML =
      '<section class="card">' +
        '<div class="card__head"><div>' +
          '<h2 class="card__title">수료 기록 (' + recs.length + '건)</h2>' +
          '<p class="card__desc">수료 응답 3문항 작성을 완료하여 수료 처리된 기록입니다.</p>' +
        '</div><div class="card__head-actions">' +
          '<button class="btn btn--sm" id="btnExpRec">수료자 명단 내려받기</button>' +
          '<button class="btn btn--sm btn--danger" id="btnClearRec">기록 전체 삭제</button>' +
        '</div></div>' +
        (recs.length
          ? '<div class="table-scroll"><table class="data"><thead><tr>' +
            '<th>수료일시</th><th>실국</th><th>부서</th><th>직급</th><th>성명</th><th>교육과정</th><th>난이도</th><th>주요 키워드</th><th>느낀점 및 평가</th><th>관리</th></tr></thead><tbody>' +
            recs.slice(0, 500).map(function (c) {
              var m = byId[c.memberId];
              return '<tr><td>' + UI.fmtDate(c.completedAt) + '</td>' +
                '<td>' + esc((m && m.bureau) || c.bureau) + '</td><td>' + esc((m && m.dept) || c.dept) + '</td>' +
                '<td>' + esc((m && m.rank) || c.rank) + '</td><td>' + esc((m && m.name) || c.name) +
                (m ? '' : ' <span class="badge">명단없음</span>') + '</td>' +
                '<td>' + esc(c.materialTitle || '') + '</td>' +
                '<td>' + esc(c.difficulty || '보통') + '</td>' +
                '<td>' + esc(c.keywords || '-') + '</td>' +
                '<td>' + esc(c.feedback || '-') + '</td>' +
                '<td><button class="btn btn--sm btn--danger" data-rd="' + esc(c.id) + '">취소</button></td></tr>';
            }).join('') + '</tbody></table></div>' +
            (recs.length > 500 ? '<p class="hint">최근 500건만 표시했습니다.</p>' : '')
          : '<div class="empty">아직 수료 기록이 없습니다.</div>') +
      '</section>';

    document.getElementById('btnExpRec').onclick = function () {
      var rows = [['수료일시', '실국', '부서', '직급', '성명', '교육과정', '난이도', '주요 키워드(3개 이상)', '느낀점 및 평가']];
      recs.forEach(function (c) {
        var m = byId[c.memberId] || {};
        rows.push([UI.fmtDate(c.completedAt), m.bureau || c.bureau, m.dept || c.dept, m.rank || c.rank,
          m.name || c.name, c.materialTitle || '', c.difficulty || '', c.keywords || '', c.feedback || '']);
      });
      UI.downloadCSV('교육수료자명단.csv', rows);
    };
    document.getElementById('btnClearRec').onclick = function () {
      if (!confirm('수료 기록 ' + recs.length + '건을 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
      Store.clear('completions').then(function () { UI.toast('수료 기록을 삭제했습니다.'); });
    };
    UI.$$('[data-rd]', p).forEach(function (b) {
      b.onclick = function () {
        if (!confirm('이 수료 기록을 취소할까요?')) return;
        Store.remove('completions', b.getAttribute('data-rd')).then(function () { UI.toast('취소했습니다.'); });
      };
    });
  }

  /* ================= 4. 설정 ================= */
  function paintSettings(p) {
    p.innerHTML =
      '<section class="card" style="max-width:560px">' +
        '<h2 class="card__title">관리자 비밀번호 변경</h2>' +
        '<p class="card__desc">변경한 비밀번호는 저장소에 암호화(SHA-256)되어 보관됩니다.</p>' +
        '<label class="field"><span>현재 비밀번호</span><input type="password" id="pw0"></label>' +
        '<label class="field"><span>새 비밀번호</span><input type="password" id="pw1"></label>' +
        '<label class="field"><span>새 비밀번호 확인</span><input type="password" id="pw2"></label>' +
        '<button class="btn btn--primary" id="btnPw">변경</button>' +
      '</section>' +
      '<section class="card" style="max-width:560px">' +
        '<h2 class="card__title">저장소 상태</h2>' +
        '<p class="card__desc" id="modeDesc">확인 중…</p>' +
        '<div class="table-scroll"><table class="data"><tbody>' +
          '<tr><th>명단</th><td class="num">' + state.members.length + '명</td></tr>' +
          '<tr><th>교육자료</th><td class="num">' + state.materials.length + '건</td></tr>' +
          '<tr><th>수료 기록</th><td class="num">' + state.completions.length + '건</td></tr>' +
        '</tbody></table></div>' +
        '<div class="btn-row" style="margin-top:14px">' +
          '<button class="btn btn--sm" id="btnBackup">전체 데이터 백업(JSON)</button>' +
          '<label class="btn btn--sm" style="cursor:pointer">복원(JSON 불러오기)<input type="file" id="restore" accept=".json" hidden></label>' +
          '<button class="btn btn--sm" id="btnLogout">관리자 로그아웃</button>' +
        '</div>' +
      '</section>';

    Store.ready().then(function (mode) {
      document.getElementById('modeDesc').textContent = mode === 'firebase'
        ? 'Firebase(Firestore)에 저장 중입니다. 모든 사용자의 수료 기록이 실시간으로 합산됩니다.'
        : 'js/config.js 에 Firebase 설정이 없어 이 브라우저에만 저장됩니다. 실제 운영 전에 설정을 입력하세요.';
    });

    document.getElementById('btnPw').onclick = function () {
      var a = document.getElementById('pw0').value,
          b = document.getElementById('pw1').value,
          c = document.getElementById('pw2').value;
      if (b.length < 4) { UI.toast('새 비밀번호는 4자 이상 입력하세요.', true); return; }
      if (b !== c) { UI.toast('새 비밀번호가 서로 다릅니다.', true); return; }
      UI.hash(a).then(function (h0) {
        var saved = Store.settings().adminHash;
        if (saved && h0 !== saved) { UI.toast('현재 비밀번호가 일치하지 않습니다.', true); return; }
        return UI.hash(b).then(function (h1) {
          return Store.saveSettings({ adminHash: h1 }).then(function () {
            UI.toast('비밀번호를 변경했습니다.');
            document.getElementById('pw0').value = document.getElementById('pw1').value = document.getElementById('pw2').value = '';
          });
        });
      });
    };
    document.getElementById('btnBackup').onclick = function () {
      var data = { members: state.members, materials: state.materials, completions: state.completions, exportedAt: Date.now() };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '교육수료관리_백업_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
    document.getElementById('restore').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      if (!confirm('백업 파일의 내용으로 현재 데이터를 덮어씁니다. 계속할까요?')) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var d = JSON.parse(fr.result);
          var jobs = ['members', 'materials', 'completions'].filter(function (k) { return Array.isArray(d[k]); })
            .map(function (k) { return function () { return Store.clear(k).then(function () { return Store.putMany(k, d[k]); }); }; });
          jobs.reduce(function (p2, j) { return p2.then(j); }, Promise.resolve())
            .then(function () { UI.toast('복원했습니다.'); paint(); });
        } catch (err) { UI.toast('백업 파일을 읽지 못했습니다.', true); }
      };
      fr.readAsText(f);
    };
    document.getElementById('btnLogout').onclick = function () {
      sessionStorage.removeItem(SESSION_KEY);
      document.getElementById('admin').hidden = true;
      renderGate();
    };
  }

  /* ---------- 시작 ---------- */
  Store.ready().then(renderGate);
  renderGate();
})();
