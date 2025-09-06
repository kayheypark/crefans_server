export interface WebhookPayload {
  jobId: string;
  status: 'complete' | 'error' | 'progressing';
  progress?: number;
  mediaId?: string;
  userSub?: string;
  errorMessage?: string;
}

export class WebhookService {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendWebhook(payload: WebhookPayload): Promise<void> {
    if (!this.webhookUrl) {
      console.log('No webhook URL configured, skipping webhook');
      return;
    }

    try {
      console.log(`Sending webhook to ${this.webhookUrl}:`, payload);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Lambda-VideoProcessing/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('Webhook sent successfully');
    } catch (error) {
      console.error('Failed to send webhook:', error);
      // 웹훅 실패는 Lambda 실행을 중단하지 않음
    }
  }
}