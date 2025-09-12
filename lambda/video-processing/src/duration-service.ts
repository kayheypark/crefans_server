import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class DurationService {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({});
  }

  /**
   * S3의 비디오 파일에서 duration 추출
   */
  async extractDuration(bucketName: string, objectKey: string): Promise<number | undefined> {
    let tempFilePath: string | undefined;

    try {
      console.log(`Extracting duration from s3://${bucketName}/${objectKey}`);

      // ffprobe가 Lambda 환경에서 사용 가능한지 확인
      try {
        execSync('ffprobe -version', { stdio: 'ignore' });
      } catch (error) {
        console.warn('ffprobe not available in Lambda environment');
        return undefined;
      }

      // 임시 파일 생성
      const tempDir = os.tmpdir();
      const fileName = path.basename(objectKey);
      tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);

      // S3에서 파일 다운로드
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        })
      );

      if (!response.Body) {
        throw new Error('No body in S3 response');
      }

      // 스트림을 임시 파일로 저장
      const chunks: Uint8Array[] = [];
      const readable = response.Body as NodeJS.ReadableStream;

      return new Promise((resolve, reject) => {
        readable.on('data', (chunk: Uint8Array) => {
          chunks.push(chunk);
        });

        readable.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(tempFilePath!, buffer);

            // ffprobe로 duration 추출
            const duration = await this.extractDurationWithFFProbe(tempFilePath!);
            resolve(duration);
          } catch (error) {
            reject(error);
          }
        });

        readable.on('error', reject);
      });

    } catch (error) {
      console.error('Failed to extract duration:', error);
      return undefined;
    } finally {
      // 임시 파일 정리
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup temp file:', cleanupError);
        }
      }
    }
  }

  /**
   * ffprobe를 사용하여 비디오 파일에서 duration 추출
   */
  private async extractDurationWithFFProbe(filePath: string): Promise<number | undefined> {
    try {
      const command = `ffprobe -v quiet -print_format json -show_format "${filePath}"`;
      const output = execSync(command, { encoding: 'utf8' });
      
      const data = JSON.parse(output);
      const duration = parseFloat(data.format?.duration || '0');
      
      if (duration > 0) {
        return Math.round(duration * 100) / 100; // 소수점 2자리
      }
      
      return undefined;
    } catch (error) {
      console.error('ffprobe extraction failed:', error);
      return undefined;
    }
  }
}