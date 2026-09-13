/* ============================================================
   learn.js — 교육 수강 · 퀴즈 · 수료 처리
   ============================================================ */
(function () {
  'use strict';
  var esc = UI.esc, Stats = UI.Stats, CFG = window.APP_CONFIG || {};

  UI.renderHeader('learn.html');
  Store.boot();

  var state = { members: [], materials: [], completions: [], me: UI.Me.get(), view: null, loaded: false, viewerFor: null };

  Store.subscribe('members', function (d) { state.members = d; verifyMe(); render(); });
  Store.subscribe('materials', function (d) { state.materials = d; render(); });
  Store.subscribe('completions', function (d) { state.completions = d; render(); });
  Store.ready().then(function () { state.loaded = true; render(); });

  /* 저장된 본인정보가 명단에 아직 있는지 확인 */
  function verifyMe() {
    if (!state.me || !state.members.length) return;
    var found = state.members.filter(function (m) { return m.id === state.me.id; })[0];
    if (found) state.me = { id: found.id, name: found.name, bureau: found.bureau, dept: found.dept, rank: found.rank };
    else { state.me = null; UI.Me.clear(); }
  }

  /* ---------------- 렌더 ---------------- */
  function render() {
    renderWho();
    if (state.view) {
      // 이미 그려진 학습 화면은 다시 그리지 않는다.
      // (다른 사용자의 수료 기록이 들어와도 시청 중인 영상·퀴즈가 초기화되지 않도록)
      if (state.viewerFor !== state.view.id) { state.viewerFor = state.view.id; renderViewer(); }
    } else {
      state.viewerFor = null;
      renderList();
    }
  }

  function renderWho() {
    var box = document.getElementById('whoBox');
    if (!state.me) { box.innerHTML = ''; return; }
    var m = state.me;
    box.innerHTML =
      '<div class="card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<div><strong style="font-size:16px">' + esc(m.name) + '</strong> 님' +
      '<div style="font-size:13px;color:var(--text-secondary)">' + esc(m.bureau) + ' · ' + esc(m.dept) + ' · ' + esc(m.rank) + '</div></div>' +
      '<button class="btn btn--sm" id="btnChangeMe" style="margin-left:auto">다른 사람으로 변경</button>' +
      '</div>';
    document.getElementById('btnChangeMe').onclick = function () {
      UI.Me.clear(); state.me = null; state.view = null; state.viewerFor = null; render();
    };
  }

  /* ---------------- 본인 확인 ---------------- */
  function renderIdentify() {
    var c = document.getElementById('content');
    var bureaus = uniq(state.members.map(function (m) { return m.bureau; }));
    c.innerHTML =
      '<section class="card">' +
      '<h2 class="card__title">본인 확인</h2>' +
      '<p class="card__desc">소속과 성명을 선택하세요. 선택한 정보로 수료 처리됩니다.</p>' +
      (state.members.length ? '' : '<div class="notice"><strong>명단이 아직 등록되지 않았습니다.</strong> 관리자에게 문의하세요.</div>') +
      '<div class="grid grid--2">' +
      '<label class="field"><span>실국</span><select id="selB"><option value="">선택하세요</option>' +
      bureaus.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>부서</span><select id="selD" disabled><option value="">실국을 먼저 선택</option></select></label>' +
      '</div>' +
      '<label class="field"><span>성명</span><select id="selN" disabled><option value="">부서를 먼저 선택</option></select></label>' +
      '<button class="btn btn--primary" id="btnGo" disabled>본인 확인 완료</button>' +
      '</section>';

    var selB = document.getElementById('selB'), selD = document.getElementById('selD'),
      selN = document.getElementById('selN'), btn = document.getElementById('btnGo');

    // Fill initial bureaus
    selB.innerHTML = '<option value="$$none$$">선택하세요</option>' + 
      bureaus.map(function (b) { return '<option value="' + esc(b) + '">' + esc(b || '(소속 없음)') + '</option>'; }).join('');

    selB.onchange = function () {
      if (selB.value === '$$none$$') {
        selD.innerHTML = '<option value="$$none$$">실국을 먼저 선택</option>'; selD.disabled = true;
        selN.innerHTML = '<option value="$$none$$">부서를 먼저 선택</option>'; selN.disabled = true;
      } else {
        var depts = uniq(state.members.filter(function (m) { return m.bureau === selB.value; }).map(function (m) { return m.dept; }));
        selD.innerHTML = '<option value="$$none$$">선택하세요</option>' + depts.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d || '(부서 없음)') + '</option>'; }).join('');
        selD.disabled = false;
        selN.innerHTML = '<option value="$$none$$">부서를 먼저 선택</option>'; selN.disabled = true;
      }
      btn.disabled = true;
    };
    selD.onchange = function () {
      if (selD.value === '$$none$$') {
        selN.innerHTML = '<option value="$$none$$">부서를 먼저 선택</option>'; selN.disabled = true;
      } else {
        var people = state.members.filter(function (m) { return m.bureau === selB.value && m.dept === selD.value; })
          .sort(function (a, b) { return UI.rankRank(a.rank) - UI.rankRank(b.rank) || (a.name || '').localeCompare(b.name || '', 'ko'); });
        selN.innerHTML = '<option value="$$none$$">선택하세요</option>' + people.map(function (p) {
          return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (' + esc(p.rank) + ')</option>';
        }).join('');
        selN.disabled = false;
      }
      btn.disabled = true;
    };
    selN.onchange = function () { 
      var valid = selN.value && selN.value !== '$$none$$';
      btn.disabled = !valid;
    };
    btn.onclick = function () {
      var m = state.members.filter(function (x) { return x.id === selN.value; })[0];
      if (!m) return;
      state.me = { id: m.id, name: m.name, bureau: m.bureau, dept: m.dept, rank: m.rank };
      UI.Me.set(state.me);
      render();
    };
  }

  /* ---------------- 자료 목록 ---------------- */
  function renderList() {
    if (!state.me) return renderIdentify();
    var c = document.getElementById('content');
    var act = Stats.activeMaterials(state.materials);
    var mine = {};
    state.completions.forEach(function (x) { if (x.memberId === state.me.id) mine[x.materialId] = x; });
    var doneCount = act.filter(function (m) { return mine[m.id]; }).length;

    if (!act.length) {
      c.innerHTML = '<div class="card"><div class="empty">' +
        (state.loaded ? '등록된 교육자료가 없습니다. 관리자가 자료를 올리면 여기에 표시됩니다.' : '불러오는 중…') + '</div></div>';
      return;
    }

    c.innerHTML =
      '<section class="card" style="margin-top:16px">' +
      '<div class="card__head"><div>' +
      '<h2 class="card__title">나의 교육 진도</h2>' +
      '<p class="card__desc">' + doneCount + ' / ' + act.length + ' 과정 수료' +
      (doneCount === act.length ? ' · 모든 교육을 이수하셨습니다. 수고하셨습니다!' : '') + '</p>' +
      '</div></div>' +
      '<div class="bar-row" style="grid-template-columns:1fr 90px">' +
      '<div class="bar-row__track"><div class="bar-row__fill" style="width:' + UI.pct(doneCount, act.length) + '%"></div></div>' +
      '<div class="bar-row__value">' + UI.pct(doneCount, act.length) + '%</div>' +
      '</div>' +
      '</section>' +
      '<div class="material-list" style="margin-top:16px">' +
      act.map(function (m) {
        var done = mine[m.id];
        return '<article class="material">' +
          '<div class="material__top">' +
          '<span class="material__type">' + (m.file ? '첨부파일' : '링크') + '</span>' +
          (done ? '<span class="badge badge--done" style="margin-left:auto">수료 완료</span>'
            : '<span class="badge badge--todo" style="margin-left:auto">미수료</span>') +
          '</div>' +
          '<h3 class="material__title">' + esc(m.title) + '</h3>' +
          (m.desc ? '<p class="material__desc">' + esc(m.desc) + '</p>' : '') +
          '<div class="material__foot">' +
          '<button class="btn ' + (done ? '' : 'btn--primary') + ' btn--sm" data-open="' + esc(m.id) + '">' +
          (done ? '다시 보기' : '학습 시작') + '</button>' +
          (done ? '<span class="hint" style="margin:0">' + UI.fmtDate(done.completedAt) + ' 수료</span>' : '') +
          '</div>' +
          '</article>';
      }).join('') +
      '</div>';

    UI.$$('[data-open]', c).forEach(function (b) {
      b.onclick = function () { state.view = { id: b.getAttribute('data-open'), quiz: false, started: Date.now() }; render(); };
    });
  }

  /* ---------------- 자료 시청 ---------------- */
  function renderViewer() {
    var c = document.getElementById('content');
    var m = state.materials.filter(function (x) { return x.id === state.view.id; })[0];
    if (!m) { state.view = null; state.viewerFor = null; return renderList(); }
    var info = UI.embedInfo(m);
    var already = state.completions.filter(function (x) {
      return x.memberId === state.me.id && x.materialId === m.id;
    })[0];

    var media = '';
    if (info.type === 'iframe') {
      media = '<iframe class="viewer' + (info.wide ? '' : ' viewer--doc') + '" src="' + esc(info.src) +
        '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    } else if (info.type === 'video') {
      media = '<video class="viewer" src="' + esc(info.src) + '" controls controlsList="nodownload"></video>';
    } else if (info.type === 'image') {
      media = '<img class="viewer viewer--doc" style="object-fit:contain;background:var(--surface-2)" src="' + esc(info.src) + '" alt="' + esc(m.title) + '">';
    } else {
      media = '<div class="notice">이 자료는 새 창에서 열립니다. 아래 버튼을 눌러 자료를 확인한 뒤 퀴즈를 풀어 주세요.</div>' +
        '<a class="btn btn--primary" href="' + esc(m.url) + '" target="_blank" rel="noopener">교육자료 열기 ↗</a>';
    }

    var wait = Number(m.minViewSec || 0);
    var elapsed = Math.floor((Date.now() - state.view.started) / 1000);
    var remain = Math.max(0, wait - elapsed);

    c.innerHTML =
      '<section class="card" style="margin-top:16px">' +
      '<div class="card__head"><div>' +
      '<h2 class="card__title">' + esc(m.title) + '</h2>' +
      (m.desc ? '<p class="card__desc">' + esc(m.desc) + '</p>' : '') +
      '</div><div class="card__head-actions">' +
      (already ? '<span class="badge badge--done">수료 완료</span>' : '') +
      '<button class="btn btn--sm" id="btnBack">목록으로</button>' +
      '</div></div>' +
      media +
      (info.type !== 'link' && m.url ? '<p class="hint"><a href="' + esc(m.url) + '" target="_blank" rel="noopener">새 창에서 열기 ↗</a></p>' : '') +
      '<div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn--primary" id="btnQuiz"' + (remain > 0 ? ' disabled' : '') + '>수료 응답 작성하기 (3문항)</button>' +
      '<span class="hint" id="waitHint" style="margin:0">' +
      (remain > 0 ? '자료를 ' + remain + '초 이상 시청한 뒤 작성할 수 있습니다.' : '자료를 끝까지 학습한 뒤 응시하세요.') + '</span>' +
      '</div>' +
      '</section>' +
      '<div id="quizBox"></div>';

    document.getElementById('btnBack').onclick = function () { state.view = null; state.viewerFor = null; render(); };
    document.getElementById('btnQuiz').onclick = function () { renderEvaluation(m); };

    if (remain > 0) {
      var btn = document.getElementById('btnQuiz'), hint = document.getElementById('waitHint');
      var t = setInterval(function () {
        if (!document.body.contains(btn)) { clearInterval(t); return; }
        remain--;
        if (remain <= 0) { clearInterval(t); btn.disabled = false; hint.textContent = '자료를 끝까지 학습한 뒤 응시하세요.'; }
        else hint.textContent = '자료를 ' + remain + '초 이상 시청한 뒤 응시할 수 있습니다.';
      }, 1000);
    }
    if (state.view.quiz) renderEvaluation(m);
  }

  /* ---------------- 수료 응답 (난이도, 키워드, 느낀점) ---------------- */
  function renderEvaluation(m) {
    state.view.quiz = true;
    var box = document.getElementById('quizBox');
    box.innerHTML =
      '<section class="card" style="margin-top:16px">' +
      '<h2 class="card__title">교육 수료 응답 (3문항)</h2>' +
      '<p class="card__desc">아래 3개 항목에 모두 답변해 주시면 수료 처리됩니다.</p>' +
      '<form id="quizForm">' +
      '<div class="quiz-q">' +
      '<p class="quiz-q__title">1. 귀하가 느끼는 난이도 정도</p>' +
      '<div class="choice-grid" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">' +
      ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움'].map(function (diff) {
        return '<label class="quiz-choice" style="margin:0"><input type="radio" name="difficulty" value="' + esc(diff) + '"><span>' + esc(diff) + '</span></label>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div class="quiz-q" style="margin-top:16px">' +
      '<p class="quiz-q__title">2. 영상의 주요 키워드(3개이상)</p>' +
      '<input type="text" name="keywords" placeholder="예: 청렴, 부패방지, 공직윤리 (3개 이상 키워드 작성)" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px">' +
      '</div>' +
      '<div class="quiz-q" style="margin-top:16px">' +
      '<p class="quiz-q__title">3. 느낀점 및 평가(업무적용가능성, 재미 등)</p>' +
      '<textarea name="feedback" rows="4" placeholder="교육에 대한 소감, 업무 적용 가능성, 기타 평가를 자유롭게 작성해 주세요." style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px;resize:vertical"></textarea>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:20px">' +
      '<button type="submit" class="btn btn--primary">수료 제출하기</button>' +
      '<button type="button" class="btn" id="btnCancelQuiz">취소</button>' +
      '</div>' +
      '</form>' +
      '<div id="quizResult"></div>' +
      '</section>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('btnCancelQuiz').onclick = function () { state.view.quiz = false; box.innerHTML = ''; };
    document.getElementById('quizForm').onsubmit = function (e) {
      e.preventDefault();
      var form = e.target;
      var diffSel = form.querySelector('input[name="difficulty"]:checked');
      var keywords = (form.querySelector('input[name="keywords"]').value || '').trim();
      var feedback = (form.querySelector('textarea[name="feedback"]').value || '').trim();

      if (!diffSel) { UI.toast('1번 문항(난이도)을 선택해 주세요.', true); return; }
      if (!keywords) { UI.toast('2번 문항(주요 키워드 3개 이상)을 작성해 주세요.', true); return; }
      if (!feedback) { UI.toast('3번 문항(느낀점 및 평가)을 작성해 주세요.', true); return; }

      submitEvaluation(m, diffSel.value, keywords, feedback);
    };
  }

  function submitEvaluation(m, difficulty, keywords, feedback) {
    var res = document.getElementById('quizResult');
    res.innerHTML = '<div class="notice" style="margin-top:14px;border-left-color:var(--good)">저장 중…</div>';
    var rec = {
      id: state.me.id + '__' + m.id,
      memberId: state.me.id, materialId: m.id,
      name: state.me.name, bureau: state.me.bureau, dept: state.me.dept, rank: state.me.rank,
      materialTitle: m.title,
      difficulty: difficulty,
      keywords: keywords,
      feedback: feedback,
      score: 3, total: 3,
      completedAt: Date.now()
    };
    Store.put('completions', rec).then(function () {
      var form = document.getElementById('quizForm');
      if (form) {
        UI.$$('#quizForm input, #quizForm textarea').forEach(function (i) { i.disabled = true; });
        var row = form.querySelector('.btn-row'); if (row) row.remove();
      }
      res.innerHTML = '<div class="notice" style="margin-top:14px;border-left-color:var(--good)">' +
        '<strong>축하합니다! 수료 응답 제출이 완료되어 수료 처리되었습니다.</strong><br>' +
        esc(m.title) + ' · ' + UI.fmtDate(rec.completedAt) + '</div>' +
        '<button class="btn btn--primary" id="btnDone">교육 목록으로</button>';
      document.getElementById('btnDone').onclick = function () { state.view = null; state.viewerFor = null; render(); };
      res.scrollIntoView({ behavior: 'smooth', block: 'center' });
      UI.toast('수료 처리되었습니다.');
    }).catch(function (err) {
      console.error(err);
      res.innerHTML = '<div class="notice" style="border-left-color:var(--critical)">저장에 실패했습니다: ' + esc(err.message || err) + '</div>';
    });
  }

  function uniq(arr) {
    var out = [];
    arr.forEach(function (v) { if (v && out.indexOf(v) < 0) out.push(v); });
    return out.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }
})();
