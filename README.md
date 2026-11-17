# 서울 드론 파일럿

서울 도심을 본뜬 가벼운 3D 구역에서 드론을 조종해 레이스, 미션, 전투, 탐색 비행을 즐기는 웹 시뮬레이터입니다.

- 플레이: https://seoul-drone-pilot.vercel.app
- 조작: 키보드(방향키 이동, W/S 상승·하강, A/D 회전) 또는 게임패드

## 로컬 실행

빌드 없이 정적 파일만으로 동작합니다.

```bash
python -m http.server 5173 --directory app/public
```

## 배포

`main` 브랜치에 푸시하면 Vercel이 `app/public`을 자동으로 배포합니다 (`vercel.json` 참고).
