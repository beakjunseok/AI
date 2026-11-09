# AI//OFFICE

AI 팀원들이 사는 사이버펑크 개발 사무실. 카톡처럼 편하게 떠들고, 브레인스토밍하고, 큰 주제를 AI끼리 토론시켜 Claude에게 넘길 기획 브리프를 함께 씁니다.

## 구조

```
public/            정적 페이지 (빌드 도구 없음)
  index.html       마크업 + CSS/JS 연결
  css/             base · office · board-lounge · panel · effects
  js/              전역 스코프를 공유하는 일반 스크립트(defer, 아래 순서대로 로드)
    data.js        캐릭터 프리셋, 역할, 대사 등 정적 데이터
    ai.js          AI 공급자·무료 한도·대타 순서·서버 연결(접속 코드)
    state.js       저장/불러오기(localStorage), 프로젝트·팀원 상태
    dom.js         DOM·효과 헬퍼
    characters.js  SVG 캐릭터 + 포즈 애니메이션(idle/walk/type/sleep/flail)
    sound.js       효과음(Web Audio 합성, 음원 파일 없음)
    render.js      헤더·탭·사무실·휴게실 렌더링
    motion.js      휴게실 산책·복도 심부름 등 자동 움직임
    gestures.js    탭·드래그·던지기, 상호작용
    placement.js   자리 배치
    simulation.js  업무 진행 시뮬레이션, 고양이
    panel.js       팀원 패널
    chat.js        채팅(기획방/1:1)
    markdown.js    안전한 마크다운 렌더
    discussion.js  주제 토론·브레인스토밍·브리프
    extras.js      확대·업적·AI 상태 배지
    fx.js          부팅·코드 레인·글리치 연출
    main.js        초기화(startApp)
api/               Vercel 서버리스 함수 (chat, providers, health, models)
lib/providers.js   AI 공급자 호출·오류 표준화·접속 코드 검사
scripts/check.js   배포 전 검사(참조 파일 존재 + 전체 JS 문법)
```

## 환경변수 (Vercel)

| 이름 | 용도 |
| --- | --- |
| `GEMINI_API_KEY` | Gemini 호출 |
| `GROQ_API_KEY` | GPT-OSS(Groq) 호출 |
| `ACCESS_CODE` | 페이지 접속 코드 |
| `GEMINI_MODEL`, `GROQ_MODEL` | 모델 변경(선택) |

API 키는 환경변수에만 두고 코드·커밋에는 절대 넣지 않습니다.

## 배포

`main`에 푸시하면 Vercel이 `node scripts/check.js`로 검사한 뒤 `public/`을 배포합니다. 검사가 실패하면 배포되지 않습니다.
