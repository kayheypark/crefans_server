import { S3Event, S3Handler, Context } from 'aws-lambda';
import { MediaConvertService, MediaConvertConfig } from './mediaconvert-service';
import { WebhookService } from './webhook-service';
import { DurationService } from './duration-service';

// 환경변수에서 설정 로드
const config: MediaConvertConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
  roleArn: process.env.MEDIACONVERT_ROLE_ARN || '',
  processedBucket: process.env.S3_PROCESSED_BUCKET || '',
  backendWebhookUrl: process.env.BACKEND_WEBHOOK_URL || '',
};

// 전역 인스턴스 (Lambda 컨테이너 재사용을 위해)
let mediaConvertService: MediaConvertService | null = null;
let webhookService: WebhookService | null = null;
let durationService: DurationService | null = null;

async function initializeServices(): Promise<void> {
  if (!mediaConvertService) {
    mediaConvertService = new MediaConvertService(config);
    await mediaConvertService.initialize();
  }
  
  if (!webhookService && config.backendWebhookUrl) {
    webhookService = new WebhookService(config.backendWebhookUrl);
  }

  if (!durationService) {
    durationService = new DurationService();
  }
}

function isVideoFile(key: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv'];
  const extension = key.toLowerCase().substring(key.lastIndexOf('.'));
  return videoExtensions.includes(extension);
}

function extractMediaInfoFromKey(key: string): { userSub: string; mediaId: string } | null {
  // Key 형식: uploads/{userSub}/{uuid}.{extension}
  const parts = key.split('/');
  if (parts.length !== 3 || parts[0] !== 'uploads') {
    return null;
  }
  
  const userSub = parts[1];
  const fileName = parts[2];
  const mediaId = fileName.substring(0, fileName.lastIndexOf('.')); // UUID 부분 추출
  
  return { userSub, mediaId };
}

export const handler: S3Handler = async (event: S3Event, context: Context) => {
  console.log('Lambda function started');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // 서비스 초기화
    await initializeServices();
    
    if (!mediaConvertService) {
      throw new Error('MediaConvert service not initialized');
    }
    
    // 각 S3 이벤트 레코드 처리
    for (const record of event.Records) {
      try {
        const bucketName = record.s3.bucket.name;
        const objectKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        
        console.log(`Processing object: s3://${bucketName}/${objectKey}`);
        
        // 비디오 파일인지 확인
        if (!isVideoFile(objectKey)) {
          console.log(`Skipping non-video file: ${objectKey}`);
          continue;
        }
        
        // Key에서 미디어 정보 추출
        const mediaInfo = extractMediaInfoFromKey(objectKey);
        if (!mediaInfo) {
          console.log(`Could not extract media info from key: ${objectKey}`);
          continue;
        }
        
        const { userSub, mediaId } = mediaInfo;
        
        console.log(`Processing video for user: ${userSub}, media: ${mediaId}`);
        
        // 비디오 duration 추출 (선택적, 실패해도 계속 진행)
        let duration: number | undefined;
        if (durationService) {
          try {
            duration = await durationService.extractDuration(bucketName, objectKey);
            console.log(`Duration extracted: ${duration} seconds`);
          } catch (durationError) {
            console.warn('Duration extraction failed, proceeding without duration:', durationError);
          }
        }
        
        // MediaConvert 작업 생성
        const inputS3Uri = `s3://${bucketName}/${objectKey}`;
        const outputPrefix = `processed/${userSub}/${mediaId}/`;
        
        const jobId = await mediaConvertService.createTranscodingJob(
          inputS3Uri,
          outputPrefix,
          mediaId,
          userSub,
          duration // duration을 userMetadata에 포함
        );
        
        console.log(`MediaConvert job created: ${jobId}`);
        
        // 백엔드에 작업 시작 알림 (선택사항)
        if (webhookService) {
          await webhookService.sendWebhook({
            jobId,
            status: 'progressing',
            mediaId,
            userSub,
            progress: 0,
          });
        }
        
      } catch (recordError) {
        console.error(`Failed to process record:`, recordError);
        
        // 개별 레코드 실패는 전체 실행을 중단하지 않음
        // 필요시 DLQ(Dead Letter Queue)로 전송
        continue;
      }
    }
    
    console.log('Lambda function completed successfully');
    
  } catch (error) {
    console.error('Lambda function failed:', error);
    throw error; // Lambda 실행 실패로 표시
  }
};

// MediaConvert 작업 상태 변경 이벤트 핸들러 (별도 Lambda 함수로 사용 가능)
export const mediaConvertEventHandler = async (event: any, context: Context) => {
  console.log('MediaConvert event received:', JSON.stringify(event, null, 2));
  
  try {
    const detail = event.detail;
    const jobId = detail.jobId;
    const status = detail.status;
    const userMetadata = detail.userMetadata || {};
    
    if (!webhookService && config.backendWebhookUrl) {
      webhookService = new WebhookService(config.backendWebhookUrl);
    }
    
    if (webhookService) {
      // UserMetadata에서 duration 추출 (S3 트리거 시 추출된 값)
      let duration: number | undefined;
      
      if (userMetadata.duration && userMetadata.duration !== "") {
        try {
          duration = parseFloat(userMetadata.duration);
          console.log(`Using duration from userMetadata: ${duration} seconds`);
        } catch (parseError) {
          console.warn('Failed to parse duration from userMetadata:', parseError);
        }
      }
      
      // MediaConvert 출력에서 duration 추출 (fallback)
      if (!duration && status === 'COMPLETE') {
        try {
          // 방법 1: outputGroupDetails에서 추출
          if (detail.outputGroupDetails && detail.outputGroupDetails.length > 0) {
            const firstOutput = detail.outputGroupDetails[0]?.outputDetails?.[0];
            if (firstOutput?.durationInMs) {
              duration = Math.round(firstOutput.durationInMs / 1000 * 100) / 100;
              console.log(`Using duration from MediaConvert output: ${duration} seconds`);
            }
          }
        } catch (durationError) {
          console.warn('Failed to extract duration from MediaConvert output:', durationError);
        }
      }

      await webhookService.sendWebhook({
        jobId,
        status: status.toLowerCase(),
        mediaId: userMetadata.mediaId,
        userSub: userMetadata.userSub,
        progress: status === 'COMPLETE' ? 100 : undefined,
        errorMessage: status === 'ERROR' ? detail.errorMessage : undefined,
        duration,
      });
    }
    
    console.log('MediaConvert event processed successfully');
    
  } catch (error) {
    console.error('Failed to process MediaConvert event:', error);
    throw error;
  }
};