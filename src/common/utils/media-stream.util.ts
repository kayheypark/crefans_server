/**
 * 미디어 스트림 URL 생성을 위한 유틸리티 클래스
 * 타입별 미디어 엔드포인트 URL을 생성하고 변환하는 공통 기능 제공
 */
export class MediaStreamUtil {
  /**
   * 비디오 스트림 URL 생성
   * @param mediaId 미디어 ID
   * @param quality 비디오 품질 (480p, 720p, 1080p)
   * @returns 비디오 스트림 URL
   */
  static getVideoStreamUrl(mediaId: string, quality?: "480p" | "720p" | "1080p"): string {
    const baseUrl = process.env.API_BASE_URL;
    let streamUrl = `${baseUrl}/media/video/${mediaId}`;

    if (quality) {
      streamUrl += `?quality=${quality}`;
    }

    return streamUrl;
  }

  /**
   * 이미지 스트림 URL 생성
   * @param mediaId 미디어 ID
   * @param quality 이미지 품질 (high, medium, low, thumbnail)
   * @returns 이미지 스트림 URL
   */
  static getImageStreamUrl(mediaId: string, quality?: "high" | "medium" | "low" | "thumbnail"): string {
    const baseUrl = process.env.API_BASE_URL;
    let streamUrl = `${baseUrl}/media/image/${mediaId}`;

    if (quality) {
      streamUrl += `?quality=${quality}`;
    }

    return streamUrl;
  }


  /**
   * 비디오 processedUrls를 타입별 스트림 URL로 변환
   * @param mediaId 미디어 ID
   * @param processedUrls 원본 processedUrls 객체
   * @returns 비디오 스트림 URL로 변환된 객체
   */
  static convertVideoUrlsToStreamProxy(mediaId: string, processedUrls: any): any {
    if (!processedUrls || typeof processedUrls !== "object") {
      return processedUrls;
    }

    const convertedUrls: any = {};

    // 비디오 품질 매핑
    Object.keys(processedUrls).forEach((quality) => {
      if (["480p", "720p", "1080p"].includes(quality)) {
        convertedUrls[quality] = this.getVideoStreamUrl(mediaId, quality as "480p" | "720p" | "1080p");
      } else {
        // 다른 키는 그대로 유지
        convertedUrls[quality] = this.getVideoStreamUrl(mediaId);
      }
    });

    return convertedUrls;
  }

  /**
   * 이미지 processedUrls를 타입별 스트림 URL로 변환
   * @param mediaId 미디어 ID
   * @param processedUrls 원본 processedUrls 객체
   * @returns 이미지 스트림 URL로 변환된 객체
   */
  static convertImageUrlsToStreamProxy(mediaId: string, processedUrls: any): any {
    if (!processedUrls || typeof processedUrls !== "object") {
      return processedUrls;
    }

    const convertedUrls: any = {};

    // 이미지 품질 매핑 (데이터베이스 키 -> API 품질 파라미터)
    Object.keys(processedUrls).forEach((dbKey) => {
      switch (dbKey) {
        case 'large':
          convertedUrls[dbKey] = this.getImageStreamUrl(mediaId, "high");
          break;
        case 'small':
          convertedUrls[dbKey] = this.getImageStreamUrl(mediaId, "medium");
          break;
        case 'thumb':
          convertedUrls[dbKey] = this.getImageStreamUrl(mediaId, "low");
          break;
        default:
          convertedUrls[dbKey] = this.getImageStreamUrl(mediaId);
          break;
      }
    });

    return convertedUrls;
  }


  /**
   * 비디오 썸네일을 타입별 스트림 URL로 변환
   * @param mediaId 미디어 ID
   * @param thumbnailUrls 원본 thumbnailUrls 배열
   * @returns 비디오 썸네일 스트림 URL 배열
   */
  static convertVideoThumbnailsToStreamProxy(mediaId: string, thumbnailUrls: any): any {
    if (!thumbnailUrls) {
      return thumbnailUrls;
    }

    // 배열 형태 (비디오 썸네일)
    if (Array.isArray(thumbnailUrls)) {
      return thumbnailUrls.map(() => this.getVideoStreamUrl(mediaId));
    }

    return thumbnailUrls;
  }

  /**
   * 이미지 썸네일을 타입별 스트림 URL로 변환
   * @param mediaId 미디어 ID
   * @param thumbnailUrls 원본 thumbnailUrls 객체
   * @returns 이미지 썸네일 스트림 URL
   */
  static convertImageThumbnailsToStreamProxy(mediaId: string, thumbnailUrls: any): any {
    if (!thumbnailUrls) {
      return thumbnailUrls;
    }

    // 객체 형태 (이미지 썸네일)
    if (typeof thumbnailUrls === "object" && !Array.isArray(thumbnailUrls)) {
      const convertedUrls: any = {};
      Object.keys(thumbnailUrls).forEach((key) => {
        convertedUrls[key] = this.getImageStreamUrl(mediaId, "thumbnail");
      });
      return convertedUrls;
    }

    return thumbnailUrls;
  }


  /**
   * 미디어 타입을 자동 감지하여 적절한 스트림 URL 생성
   * @param mediaId 미디어 ID
   * @param mediaType 미디어 타입 ('video' | 'image')
   * @param quality 품질 파라미터
   * @returns 타입별 스트림 URL
   */
  static getTypedStreamUrl(
    mediaId: string,
    mediaType: 'video' | 'image',
    quality?: string
  ): string {
    if (mediaType === 'video') {
      const videoQuality = quality as "480p" | "720p" | "1080p" | undefined;
      return this.getVideoStreamUrl(mediaId, videoQuality);
    } else {
      const imageQuality = quality as "high" | "medium" | "low" | "thumbnail" | undefined;
      return this.getImageStreamUrl(mediaId, imageQuality);
    }
  }
}