# IT MAP

개인 IT 학습 지도. 정적 페이지(`index.html`) 하나와 AI 요청을 중계하는 Vercel 함수(`api/ai.js`)로 이루어져 있습니다.

## 배포 (Vercel, 무료)

1. **Gemini API 키 만들기**: https://aistudio.google.com/apikey 에서 Google 계정으로 로그인 → "Create API key" → 키 복사
2. **GitHub에 올리기**: GitHub에서 새 저장소(예: `itmap`) 생성 → "uploading an existing file" → 이 폴더의 파일을 폴더 구조 그대로(`api` 폴더 포함) 끌어다 놓고 Commit
3. **Vercel에 연결**: https://vercel.com 에 GitHub로 가입 → "Add New… → Project" → `itmap` 저장소 Import
4. **환경 변수 입력** (Import 화면의 Environment Variables, 또는 배포 후 Settings → Environment Variables)
   - `GEMINI_API_KEY` = 1단계에서 복사한 키 (필수)
   - `SITE_PASSWORD` = 원하는 비밀번호 (권장 — 다른 사람이 내 키로 AI를 쓰지 못하게 막음)
   - `GEMINI_MODEL` = 비워두면 `gemini-flash-latest`
5. **Deploy** → `https://itmap-xxxx.vercel.app` 주소가 생깁니다.

환경 변수를 나중에 바꿨다면 Deployments → 최신 배포 → Redeploy 해야 반영됩니다.

## 확인
- `https://내주소/api/ai` 를 열면 `{"ok":true,"hasKey":true,...}` 가 보여야 합니다.

## 저장
- 공부 기록은 브라우저(localStorage)에 저장됩니다. My Knowledge 화면의 **백업 내려받기 / 불러오기**로 다른 기기에 옮길 수 있습니다.

## PC·휴대폰 동기화 (선택, 무료)
1. Vercel 프로젝트 → **Storage** 탭 → **Create Database** → **Upstash (Redis)** 선택 → **Free** 플랜으로 생성
2. 생성 화면에서 이 프로젝트(`itmap`)에 **Connect** → 환경 변수(`KV_REST_API_URL`, `KV_REST_API_TOKEN` 등)가 자동으로 추가됩니다
3. **Deployments → 최신 배포 → Redeploy**
4. 확인: `https://내주소/api/sync?check=1` → `{"storage":true}`
- 기기마다 처음 열 때 비밀번호(SITE_PASSWORD)를 한 번 물어봅니다. 그 뒤로 기록이 자동으로 올라가고 받아집니다.
- 처음 동기화할 때 각 기기에 있던 기록은 합쳐집니다.

## 다른 사람도 쓰게 하기 (각자 따로 저장)
Vercel → Environment Variables 에 `USERS` 추가 → Redeploy
- 형식: `이름:비밀번호` 를 쉼표로 구분 (예: `동생:apple123, 친구:banana456`)
- 각 사람은 로그인 화면에서 자기 이름과 비밀번호로 들어옵니다. 기록·동기화는 사람마다 완전히 따로입니다.
- 본인(소유자)은 이름 칸은 비워 두거나 아무거나, 비밀번호는 `SITE_PASSWORD`로 로그인하면 기존 기록 그대로 사용합니다.
- AI(Gemini)는 모두 같은 키를 쓰므로 무료 사용량을 함께 나눠 씁니다.
- 사람을 빼려면 `USERS`에서 지우고 Redeploy 하면 됩니다. (저장된 기록은 저장소에 남습니다)
