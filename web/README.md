# Legend Baseball 시뮬레이터 (Web UI)

React + Vite 프론트엔드. 시뮬레이션 엔진(`../src`)을 브라우저에서 직접 실행하므로 별도의 백엔드 서버가 필요 없습니다.

## 실행 방법

```sh
npm install
npm run dev
```

브라우저에서 `http://localhost:5173/Legend-baseball/` 접속.

## 배포 (GitHub Pages)

기본 브랜치(`claude/pitcher-batter-matchup-algo-rbkmhm`)에 푸시되면 `.github/workflows/deploy-pages.yml` 워크플로가 이 디렉터리를 빌드해 GitHub Pages에 배포합니다.

처음 한 번은 저장소 Settings → Pages → Build and deployment → Source를 "GitHub Actions"로 설정해야 합니다.
