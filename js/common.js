/* ============================================================
   common.js — 공통 UI · 유틸 · 집계 함수
   ============================================================ */
(function (global) {
  'use strict';
  var CFG = global.APP_CONFIG || {};

  /* ---------------- 기본 유틸 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 1000) / 10 : 0; }
  function fmtDate(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (isNaN(d)) return '-';
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtSize(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + 'B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + 'KB';
    return (Math.round(b / 1024 / 1024 * 10) / 10) + 'MB';
  }

  /* ---------------- 토스트 ---------------- */
  var toastHost = null;
  function toast(msg, bad) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toast-host';
      document.body.appendChild(toastHost);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' toast--bad' : '');
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 250);
    }, bad ? 4200 : 2600);
  }

  /* ---------------- 헤더 ---------------- */
  function renderHeader(active) {
    var pages = [
      { href: 'index.html', label: '수료 현황' },
      { href: 'learn.html', label: '교육받기' },
      { href: 'admin.html', label: '관리자' }
    ];
    var html =
      '<div class="site-header__inner">' +
        '<a class="brand" href="index.html">' +
          '<span class="brand__mark">교</span>' +
          '<span><span class="brand__name">' + esc(CFG.siteName || '교육 수료관리 시스템') + '</span>' +
          '<br><span class="brand__sub">' + esc(CFG.orgName || '') + '</span></span>' +
        '</a>' +
        '<nav class="nav">' +
          pages.map(function (p) {
            return '<a href="' + p.href + '"' + (p.href === active ? ' aria-current="page"' : '') + '>' + p.label + '</a>';
          }).join('') +
          '<span id="modeTag" class="mode-tag" style="align-self:center;margin-left:8px"></span>' +
        '</nav>' +
      '</div>';
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = html;
    document.body.insertBefore(header, document.body.firstChild);

    Store.ready().then(function (mode) {
      var tag = document.getElementById('modeTag');
      if (!tag) return;
      if (mode === 'firebase') { tag.textContent = '실시간 공유'; tag.title = 'Firebase 에 저장됩니다.'; }
      else {
        tag.textContent = '로컬 저장';
        tag.className = 'mode-tag mode-tag--local';
        tag.title = 'js/config.js 에 Firebase 설정이 없어 이 브라우저에만 저장됩니다.';
      }
    });
  }

  /* ---------------- 직급 정렬 ---------------- */
  var RANK_ORDER = ['실장','국장','과장','담당관','팀장','사무관','주무관',
    '4급','5급','6급','7급','8급','9급',
    '2급','3급','1급','서기관','사무관(5급)','주사','주사보','서기','서기보','공무직','기타'];
  function rankRank(r) {
    var i = RANK_ORDER.indexOf(String(r || '').trim());
    return i < 0 ? 500 : i;
  }

  /* ---------------- 집계 ---------------- */
  var Stats = {
    /** 활성 교육자료만 */
    activeMaterials: function (materials) {
      return materials.filter(function (m) { return m.active !== false; })
        .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    },

    /**
     * 수료 판정 맵 생성
     * materialId === '__ALL__' 이면 "활성 자료 전부 수료" 기준
     * 반환: { memberId: true/false }
     */
    doneMap: function (members, materials, completions, materialId) {
      var act = Stats.activeMaterials(materials);
      var targets = materialId && materialId !== '__ALL__'
        ? act.filter(function (m) { return m.id === materialId; })
        : act;
      var need = {}; targets.forEach(function (m) { need[m.id] = true; });
      var needCount = targets.length;

      var per = {};
      completions.forEach(function (c) {
        if (!need[c.materialId]) return;
        if (!per[c.memberId]) per[c.memberId] = {};
        per[c.memberId][c.materialId] = true;
      });
      var map = {};
      members.forEach(function (m) {
        var got = per[m.id] ? Object.keys(per[m.id]).length : 0;
        map[m.id] = needCount > 0 && got >= needCount;
      });
      map.__needCount = needCount;
      map.__per = per;
      return map;
    },

    /** key 함수로 묶어 {key, total, done, rate} 배열 반환 */
    groupBy: function (members, doneMap, keyFn) {
      var g = {};
      members.forEach(function (m) {
        var k = keyFn(m) || '(미지정)';
        if (!g[k]) g[k] = { key: k, total: 0, done: 0, sample: m };
        g[k].total++;
        if (doneMap[m.id]) g[k].done++;
      });
      return Object.keys(g).map(function (k) {
        var o = g[k]; o.rate = pct(o.done, o.total); return o;
      });
    }
  };

  /* ---------------- 막대 차트 ---------------- */
  /** rows: [{key,total,done,rate}] */
  function barChart(rows, opt) {
    opt = opt || {};
    if (!rows.length) return '<div class="empty">표시할 자료가 없습니다.</div>';
    var color = opt.color || 'var(--series-1)';
    var lw = opt.labelWidth ? ' style="grid-template-columns:' + opt.labelWidth + ' 1fr 96px"' : '';
    return '<div class="bars">' + rows.map(function (r) {
      return '<div class="bar-row"' + lw + ' title="' + esc(r.key) + ' · ' + r.done + '/' + r.total + '명 (' + r.rate + '%)">' +
        '<div class="bar-row__label">' + esc(r.key) + '</div>' +
        '<div class="bar-row__track"><div class="bar-row__fill" data-zero="' + (r.rate > 0 ? 0 : 1) + '" style="width:' + r.rate + '%;background:' + color + '"></div></div>' +
        '<div class="bar-row__value">' + r.rate + '%<span>' + r.done + '/' + r.total + '</span></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function miniBar(rate) {
    return '<span class="mini-track"><span class="mini-fill" style="width:' + rate + '%"></span></span>';
  }

  /* ---------------- 자료 URL → 임베드 ---------------- */
  function embedInfo(material) {
    var url = material.url || '';
    var y = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if (y) return { type: 'iframe', src: 'https://www.youtube.com/embed/' + y[1], wide: true };
    var v = url.match(/vimeo\.com\/(\d+)/);
    if (v) return { type: 'iframe', src: 'https://player.vimeo.com/video/' + v[1], wide: true };
    var nav = url.match(/tv\.naver\.com\/v\/(\d+)/);
    if (nav) return { type: 'iframe', src: 'https://tv.naver.com/embed/' + nav[1], wide: true };
    if (/\.(mp4|webm|ogg|m4v)(\?|$)/i.test(url) || (material.file && /^video\//.test(material.file.mime || ''))) {
      return { type: 'video', src: url, wide: true };
    }
    if (/\.pdf(\?|$)/i.test(url) || (material.file && /pdf/.test(material.file.mime || material.file.name || ''))) {
      return { type: 'iframe', src: url, wide: false };
    }
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) || (material.file && /^image\//.test(material.file.mime || ''))) {
      return { type: 'image', src: url };
    }
    return { type: 'link', src: url };
  }

  /* ---------------- 해시(관리자 비밀번호) ---------------- */
  function hash(text) {
    if (global.crypto && global.crypto.subtle && global.isSecureContext !== false) {
      try {
        return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
          .then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) {
              return ('0' + b.toString(16)).slice(-2);
            }).join('');
          })
          .catch(function () { return Promise.resolve(simpleHash(text)); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve(simpleHash(text));
  }
  function simpleHash(text) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'sh' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /* ---------------- 모달 ---------------- */
  function modal(html, onMount) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal">' + html + '</div>';
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      back.remove();
    }
    document.body.appendChild(back);
    if (onMount) onMount(back.querySelector('.modal'), close);
    return close;
  }

  /* ---------------- CSV 내려받기 ---------------- */
  function downloadCSV(filename, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- 로그인(교육생) 상태 ---------------- */
  var ME_KEY = 'eduhub.me';
  var Me = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null'); } catch (e) { return null; }
    },
    set: function (m) { try { localStorage.setItem(ME_KEY, JSON.stringify(m)); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(ME_KEY); } catch (e) {} }
  };

  global.UI = {
    $: $, $$: $$, esc: esc, pct: pct, fmtDate: fmtDate, fmtSize: fmtSize,
    toast: toast, renderHeader: renderHeader, barChart: barChart, miniBar: miniBar,
    Stats: Stats, rankRank: rankRank, embedInfo: embedInfo, hash: hash,
    modal: modal, downloadCSV: downloadCSV, Me: Me
  };
})(window);
