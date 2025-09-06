# AWS Cognito Lambda CustomMessage Trigger

이메일 인증 시 커스텀 링크(`https://www.crefans.com/email-verification?email=&code=`)를 포함한 이메일을 전송하는 Lambda 함수입니다.

## 🏗️ 프로젝트 구조

```
crefans_server/
├── lambda/                    # Lambda 함수들 (독립적)
│   ├── custom-message.ts      # CustomMessage 트리거 함수
│   ├── package.json           # Lambda 의존성
│   ├── tsconfig.json          # TypeScript 설정
│   ├── deploy.sh              # 빌드 & 패키징 스크립트
│   └── README.md              # 이 문서
└── src/                       # NestJS 애플리케이션
```

## 🚀 배포 방법

### 1. 패키지 빌드

```bash
cd lambda
npm install
./deploy.sh
```

이 명령어는 다음을 수행합니다:
- 기존 빌드 결과물 정리
- TypeScript 컴파일 (`dist/` 폴더 생성)
- `custom-message-lambda.zip` 패키지 생성

### 2. AWS Lambda 콘솔에서 함수 생성

1. **AWS Lambda 콘솔** 접속
2. **"함수 생성"** → **"처음부터 생성"**
3. 함수 설정:
   - **함수 이름**: `crefans-custom-message`
   - **런타임**: `Node.js 20.x`
   - **아키텍처**: `x86_64`
   - **권한**: 기본 실행 역할 생성

### 3. 코드 업로드

1. **"코드"** 탭 → **"업로드 위치"** → **".zip 파일"**
2. `custom-message-lambda.zip` 파일 선택
3. **"저장"** 클릭

### 4. 핸들러 설정 확인

**"런타임 설정"**에서 **핸들러**: `custom-message.handler` 확인

### 5. Cognito User Pool 트리거 연결

1. **AWS Cognito** → **User pools** → **해당 User Pool 선택**
2. **"User pool properties"** 탭 → **"Lambda triggers"** 섹션  
3. **"Custom message trigger"** 드롭다운에서 `crefans-custom-message` 선택
4. **"Save changes"** 클릭

### 6. ⚠️ 중요: Verification Type 변경

1. 같은 User Pool → **"Messaging"** 탭
2. **"Message templates"** → **"Verification message"** 편집
3. **Verification type**을 **"Code"**로 변경 (Link가 아닌)
4. **"Save changes"** 클릭

## ✅ 테스트 및 확인

### 1. 프론트엔드에서 회원가입 진행
- 새 사용자 회원가입 시도
- **"이메일을 확인해주세요!"** 단계까지 진행

### 2. 이메일 확인
- 브랜디드 HTML 이메일 수신 확인
- **"이메일 인증하기"** 버튼 클릭
- `https://www.crefans.com/email-verification?email=&code=` 링크로 이동

### 3. 인증 완료
- 5초 카운트다운 후 메인페이지로 자동 이동

## 🐛 문제 해결

### 기본 이메일이 계속 오는 경우
1. **Custom message trigger** 올바르게 연결되었는지 확인
2. **Verification type**이 **"Code"**로 설정되었는지 확인
3. Lambda 함수 로그 확인 (CloudWatch)

### Lambda 로그 확인 방법
1. AWS Lambda → `crefans-custom-message` → **"Monitor"** 탭
2. **"View CloudWatch logs"** 클릭
3. 최근 로그에서 함수 실행 여부 및 오류 확인

## 📁 파일 설명

- `custom-message.ts` - Lambda 함수 소스코드
- `package.json` - Lambda 전용 의존성
- `tsconfig.json` - TypeScript 컴파일 설정  
- `deploy.sh` - 빌드 및 패키징 스크립트
- `README.md` - 이 문서

## 🔧 기술 스펙

- **Runtime**: Node.js 20.x
- **Handler**: `custom-message.handler`
- **Trigger**: Cognito CustomMessage_SignUp
- **Frontend URL**: `https://www.crefans.com` (하드코딩)
- **Email Format**: HTML with inline CSS