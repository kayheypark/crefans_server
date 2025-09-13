/**
 * 미디어 스트림 URL 생성을 위한 유틸리티 클래스
 * /media/stream/ 프록시 URL을 생성하고 변환하는 공통 기능 제공
 */
export class MediaStreamUtil {
  /**
   * 미디어 ID로 기본 스트림 URL 생성
   * @param mediaId 미디어 ID
   * @param quality 품질 파라미터 (optional)
   * @returns 스트림 프록시 URL
   */
  static getMediaStreamUrl(mediaId: string, quality?: string): string {
    const baseUrl = process.env.API_BASE_URL;
    let streamUrl = `${baseUrl}/media/stream/${mediaId}`;

    if (quality) {
      streamUrl += `?quality=${quality}`;
    }

    return streamUrl;
  }

  /**
   * processedUrls를 /media/stream 프록시 URL로 변환
   * @param mediaId 미디어 ID
   * @param processedUrls 원본 processedUrls 객체
   * @returns 프록시 URL로 변환된 객체
   */
  static convertProcessedUrlsToStreamProxy(mediaId: string, processedUrls: any): any {
    if (!processedUrls || typeof processedUrls !== "object") {
      return processedUrls;
    }

    const convertedUrls: any = {};

    // 비디오 품질별 URL 변환
    if (processedUrls["1080p"]) {
      convertedUrls["1080p"] = this.getMediaStreamUrl(mediaId, "1080p");
    }
    if (processedUrls["720p"]) {
      convertedUrls["720p"] = this.getMediaStreamUrl(mediaId, "720p");
    }
    if (processedUrls["480p"]) {
      convertedUrls["480p"] = this.getMediaStreamUrl(mediaId, "480p");
    }

    // 기타 품질 레벨 (high, medium, low 등)
    ["high", "medium", "low", "original"].forEach((quality) => {
      if (processedUrls[quality]) {
        convertedUrls[quality] = this.getMediaStreamUrl(mediaId, quality);
      }
    });

    return convertedUrls;
  }

  /**
   * thumbnailUrls를 /media/stream 프록시 URL로 변환
   * @param mediaId 미디어 ID
   * @param thumbnailUrls 원본 thumbnailUrls 객체
   * @returns 프록시 URL로 변환된 객체
   */
  static convertThumbnailUrlsToStreamProxy(mediaId: string, thumbnailUrls: any): any {
    if (!thumbnailUrls || typeof thumbnailUrls !== "object") {
      return thumbnailUrls;
    }

    const convertedUrls: any = {};

    // 썸네일 인덱스별 URL 변환 (thumb_0, thumb_1, ...)
    Object.keys(thumbnailUrls).forEach((key) => {
      if (key.startsWith("thumb_")) {
        convertedUrls[key] = this.getMediaStreamUrl(mediaId, "thumbnail");
      } else {
        // 기타 썸네일 관련 필드
        convertedUrls[key] = this.getMediaStreamUrl(mediaId, "thumbnail");
      }
    });

    return convertedUrls;
  }
}