export interface Media {
  id: string;
  userSub: string;
  originalUrl: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  
  // 트랜스코딩된 버전들
  versions: {
    '1080p'?: string;
    '720p'?: string;
    '480p'?: string;
  };
  
  // 썸네일들
  thumbnails: string[];
  
  // 메타데이터
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
    fileSize?: number;
    codec?: string;
  };
  
  createdAt: Date;
  processedAt?: Date;
}

export interface MediaProcessingJob {
  jobId: string;
  mediaId: string;
  status: 'submitted' | 'progressing' | 'complete' | 'error';
  progress?: number;
  errorMessage?: string;
}