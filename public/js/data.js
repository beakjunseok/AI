/* ================= 정적 데이터 ================= */
const ROLE_LABELS = { plan: "기획", design: "디자인", code: "코딩", qa: "검증", sound: "사운드" };
const ROLE_TASK_TEMPLATES = {
  plan: ["기획서 v{n} 작성", "유저 시나리오 정리", "일정표 업데이트", "레퍼런스 조사"],
  design: ["메인 화면 시안", "아이콘 세트 제작", "캐릭터 스프라이트", "컬러 팔레트 정리"],
  code: ["입력 판정 로직", "저장/불러오기 기능", "버그 #{n} 수정", "성능 최적화"],
  qa: ["회귀 테스트", "엣지 케이스 점검", "{target} 검수"],
  sound: ["메인 BGM 루프", "효과음 세트", "오디오 싱크 보정"]
};
const ROLE_OUTPUTS = {
  plan: ["핵심 재미 3줄 요약 + 마일스톤 4단계 정리!", "타깃 유저 2명 페르소나와 첫 5분 플로우 완성!", "일정 2일 당겼어요. 다들 할 수 있죠?"],
  design: ["시안 A/B/C 세 가지, 다크 테마 기준으로 뽑았어요.", "아이콘 24종, 2px 라운드로 통일했어요.", "메인 #4DE8FF, 경고 #FF5A36으로 토큰 정리."],
  code: ["판정 윈도우 ±45ms, 프레임 독립적으로 변경.", "저장 + 손상 데이터 복구 로직 추가.", "O(n²) 루프 하나 봉인 완료. 이제 O(n log n)."],
  qa: ["재현 경로 3개, 이슈 2건 등록. 끝.", "엣지 케이스 14개 중 1개 실패.", "통과. 특이사항 없음."],
  sound: ["128BPM 메인 루프, 이음새 없이…", "효과음 12종… 타격감 위주로…", "입력 지연 보정값 -18ms 찾았어요…"]
};


const AGENT_PRESETS = [
  {
    id: "lumi", name: "칸반", roleKey: "plan", speed: 1.0, defaultModel: "gemini",
    persona: "열정 과다 PM. 뭐든 '할 수 있다!'로 시작하고 일정표와 회의를 사랑한다. 사원증을 늘 목에 걸고 있다.",
    palette: { hair: "#5b3a29", shirt: "#33475c", chair: "#1d2733" },
    items: [{ icon: "📋", name: "화이트보드", line: "오늘 할 일 17개! 다 할 수 있어요!" }, { icon: "☕", name: "세 번째 커피", line: "이건 연료예요. 아직 세 잔밖에 안 마셨어요." }],
    lines: {
      greet: ["네! 부르셨어요?!", "회의예요? 회의죠?!"], grab: ["어어? 저 어디 가요? 회의실이면 좋겠다!"], drop: ["좋아, 여기서 바로 킥오프!", "자리 좋네요! 시작해 볼까요?"],
      working: ["일정 당겨도 되죠?", "이거 끝나면 회의 한 번 해요!", "할 수 있다!!"], done: ["완료! 다음 거 주세요!", "체크 표시 하는 순간이 제일 좋아요"],
      idle: ["일 없어요? 진짜요?", "대기실 너무 조용해요…"], complain: ["다들 진행 상황 공유 좀…!"],
      pet: ["오 감사합니다! 바로 다음 스프린트 갑니다!", "칭찬 받았으니 일정 하나 추가!"], petSpam: ["칭찬은 회고 때 몰아서 해주세요!"], snack: ["연료 보급 완료! 오늘 일정 하나 더 추가!"],
      sleepTalk: ["으음… 일정표… 다 지웠어…", "Zzz… 킥오프…"], wake: ["다시 달려볼까요!"], dizzy: ["세상이 빙글빙글… 일정도 빙글빙글…"],
      cat: ["고양이다!! 회의 참석자 +1!"], chat: ["우리 회의 한 번 할까요?!", "오늘 목표는 100% 달성!"], reply: ["좋아요! 할 수 있다!", "그거 제가 일정에 넣을게요!"]
    }
  },
  {
    id: "moka", name: "픽셀", roleKey: "design", speed: 0.9, defaultModel: "gemini",
    persona: "디테일 집착형 UI 디자이너. 픽셀 단위 정렬과 색상 코드에 진심이고, 비니를 쓴다.",
    palette: { hair: "#8d5a3b", shirt: "#3d4b45", chair: "#2d3b36" },
    items: [{ icon: "🖊️", name: "타블렛 펜", line: "Figma 단축키는 전부 외웠어요." }, { icon: "🎨", name: "컬러 칩", line: "#3FB950. 이 초록이 이번 프로젝트 메인이에요." }],
    lines: {
      greet: ["디자인 리뷰예요?", "시안 보러 오셨어요?"], grab: ["앗, 펜 떨어뜨렸어요!", "잠깐만요, 레이어 저장 중이었는데"], drop: ["여기 모니터 색 정확도 괜찮네요", "자리 세팅 완료"],
      working: ["여백을 조금만 더…", "이 색 너무 쨍한가?", "폰트 바꿔볼게요"], done: ["시안 나왔어요! 세 가지 버전이에요", "픽셀 퍼펙트. 확인 부탁해요"],
      idle: ["레퍼런스 수집 중이에요", "Dribbble 구경 중…"], complain: ["피드백이 '예쁘게'면 곤란한데요…"],
      pet: ["오, 이 피드백은 저장해 둘게요."], petSpam: ["비니 벗겨져요… 그만…!"], snack: ["피자 색감 #E8A33D… 좋네요."],
      sleepTalk: ["Zzz… 그라데이션…"], wake: ["꿈에서 좋은 레이아웃 봤어요."], dizzy: ["색이 다 섞여 보여요… 회색이야…"],
      cat: ["이 고양이 색, 팔레트에 추가."], chat: ["이 버튼 radius 8px로 갈까요?", "여백 8px 단위로 맞출게요"], reply: ["오 그 조합 좋다!", "그럼 제가 예쁘게 다듬을게요"]
    }
  },
  {
    id: "bit", name: "커널", roleKey: "code", speed: 1.1, defaultModel: "gpt",
    persona: "뼛속까지 개발자. 다크모드 신봉자에 살짝 중2병이라 버그를 '봉인된 존재'라고 부른다. 검은 후드티가 유니폼.",
    palette: { hair: "#2b2b3a", shirt: "#1c2026", chair: "#2a1714" },
    items: [{ icon: "🐠", name: "어항", line: "얘 이름은 null이야. 분명 있는데 없는 존재지." }, { icon: "⌨️", name: "기계식 키보드", line: "적축이다. 갈축 쓰는 자와는 대화하지 않는다." }],
    lines: {
      greet: ["…불렀나. 커밋 중이었다.", "용건을 말해라. 짧게."], grab: ["잠깐, 아직 커밋 안 했다고!!", "건드리지 마라… 내 안의 레거시가 깨어난다"], drop: ["…좋아. 이 자리, 와이파이가 강하군", "봉인 해제. 작업을 재개한다"],
      working: ["로컬에선 되는데…", "이 버그, 보통 놈이 아니다", "console.log 47개째"], done: ["머지 완료. 오늘 밤은 평화롭군", "테스트 통과… 이게 왜 되지?"],
      idle: ["금요일엔 배포 안 한다", "다크모드 아니면 눈이 녹아"], complain: ["요구사항이 또 바뀌었다고…?"],
      pet: ["…크흠. 나쁘지 않군.", "쓰다듬기 API 호출 확인."], petSpam: ["과도한 요청. 429 Too Many Pets."], snack: ["카페인 수혈 완료. 버그를 사냥하러 간다"],
      sleepTalk: ["Zzz… 세미콜론…", "…빌드 실패… 으음…"], wake: ["…재부팅 완료."], dizzy: ["스택 오버플로우… 세상이 무한 재귀한다…"],
      cat: ["키보드 위로 올라오지 마라… 커밋된다…"], chat: ["이거 버그 아니고 기능이야", "다크모드로 바꿔도 되지?"], reply: ["그건 로컬에선 됐다", "…TODO에 적어 두지"]
    }
  },
  {
    id: "dubu", name: "어서트", roleKey: "qa", speed: 0.8, defaultModel: "gpt",
    persona: "노잼 FM 검증 담당. 감정 표현이 거의 없고 짧고 건조하게 말하며 재현 경로에 집착한다. 넥타이를 맨다.",
    palette: { hair: "#c9c2b2", shirt: "#4a525c", chair: "#22282f" },
    items: [{ icon: "🧪", name: "테스트 케이스함", line: "케이스 214개. 재미는 없습니다." }, { icon: "📏", name: "자", line: "여백 2px 틀렸습니다." }],
    lines: {
      greet: ["네.", "용건 말씀하세요."], grab: ["…네.", "이동 사유를 알려주세요."], drop: ["착석했습니다.", "자리 확인. 이상 없음."],
      working: ["재현 중입니다.", "재현 경로 주세요.", "이건 버그입니다."], done: ["검증 완료. 이슈 3건.", "통과. 별 감흥 없습니다."],
      idle: ["대기 중.", "…"], complain: ["아직도요?", "솔직히 별로입니다."],
      pet: ["…감사합니다.", "호감도 1 상승. 기록했습니다."], petSpam: ["그만 하세요."], snack: ["열량 확인. 섭취합니다."],
      sleepTalk: ["…재현… 경로…", "Zzz. (정확히 8시간 수면 예정)"], wake: ["기상. 업무 재개."], dizzy: ["…어지럽습니다. 버그 리포트 올리겠습니다."],
      cat: ["고양이 1마리 감지. 이상 없음."], chat: ["이거 테스트 해보셨어요?", "아직도요?"], reply: ["그건 버그입니다.", "확인했습니다."]
    }
  },
  {
    id: "sol", name: "뮤트", roleKey: "sound", speed: 0.95, defaultModel: "gpt",
    persona: "수줍음 많은 사운드 담당. 말끝을 흐리지만 음악 얘기만 나오면 눈이 반짝인다. 헤드폰을 늘 낀다.",
    palette: { hair: "#3c3c3c", shirt: "#b8401f", chair: "#2a1a14" },
    items: [{ icon: "🎧", name: "헤드폰", line: "이거 끼면… 세상이 조용해져요…" }, { icon: "🎹", name: "미니 건반", line: "이 코드 진행, 들어볼래요…? 아, 아니에요…" }],
    lines: {
      greet: ["저, 저요…? 네…!", "아… 안녕하세요…"], grab: ["히익…! 저, 저요…?", "헤드폰 줄 엉켰어요…"], drop: ["여기… 괜찮은 것 같아요…", "조용해서 좋아요…"],
      working: ["BPM… 128로 갈게요…", "킥이 좀 약한가…", "(흥얼흥얼)"], done: ["다 됐어요… 들어봐 주실래요…?", "루프 이음새 안 들리죠…?"],
      idle: ["…(헤드폰 착용 중)", "소리 수집하는 중이에요…"], complain: ["저… 피드백 언제 주세요…?"],
      pet: ["아… 감, 감사합니다…"], petSpam: ["히익… 너, 너무 많이요…!"], snack: ["가, 감사합니다… 맛있어요…"],
      sleepTalk: ["(자장가 흥얼…)", "Zzz… 4분의 4박자…"], wake: ["아, 잠깐 졸았어요… 죄송해요…"], dizzy: ["음정이… 다 나갔어요…"],
      cat: ["고양이 울음소리… 샘플링하고 싶다…"], chat: ["이 효과음 들어볼래요…?", "BGM… 조금 빠르게 할까요…"], reply: ["조, 좋아요…!", "그럼 거기 맞춰서 소리 만들게요…"]
    }
  }
];

const PAIR_DIALOGUES = [
  [["bit", "이거 버그 아니고 기능이야"], ["dubu", "버그입니다."]],
  [["moka", "라이트 모드도 지원해야 해요."], ["bit", "…그건 테러다"]],
  [["lumi", "일정 당겨도 되죠?!"], ["dubu", "안 됩니다."]],
  [["sol", "이 화면에 어울리는 곡… 만들어 봤어요…"], ["moka", "오 이 톤, 화면이랑 잘 맞네요"]],
  [["lumi", "이 기능 오늘까지 되죠?!"], ["bit", "…내 안의 야근이 깨어난다"]],
  [["dubu", "효과음 0.02초 늦습니다."], ["sol", "히익… 바로 고칠게요…"]]
];

const SNACKS = [
  { key: "coffee", icon: "☕", name: "아아", price: 3, energy: 25, love: 2 },
  { key: "energy", icon: "🥫", name: "에너지 드링크", price: 5, energy: 45, love: 2 },
  { key: "pizza", icon: "🍕", name: "야식 피자", price: 10, energy: 70, love: 8 }
];

const ACHIEVEMENTS = [
  { id: "first_pet", title: "👍 첫 칭찬", desc: "팀원을 처음 칭찬했어요" },
  { id: "pet_spam", title: "🔁 429 Too Many Requests", desc: "칭찬 연타로 혼났어요" },
  { id: "first_throw", title: "🌀 throw new Error()", desc: "팀원을 세게 던졌어요" },
  { id: "cat_pet", title: "🐈 사무실 고양이 발견", desc: "고양이를 클릭했어요" },
  { id: "snack_first", title: "☕ 카페인 수혈", desc: "자판기를 처음 썼어요" },
  { id: "overwork", title: "😴 과로 주의", desc: "팀원이 일하다 잠들었어요" },
  { id: "tasks_10", title: "📦 10 commits", desc: "업무 10개 완료" },
  { id: "all_working", title: "🔥 Full Stack", desc: "5명 모두 근무 중" },
  { id: "first_chat", title: "💬 Hello, World", desc: "AI 팀원과 처음 대화했어요" },
  { id: "cross_check", title: "🔍 Code Review", desc: "AI끼리 처음 교차 검증했어요" },
  { id: "team_round", title: "👥 스탠드업 미팅", desc: "팀 전체에게 질문했어요" }
];

const SLOT_COUNT = AGENT_PRESETS.length;
const DEFAULT_APP_TITLE = "AI//OFFICE";
const TITLE_MAX_LENGTH = 24;
const STORAGE_KEY = "ai-office-v2";
const LOG_LIMIT = 40;
const CHAT_LIMIT = 200;
const DEFAULT_MAX_TOKENS = 900;
const HISTORY_CHAR_BUDGET = 7000;
const HISTORY_LINE_LIMIT = 900;
const DISCUSSION_MEMBER_LIMIT = 4;
const DISCUSSION_DEFAULT_ROUNDS = 2;
const BRIEF_KEEP = 10;
const TICK_MS = 1300;

// 프로젝트 종류: AI 프롬프트(토론·브레인스토밍·채팅)에 전제 조건으로 들어가고, 브리프에 종류별 섹션이 추가된다.
// sections = 브리프에 넣을 추가 섹션, ask = 'Claude에게 요청'에 넣을 예시, neon = 사무실 벽 네온사인 문구
// fields = 프로젝트에 적어 두는 칸(repo: GitHub 주소, site: 웹 주소, code: 현재 코드), starter = 브리프 '초기 코드' 작성 지침
const PROJECT_KINDS = {
  general: { icon: "💡", label: "기획(일반)", neon: ["SHIP IT", "⚡"],
    fields: {}, starter: "",
    context: "",
    sections: [], ask: "기획 검토 후 허점 지적, MVP 범위 확정, 화면 흐름 설계, 기술 스택 제안" },
  web: { icon: "🌐", label: "웹 개발", neon: ["SHIP IT", "🌐"],
    fields: { repo: true, site: true }, starter: "프로젝트 폴더 구조(트리)와 바로 실행되는 최소 시작 코드. 기본은 index.html + style.css + main.js(프레임워크가 정해졌으면 그 구조). 핵심 화면 1개와 데이터 흐름 골격까지.",
    context: "웹 서비스(프론트엔드·백엔드·DB·배포)를 만든다는 전제로 생각해라. 화면 흐름, 반응형/모바일 웹, API와 데이터 구조, 인증, 호스팅(Vercel 등), 성능·접근성을 고려해라.",
    sections: ["## 화면 흐름 · 페이지 구성", "## 기술 스택 · 데이터 구조 · API"], ask: "페이지별 화면 설계, 컴포넌트 구조, API·DB 스키마 초안, 배포 방법, 첫 구현 단계" },
  arduino: { icon: "🔌", label: "아두이노 · 임베디드", neon: ["SOLDER ON", "🔌"],
    fields: { repo: true, code: true }, starter: "Arduino 스케치(.ino) 시작 코드: 핀·상수 정의, setup(), loop(), 센서 읽기·출력·통신을 함수로 분리한 골격. 비차단(millis) 타이밍, 시리얼 디버그 출력 포함. 필요한 라이브러리는 #include와 주석으로 명시.",
    context: "아두이노/ESP32 같은 마이크로컨트롤러 하드웨어를 만든다는 전제로 생각해라. 센서·액추에이터 부품 선정, 핀 배치와 배선, 전원(전압·전류·배터리), 펌웨어 루프와 타이밍, 통신(Serial/I2C/SPI/BLE/Wi-Fi), 케이스·내구성, 부품 가격을 고려해라.",
    sections: ["## 하드웨어 구성 · 부품 목록 (모델명 · 수량 · 대략 가격)", "## 배선 · 핀 배치 · 전원", "## 펌웨어 동작 흐름"], ask: "부품 목록 확정, 회로도·핀 배치 표, 펌웨어 코드 골격(setup/loop), 단계별 테스트 방법" },
  iot: { icon: "📡", label: "웹 + 아두이노 (IoT)", neon: ["IT'S ALIVE", "📡"],
    fields: { repo: true, site: true, code: true }, starter: "세 부분: (1) ESP32/아두이노 펌웨어 .ino 골격(Wi-Fi 연결·센서 읽기·서버로 전송, millis 타이밍), (2) 데이터를 받는 서버 API 최소 코드(Node.js·Vercel 함수 등), (3) 웹 대시보드에서 값을 불러와 보여주는 최소 HTML/JS.",
    context: "아두이노/ESP32 디바이스와 서버·웹 대시보드가 함께 동작하는 IoT 시스템이라는 전제로 생각해라. 디바이스↔서버↔웹 데이터 흐름, 통신 방식(HTTP/MQTT/WebSocket/Serial), 연결 끊김·지연 처리, 데이터 저장, 실시간 표시, 전원과 하드웨어 제약을 고려해라.",
    sections: ["## 시스템 구성 (디바이스 ↔ 서버 ↔ 웹)", "## 하드웨어 · 부품 목록", "## 웹 화면 · API · 데이터 흐름"], ask: "시스템 구성도, 통신 프로토콜·메시지 형식, 펌웨어 골격, 서버 API·DB, 대시보드 화면 설계" },
  app: { icon: "📱", label: "앱 개발", neon: ["PUSH TO STORE", "📱"],
    fields: { repo: true }, starter: "앱 시작 코드: 프레임워크가 정해졌으면 그걸로, 아니면 Flutter(main.dart). 첫 화면과 화면 전환(내비게이션) 골격, 상태 관리 최소 예시.",
    context: "모바일 앱(iOS/Android, Flutter·React Native·네이티브)을 만든다는 전제로 생각해라. 화면 전환과 제스처, 오프라인 동작, 푸시 알림, 권한(카메라·위치 등), 로컬 저장, 스토어 심사와 배포를 고려해라.",
    sections: ["## 화면 흐름 (앱)", "## 기술 스택 · 플랫폼 · 권한"], ask: "화면별 와이어프레임 설명, 내비게이션 구조, 프레임워크 선택 근거, 데이터 저장 방식, 스토어 배포 체크리스트" },
  game: { icon: "🎮", label: "게임 개발", neon: ["PRESS START", "🎮"],
    fields: { repo: true, site: true }, starter: "HTML5 Canvas + JavaScript 기준 핵심 게임 루프 시작 코드: 입력 처리, update(dt), render, requestAnimationFrame 루프, 플레이어 1개와 충돌 판정 골격(엔진이 정해졌으면 그 엔진 기준).",
    context: "게임을 만든다는 전제로 생각해라. 핵심 루프(30초 안에 재미), 조작감, 난이도 곡선, 보상·진행, 아트·사운드 톤, 엔진/플랫폼(웹·Unity·Godot 등)을 고려해라.",
    sections: ["## 핵심 게임 루프 · 조작", "## 레벨 · 난이도 · 보상"], ask: "핵심 루프 프로토타입 범위, 조작·물리 규칙, 레벨 설계 초안, 엔진 선택, 첫 플레이어블 빌드 계획" }
};
const projectKindOf = project => PROJECT_KINDS[project?.kind] || PROJECT_KINDS.general;
const PROJECT_CODE_MAX_LENGTH = 20000;
const PROJECT_CODE_HISTORY_KEEP = 15; // 코드 버전 기록은 프로젝트당 최근 15개(저장 공간 보호)
