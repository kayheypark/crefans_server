# 브랜치 작업·통합 지침

2026-11-01 사용자 결정. 팬/스튜디오 프론트, 백엔드, 관리자 콘솔에 동일하게 적용한다.

## 기준

`prod → feat/<작업명> → dev → prod`

- 새 작업은 최신 `origin/prod`에서 분기한다. `dev`에서 분기하지 않는다.
- `dev`는 여러 작업을 합쳐 검사하는 통합 브랜치, `prod`는 검증 후 승격한 릴리스 소스다. 두 브랜치에 직접 기능 코드를 작성하지 않는다.
- 작업 브랜치를 먼저 `dev`에 병합하고 필요한 검증을 통과한 동일 이력을 `prod`에 병합한다. 작업 브랜치를 `prod`로 바로 병합하거나 강제 푸시하지 않는다.
- 기본은 PR 병합이다. 사용자가 직접 통합을 요청한 경우에는 같은 순서의 로컬 merge와 일반 push를 사용할 수 있다. 충돌은 변경 의도를 비교해 해결하고 검사한다.
- `prod`에 반영됐다고 서버가 배포된 것은 아니다. 배포는 별도 승인·배포 절차로 수행하며, 배포 커밋/이미지와 검증 증거를 기록한다.
- `dev`에 미검증 작업이 섞여 있으면 그대로 `prod`에 올리지 않는다. 포함 작업을 모두 검증하거나 승격을 보류한다.
- 기존 `main`과 작업 브랜치는 복구·기존 CI 호환을 위해 보존한다. 이번 지침으로 삭제/강제 재작성/기본 브랜치 변경을 하지 않는다.

## 새 작업

작업 전 `PROGRESS.md`, Git 상태, 다른 worktree와 원격 변경을 확인한다. 미커밋 변경은 먼저 보존하고 다른 작업 파일을 덮어쓰지 않는다.

```sh
git fetch origin --prune
git switch -c feat/<작업명> origin/prod
```

별도 체크아웃이 필요하면 `git worktree add -b feat/<작업명> <경로> origin/prod`를 사용한다. 구현·검증 후 작업 브랜치에 커밋하고 푸시한다.

## 통합과 승격

PR 또는 사용자 승인 직접 통합 시 아래 순서를 따른다. 원격 추적 브랜치가 설정된 상태와 깨끗한 작업 디렉터리가 전제다.

```sh
git switch dev
git pull --ff-only origin dev
git merge --no-ff feat/<작업명>
# 변경에 적합한 빌드·테스트·문서 검사
git push origin dev
git switch prod
git pull --ff-only origin prod
git merge --no-ff dev
git push origin prod
```

승격 후 `git merge-base --is-ancestor dev prod`와 `git diff dev prod --exit-code`로 포함 관계와 최종 소스 일치를 확인한다. 승격 완료 이력을 `dev`로 fast-forward 동기화하면 다음 작업에도 동일 기준을 유지할 수 있다. 원격 경합은 다시 fetch하고 확인하며 force push로 해결하지 않는다.

## 증거와 제외 파일

변경 범위·커밋·명령/종료 코드·검사 결과·미실행 범위를 `PROGRESS.md` 및 검증 자료에 남긴다. 비밀값, 인증 상태, 개인 QA 산출물, node_modules, 빌드 캐시는 커밋하지 않는다. 로컬 자료는 삭제하지 않고 Git 제외 경로에 보존한다. 전체 기능/운영 검증을 수행하지 않았다면 그 범위까지 통과했다고 쓰지 않는다.
