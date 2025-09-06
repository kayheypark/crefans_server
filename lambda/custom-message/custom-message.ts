import { Context, CognitoUserPoolTriggerEvent } from "aws-lambda";

export const handler = async (
  event: CognitoUserPoolTriggerEvent,
  context: Context
) => {
  console.log("CustomMessage trigger event:", JSON.stringify(event, null, 2));

  try {
    // CustomMessage_SignUp 트리거에만 반응
    if (event.triggerSource === "CustomMessage_SignUp") {
      const frontendUrl = "https://www.crefans.com";
      const email = event.request.userAttributes?.email;
      const code = event.request.codeParameter;

      if (!email || !code) {
        console.error("Missing email or code parameter");
        return event;
      }

      // 프론트엔드 인증 링크 생성
      const verificationUrl = `${frontendUrl}/email-verification?email=${encodeURIComponent(
        email
      )}&code=${code}`;

      // 커스텀 이메일 메시지 설정
      event.response.emailSubject = "crefans 이메일 인증을 완료해주세요";
      event.response.emailMessage = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background-color: #1890ff; padding: 40px 0; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 600; }
    .content { padding: 40px 30px; }
    .content h2 { color: #262626; font-size: 24px; margin-bottom: 20px; }
    .content p { color: #595959; font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
    .button { display: inline-block; background-color: #1890ff; color: white !important; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; margin: 20px 0; }
    .button:hover { background-color: #096dd9; }
    .footer { background-color: #f0f0f0; padding: 30px; text-align: center; color: #8c8c8c; font-size: 14px; }
    .divider { height: 1px; background-color: #e8e8e8; margin: 30px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>crefans</h1>
    </div>
    <div class="content">
      <h2>이메일 인증을 완료해주세요</h2>
      <p>안녕하세요!</p>
      <p>crefans에 가입해주셔서 감사합니다. 계정 활성화를 위해 아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>
      
      <a href="${verificationUrl}" class="button">이메일 인증하기</a>
      
      <div class="divider"></div>
      
      <p style="font-size: 14px; color: #8c8c8c;">
        위 버튼이 작동하지 않는다면, 아래 링크를 복사하여 브라우저에서 직접 접속해주세요:<br>
        <a href="${verificationUrl}" style="color: #1890ff; word-break: break-all;">${verificationUrl}</a>
      </p>
      
      <p style="font-size: 14px; color: #8c8c8c;">
        이 이메일을 요청하지 않으셨다면 무시해주세요.
      </p>
    </div>
    <div class="footer">
      <p>이 메시지는 발신 전용입니다. 문의사항이 있으시면 고객센터로 연락해주세요.</p>
      <p>&copy; 2025 crefans. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `;

      console.log("Custom email message set for user:", email);
    }

    return event;
  } catch (error) {
    console.error("Error in CustomMessage trigger:", error);
    return event;
  }
};
