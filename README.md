# ST Reorder Management

ST (Sergio Tacchini) 리오더 관리 시스템

## 셋업

### 1. Supabase
- 프로젝트 생성 후 `supabase/schema.sql` 실행
- `SUPABASE_URL`과 `SUPABASE_SERVICE_KEY` 확보

### 2. 로컬 개발
```bash
cp .env.example .env
# .env에 Supabase 키 입력
npm install
npm run dev
```

### 3. Render 배포
- GitHub 연결 후 자동 배포
- Environment Variables에 SUPABASE_URL, SUPABASE_SERVICE_KEY 설정

### 4. 데이터 갱신 (매주)
```bash
# DCS AI에서 데이터 조회 후 JSON 생성
# → Supabase에 업로드
node server/refresh.js style_data.json color_data.json
```

## 구조
```
st-reorder/
├── public/           # 프론트엔드
│   ├── index.html
│   └── app.js
├── server/           # Express API
│   ├── index.js
│   └── refresh.js    # 데이터 갱신 스크립트
├── supabase/
│   └── schema.sql    # DB 스키마
├── render.yaml       # Render 배포 설정
└── package.json
```
