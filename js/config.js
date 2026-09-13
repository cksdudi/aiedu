/* ============================================================
   설정 파일  —  이 파일만 수정하면 됩니다.
   ============================================================ */

window.APP_CONFIG = {

  /* 사이트 제목 (헤더에 표시) */
  orgName: "○○시청",
  siteName: "교육 수료관리 시스템",

  /* ------------------------------------------------------------------
     Firebase 설정
     ------------------------------------------------------------------
     Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 에서 복사한 값을 붙여넣으세요.
     (자세한 절차는 README.md 참고)

     ※ 아래 apiKey 를 비워두면 "로컬 저장 모드"로 동작합니다.
        - 서버 없이 바로 열어볼 수 있지만, 수료 기록이 그 브라우저에만 남습니다.
        - 실제 운영 시에는 반드시 Firebase 값을 채워 넣으세요.
  ------------------------------------------------------------------ */
  firebase: {
    apiKey:            "AIzaSyDzvaO7g4MehR7BLzr0VFTUE493dt8qAcY",
    authDomain:        "ddang-8edd6.firebaseapp.com",
    databaseURL:       "https://ddang-8edd6-default-rtdb.firebaseio.com",
    projectId:         "ddang-8edd6",
    storageBucket:     "ddang-8edd6.firebasestorage.app",
    messagingSenderId: "544438592414",
    appId:             "1:544438592414:web:460eeed3e4fc83a603ac8f",
    measurementId:     "G-EKXMWQNKVK"
  },

  /* 관리자 초기 비밀번호 (최초 1회 사용 · 관리자 화면에서 변경 가능) */
  defaultAdminPassword: "admin1234",

  /* 퀴즈 문항 수 / 합격 기준 */
  quizCount: 3,          // 자료당 퀴즈 문항 수
  quizPassAll: true,     // true = 전 문항 정답이어야 수료

  /* 파일 업로드 최대 용량(MB). Firebase Storage 미사용 시 1MB 이하 권장 */
  maxUploadMB: 20
};
