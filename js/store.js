/* ============================================================
   store.js — 데이터 저장 계층
   Firebase(Firestore) 설정이 있으면 실시간 공유 모드,
   없으면 브라우저 localStorage 모드로 자동 전환됩니다.

   컬렉션: members(명단) / materials(교육자료) / completions(수료기록) / settings(설정)
   ============================================================ */
(function (global) {
  'use strict';

  var CFG  = global.APP_CONFIG || {};
  var NAMES = ['members', 'materials', 'completions', 'settings'];
  var LS_KEY = 'eduhub.v1';

  var mode = 'local';
  var db = null, storage = null;
  var cache = { members: [], materials: [], completions: [], settings: [] };
  var listeners = { members: [], materials: [], completions: [], settings: [] };
  var readyResolve, readyPromise = new Promise(function (r) { readyResolve = r; });

  /* ---------------- 유틸 ---------------- */
  function uid() {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function emit(name) {
    listeners[name].forEach(function (cb) {
      try { cb(cache[name].slice()); } catch (e) { console.error(e); }
    });
  }
  function emitAll() { NAMES.forEach(emit); }

  /* ---------------- 로컬 저장 ---------------- */
  function lsRead() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function lsWrite() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); }
    catch (e) {
      console.error(e);
      alert('브라우저 저장 공간이 부족합니다. 업로드한 파일 용량을 줄이거나 Firebase 설정을 사용하세요.');
      throw e;
    }
  }

  /* ---------------- 초기화 ---------------- */
  function hasFirebaseConfig() {
    var f = CFG.firebase || {};
    return !!(f.apiKey && f.projectId);
  }

  function initLocal() {
    mode = 'local';
    var saved = lsRead();
    if (saved) NAMES.forEach(function (n) { cache[n] = Array.isArray(saved[n]) ? saved[n] : []; });
    global.addEventListener('storage', function (e) {
      if (e.key !== LS_KEY) return;
      var d = lsRead(); if (!d) return;
      NAMES.forEach(function (n) { cache[n] = Array.isArray(d[n]) ? d[n] : []; });
      emitAll();
    });
    readyResolve(mode);
    setTimeout(emitAll, 0);
  }

  function initFirebase() {
    mode = 'firebase';
    firebase.initializeApp(CFG.firebase);
    db = firebase.firestore();
    try { if (firebase.storage && CFG.firebase.storageBucket) storage = firebase.storage(); }
    catch (e) { storage = null; }

    var pending = NAMES.length;
    NAMES.forEach(function (name) {
      db.collection(name).onSnapshot(function (snap) {
        var arr = [];
        snap.forEach(function (doc) {
          var o = doc.data() || {}; o.id = doc.id; arr.push(o);
        });
        cache[name] = arr;
        emit(name);
        if (pending > 0) { pending--; if (pending === 0) readyResolve(mode); }
      }, function (err) {
        console.error('[' + name + '] 읽기 실패:', err);
        if (pending > 0) { pending--; if (pending === 0) readyResolve(mode); }
        Store.onError && Store.onError(err);
      });
    });
  }

  /* ---------------- 공개 API ---------------- */
  var Store = {
    get mode() { return mode; },
    ready: function () { return readyPromise; },

    /** 컬렉션 구독. 즉시 1회 호출되고, 변경 시마다 호출됨. 해제 함수 반환 */
    subscribe: function (name, cb) {
      listeners[name].push(cb);
      setTimeout(function () { cb(cache[name].slice()); }, 0);
      return function () {
        var i = listeners[name].indexOf(cb);
        if (i >= 0) listeners[name].splice(i, 1);
      };
    },

    /** 현재 값(동기) */
    all: function (name) { return cache[name].slice(); },

    /** 저장(upsert). obj.id 없으면 새로 만듦. 저장된 id 반환 */
    put: function (name, obj) {
      var id = obj.id || uid();
      var data = JSON.parse(JSON.stringify(obj));
      delete data.id;
      if (mode === 'firebase') {
        return db.collection(name).doc(id).set(data, { merge: false }).then(function () { return id; });
      }
      var arr = cache[name], found = false;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = Object.assign({ id: id }, data); found = true; break; }
      if (!found) arr.push(Object.assign({ id: id }, data));
      lsWrite(); emit(name);
      return Promise.resolve(id);
    },

    /** 여러 건 한 번에 저장(엑셀 업로드용) */
    putMany: function (name, list) {
      var items = list.map(function (o) {
        var c = JSON.parse(JSON.stringify(o));
        c.id = c.id || uid();
        return c;
      });
      if (mode === 'firebase') {
        var chunks = [], size = 400;
        for (var i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
        return chunks.reduce(function (p, chunk) {
          return p.then(function () {
            var batch = db.batch();
            chunk.forEach(function (o) {
              var id = o.id, d = Object.assign({}, o); delete d.id;
              batch.set(db.collection(name).doc(id), d);
            });
            return batch.commit();
          });
        }, Promise.resolve()).then(function () { return items.length; });
      }
      items.forEach(function (o) {
        var arr = cache[name], found = false;
        for (var i = 0; i < arr.length; i++) if (arr[i].id === o.id) { arr[i] = o; found = true; break; }
        if (!found) arr.push(o);
      });
      lsWrite(); emit(name);
      return Promise.resolve(items.length);
    },

    /** 삭제 */
    remove: function (name, id) {
      if (mode === 'firebase') return db.collection(name).doc(id).delete();
      cache[name] = cache[name].filter(function (o) { return o.id !== id; });
      lsWrite(); emit(name);
      return Promise.resolve();
    },

    /** 여러 건 삭제 */
    removeMany: function (name, ids) {
      if (mode === 'firebase') {
        var chunks = [], size = 400;
        for (var i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
        return chunks.reduce(function (p, chunk) {
          return p.then(function () {
            var batch = db.batch();
            chunk.forEach(function (id) { batch.delete(db.collection(name).doc(id)); });
            return batch.commit();
          });
        }, Promise.resolve());
      }
      var set = {}; ids.forEach(function (i) { set[i] = 1; });
      cache[name] = cache[name].filter(function (o) { return !set[o.id]; });
      lsWrite(); emit(name);
      return Promise.resolve();
    },

    /** 컬렉션 전체 비우기 */
    clear: function (name) {
      return Store.removeMany(name, cache[name].map(function (o) { return o.id; }));
    },

    /** 설정값(단일 문서 'app') */
    settings: function () {
      var s = cache.settings.filter(function (o) { return o.id === 'app'; })[0];
      return s || { id: 'app' };
    },
    saveSettings: function (patch) {
      var cur = Store.settings();
      return Store.put('settings', Object.assign({}, cur, patch, { id: 'app' }));
    },

    /**
     * 파일 업로드.
     * Firebase Storage 사용 가능하면 Storage 에, 아니면 data URL 로 문서에 직접 저장.
     * 반환: {url, kind:'storage'|'inline', name, size, path?}
     */
    uploadFile: function (file, onProgress) {
      var maxMB = CFG.maxUploadMB || 20;
      if (file.size > maxMB * 1024 * 1024) {
        return Promise.reject(new Error('파일이 너무 큽니다. ' + maxMB + 'MB 이하만 업로드할 수 있습니다.'));
      }
      var inlineLimit = 700 * 1024;

      function inline() {
        if (file.size > inlineLimit) {
          return Promise.reject(new Error(
            '이 환경에서는 700KB 이하 파일만 직접 저장할 수 있습니다.\n' +
            '용량이 큰 영상·PDF는 유튜브/부서 서버에 올린 뒤 "링크" 로 등록해 주세요.\n' +
            '(Firebase Storage 를 사용하도록 설정하면 큰 파일도 업로드할 수 있습니다.)'));
        }
        return new Promise(function (res, rej) {
          var fr = new FileReader();
          fr.onload = function () {
            res({ url: fr.result, kind: 'inline', name: file.name, size: file.size });
          };
          fr.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
          fr.readAsDataURL(file);
        });
      }

      if (mode !== 'firebase' || !storage) return inline();

      var path = 'materials/' + Date.now() + '_' + file.name.replace(/[^\w.\-가-힣]/g, '_');
      var ref = storage.ref().child(path);
      return new Promise(function (res, rej) {
        var task = ref.put(file);
        task.on('state_changed',
          function (s) { if (onProgress) onProgress(Math.round(s.bytesTransferred / s.totalBytes * 100)); },
          function (err) { console.warn('Storage 업로드 실패 → 직접 저장으로 전환', err); inline().then(res, rej); },
          function () {
            ref.getDownloadURL().then(function (url) {
              res({ url: url, kind: 'storage', name: file.name, size: file.size, path: path });
            }, rej);
          });
      });
    },

    deleteUploadedFile: function (fileInfo) {
      if (!fileInfo || fileInfo.kind !== 'storage' || !storage || !fileInfo.path) return Promise.resolve();
      return storage.ref().child(fileInfo.path).delete().catch(function () {});
    },

    uid: uid,
    onError: null
  };

  /* ---------------- 부팅 ---------------- */
  Store.boot = function () {
    if (hasFirebaseConfig() && global.firebase && global.firebase.initializeApp) {
      try { initFirebase(); }
      catch (e) { console.error('Firebase 초기화 실패 → 로컬 모드', e); initLocal(); }
    } else {
      if (hasFirebaseConfig()) console.warn('Firebase SDK 로드 실패 → 로컬 모드로 동작합니다.');
      initLocal();
    }
  };

  global.Store = Store;
})(window);
