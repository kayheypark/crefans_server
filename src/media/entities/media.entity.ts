// Prisma Media 모델을 그대로 사용하므로 별도의 인터페이스는 불필요
// @prisma/client에서 Media 타입을 import하여 사용

export interface MediaProcessingJob {
  jobId: string;
  mediaId: string;
  status: 'submitted' | 'progressing' | 'complete' | 'error';
  progress?: number;
  errorMessage?: string;
}