# Option 3: Dynamic Media Proxy Architecture

## 개요

Option 3은 미디어 파일에 대한 동적 접근 제어를 제공하는 아키텍처입니다. 모든 미디어 접근은 서버를 통해 제어되며, 게시물의 공개 여부 변경 시 즉시 반영됩니다.

## 아키텍처 구성도

```
Frontend -> API Server -> S3 Buckets (Private)
                |
                v
         Access Control
         (Real-time check)
```

## 핵심 구성 요소

### 1. S3 버킷 설정 (Private)

- **storage**: 원본 파일 저장
- **processed**: 처리된 파일 저장 (리사이징, 비디오 변환)
- 두 버킷 모두 **Private** 설정으로 직접 접근 차단
- IAM 역할을 통한 서버 접근만 허용

### 2. 동적 미디어 프록시 엔드포인트

```typescript
GET /media/stream/:mediaId?quality={quality}
```

#### 품질 옵션:
- `original`: 원본 파일 (기본값)
- `high`: 1080p 또는 720p
- `medium`: 720p 또는 480p  
- `low`: 480p 또는 360p
- `thumbnail`: 썸네일 이미지
- `1080p`, `720p`, `480p`, `360p`: 특정 해상도

### 3. 접근 제어 로직

```typescript
// MediaService.checkMediaAccess()
1. 미디어가 게시물에 포함된 경우:
   - 공개 게시물 → 접근 허용
   - 멤버십 게시물 → 작성자 또는 구독자만 접근 허용

2. 개인 미디어 (게시물 미포함):
   - 소유자만 접근 가능
```

## 구현 세부사항

### 1. S3Service 확장

```typescript
// S3Service.getObjectStream()
async getObjectStream(bucket: string, key: string): Promise<{
  stream: any;
  contentType?: string;
  contentLength?: number;
}>;

// 버킷 이름 헬퍼
getBucketName(isProcessed: boolean = false): string;
```

### 2. MediaService 스트리밍

```typescript
// MediaService.streamMedia()
async streamMedia(
  mediaId: string,
  quality?: string,
  userSub?: string,
  res?: Response
): Promise<any>;
```

**처리 흐름:**
1. 미디어 조회 및 게시물 관계 확인
2. 접근 권한 검증
3. 미디어 처리 상태 확인 (`COMPLETED`)
4. 품질별 S3 키/버킷 결정
5. S3 스트리밍 및 응답 헤더 설정

### 3. PostingService URL 변경

```typescript
// 기존: presigned URL
originalUrl: "https://bucket.s3.amazonaws.com/key?signature=..."

// 새로운: 동적 프록시 URL
originalUrl: "http://localhost:3001/media/stream/mediaId"
```

### 4. 미디어 컨트롤러

```typescript
@Controller('media')
export class MediaController {
  // 동적 프록시 엔드포인트
  @UseGuards(OptionalAuthGuard)
  @Get('stream/:mediaId')
  async streamMedia(@Param('mediaId') mediaId: string, ...);
}
```

## 장점

### 1. 완전한 접근 제어
- 모든 미디어 접근이 서버를 통해 제어됨
- 게시물 공개 여부 변경 시 즉시 반영
- URL 변경 없이 권한 제어 가능

### 2. 보안성
- S3 버킷 직접 접근 불가
- 토큰 기반 인증과 연동
- 권한이 없는 사용자 차단

### 3. 유연성
- 다양한 품질 옵션 제공
- 원본/처리된 파일 선택 가능
- 캐싱 정책 제어 가능

### 4. 확장성
- 멤버십 구독 확인 로직 추가 가능
- 미디어 접근 로깅 가능
- 사용량 기반 과금 구현 가능

## URL 패턴

```typescript
// 원본 이미지/비디오
GET /media/stream/uuid-media-id

// 고화질 비디오
GET /media/stream/uuid-media-id?quality=high

// 썸네일
GET /media/stream/uuid-media-id?quality=thumbnail

// 특정 해상도
GET /media/stream/uuid-media-id?quality=720p
```

## 응답 헤더

```http
Content-Type: image/jpeg | video/mp4 | etc.
Content-Length: {fileSize}
Cache-Control: public, max-age=31536000
Accept-Ranges: bytes
```

## 데이터베이스 관계

```sql
Media
├── PostingMedia (연결 테이블)
│   └── Posting
│       ├── is_membership (공개/멤버십 구분)
│       └── user_sub (작성자)
└── user_sub (소유자)
```

## 성능 최적화

1. **캐싱**: `Cache-Control` 헤더로 브라우저/CDN 캐싱
2. **스트리밍**: 대용량 파일도 메모리 효율적 전송
3. **Range Request**: `Accept-Ranges: bytes` 지원

## 마이그레이션 참고사항

- 기존 presigned URL 방식에서 점진적 전환
- 레거시 호환성을 위한 `media/public/:id` 엔드포인트 유지
- 프론트엔드는 API 응답의 URL을 그대로 사용하므로 자동 적용

## 보안 고려사항

- S3 버킷 정책으로 직접 접근 차단
- Optional Auth Guard로 로그인 사용자와 게스트 모두 지원
- 권한이 없는 경우 `401 Unauthorized` 반환

## 향후 확장 계획

- 멤버십 구독 확인 로직 구현
- 미디어 접근 로깅 및 분석
- 대역폭 사용량 기반 과금
- CDN 연동 및 글로벌 캐싱