# 멤버십 기반 미디어 접근 제어 시스템

## 개요

크리에이터가 멤버십 구독자들에게만 특별한 콘텐츠를 제공할 수 있도록 하는 보안 시스템입니다. 사용자의 멤버십 상태를 확인하여 미디어 파일에 대한 접근 권한을 제어합니다.

## 시스템 흐름

### 기본 시나리오
```
1. 유저: "서버야, 이 포스팅의 사진/영상을 보고 싶어요"
2. 서버: "너가 누군데? 로그인 정보 주세요"
3. 유저: "여기 내 쿠키에 저장된 JWT 토큰이 있어요"
4. 서버: "흠... 유저 고유ID를 알게 되었군. 그럼 이 포스팅에 대한 접근 권한이 있는지 확인해볼까?"
   - 개별구매를 했는지 확인
   - 유효한 멤버십을 구독 중인지 확인
   - 멤버십 레벨이 충분한지 확인
5. 서버: "음, 권한이 있구나! 그럼 우리 S3 버킷은 원래 비공개인데 너만 볼 수 있는 특별한 링크를 줄게"
6. 서버: "이 링크는 1시간짜리야. 그 뒤로는 만료되어 너도 볼 수 없을 거야"
7. 서버: "만료되면 다시 로그인 정보를 주면, 권한 확인 후 새 링크를 줄게"
```

## 멤버십 시스템 구조

### 1. 멤버십 생성 및 관리

#### API 엔드포인트
```
POST   /membership           - 멤버십 생성
GET    /membership           - 내 멤버십 목록
PUT    /membership/:id       - 멤버십 수정
DELETE /membership/:id       - 멤버십 삭제
PATCH  /membership/:id/toggle-active - 멤버십 활성화/비활성화
```

#### 멤버십 데이터 구조
```typescript
interface MembershipItem {
  id: number;
  name: string;              // "프리미엄 멤버십"
  description?: string;      // "고품질 콘텐츠 접근 가능"
  level: number;            // 1-10 (높을수록 상위 멤버십)
  price: number;            // 월 구독료 (원)
  billing_unit: 'MONTH';   // 결제 주기 (월/년 등)
  billing_period: 1;       // 결제 주기 (1개월마다)
  trial_period: 7;         // 무료 체험 기간 (일)
  is_active: boolean;      // 활성화 여부
}
```

### 2. 글쓰기에서 멤버십 설정

#### 크리에이터가 할 수 있는 설정
```typescript
// 포스팅 작성 시 설정
interface PostingSettings {
  is_membership: boolean;              // 멤버십 전용 여부
  membership_level: number;           // 최소 요구 멤버십 레벨
  allow_individual_purchase: boolean; // 개별 구매 허용 여부
  individual_purchase_price: number;  // 개별 구매 가격
}
```

#### 시나리오 예시
1. **무료 공개**: `is_membership: false` → 누구나 볼 수 있음
2. **레벨 3 멤버십 전용**: `is_membership: true, membership_level: 3` → 레벨 3 이상 구독자만
3. **개별 구매 가능**: `allow_individual_purchase: true, price: 1000` → 1000원에 단건 구매 가능

## 접근 권한 검증 로직

### 권한 체크 흐름
```typescript
async function checkMediaAccess(userId: string, postingId: number) {
  const posting = await getPosting(postingId);
  
  // 1. 공개 + 비멤버십 → 누구나 접근 가능
  if (!posting.is_membership) {
    return true;
  }
  
  // 2. 로그인 안한 사용자 → 거부
  if (!userId) {
    return false;
  }
  
  // 3. 작성자 본인 → 항상 허용
  if (posting.user_sub === userId) {
    return true;
  }
  
  // 4. 멤버십 구독 확인
  const subscription = await checkActiveSubscription(userId, posting.membership_level);
  if (subscription) {
    return true;
  }
  
  // 5. 개별 구매 확인
  if (posting.allow_individual_purchase) {
    const purchase = await checkIndividualPurchase(userId, postingId);
    if (purchase) {
      return true;
    }
  }
  
  return false; // 접근 거부
}
```

### 권한별 접근 매트릭스
| 콘텐츠 유형 | 로그인 상태 | 멤버십 구독 | 개별 구매 | 접근 권한 |
|------------|-----------|-----------|----------|----------|
| 무료 공개 | 관계없음 | - | - | ✅ 허용 |
| 멤버십 전용 | 비로그인 | - | - | ❌ 거부 |
| 멤버십 전용 | 로그인 | 레벨 충족 | - | ✅ 허용 |
| 멤버십 전용 | 로그인 | 레벨 부족 | 구매함 | ✅ 허용 |
| 멤버십 전용 | 로그인 | 구독 안함 | 구매 안함 | ❌ 거부 |

## 보안 메커니즘

### 1. S3 Presigned URL 생성
```typescript
async function generateSecureUrl(mediaId: string): Promise<string> {
  return s3.getSignedUrl('getObject', {
    Bucket: 'crefans-media',
    Key: mediaId,
    Expires: 3600  // 1시간 후 만료
  });
}
```

### 2. URL 접근 제어
```
기존: https://s3.amazonaws.com/bucket/media-id
      → 누구나 접근 가능 (문제!)

새로운: https://api.crefans.com/media/access/media-id
       → 권한 체크 후 임시 URL 제공
```

### 3. 시간 제한 보안
- **1시간 유효**: 링크 공유해도 1시간 후 자동 만료
- **재인증 필요**: 만료 시 다시 권한 확인 후 새 링크 발급
- **실시간 차단**: 멤버십 해지 시 즉시 접근 불가

## 프론트엔드 연동

### 멤버십 관리 모달
```typescript
// 1. 멤버십 목록 불러오기
const memberships = await membershipAPI.getMemberships();

// 2. 새 멤버십 생성
const newMembership = await membershipAPI.createMembership({
  name: "프리미엄 멤버십",
  level: 5,
  price: 10000,
  billing_unit: "MONTH"
});

// 3. 멤버십 수정/삭제
await membershipAPI.updateMembership(id, updateData);
await membershipAPI.deleteMembership(id);
```

### 글쓰기 페이지 연동
```typescript
// 멤버십 레벨 선택
const handleLevelSelect = (level: number) => {
  setSelectedMembershipLevel(level);
};

// 포스팅 발행 시 멤버십 설정 포함
const postingData = {
  title,
  content,
  is_membership: isMembershipOnly,
  membership_level: selectedMembershipLevel,
  allow_individual_purchase: allowIndividualPurchase,
  individual_purchase_price: purchasePrice
};
```

## 데이터베이스 구조

### 핵심 테이블
```sql
-- 멤버십 상품
membership_items (
  id INT PRIMARY KEY,
  creator_id VARCHAR(255),  -- 크리에이터 ID
  name VARCHAR(255),        -- 멤버십 이름
  level INT,               -- 멤버십 레벨 (1-10)
  price DECIMAL(18,4),     -- 가격
  billing_unit ENUM('DAY','WEEK','MONTH','YEAR'),
  is_active BOOLEAN
);

-- 포스팅
postings (
  id INT PRIMARY KEY,
  user_sub VARCHAR(255),           -- 작성자
  is_membership BOOLEAN,           -- 멤버십 전용 여부
  membership_level INT,            -- 최소 요구 레벨
  allow_individual_purchase BOOLEAN,
  individual_purchase_price DECIMAL(10,0)
);

-- 구독 정보
subscriptions (
  subscriber_id VARCHAR(255),      -- 구독자
  membership_item_id INT,          -- 구독한 멤버십
  status ENUM('ONGOING','EXPIRED'),
  started_at DATETIME
);
```

## 보안 장점

### 1. 링크 남용 방지
- 일반 S3 URL: 영구적으로 접근 가능
- Presigned URL: 1시간 후 자동 만료

### 2. 실시간 권한 제어
- 멤버십 해지 → 즉시 접근 차단
- 레벨 변경 → 실시간 반영
- 개별 구매 → 즉시 접근 허용

### 3. 사용자 추적
- 누가 언제 어떤 콘텐츠에 접근했는지 로그
- 멤버십 없이 접근 시도한 사용자 파악
- 구매 유도를 위한 데이터 수집

## 향후 확장 계획

### 1. 결제 시스템 연동
```typescript
// 개별 구매 처리
app.post('/purchase/:postingId', async (req, res) => {
  const payment = await processPayment(userId, amount);
  if (payment.success) {
    await createPurchaseRecord(userId, postingId);
  }
});
```

### 2. 구독 관리
```typescript
// 멤버십 구독 처리
app.post('/subscribe/:membershipId', async (req, res) => {
  await createSubscription(userId, membershipId);
  await scheduleRecurringPayment(userId, membershipId);
});
```

### 3. 분석 대시보드
- 멤버십별 수익 통계
- 콘텐츠 조회수 분석
- 구독 전환율 측정

이 시스템을 통해 크리에이터는 안전하게 프리미엄 콘텐츠를 제공하고, 구독자들은 편리하게 멤버십 혜택을 누릴 수 있습니다.