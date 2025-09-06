// 간단한 테스트용 Lambda 함수
exports.handler = async (event) => {
  console.log("Test Lambda function started");
  console.log("Event:", JSON.stringify(event, null, 2));

  // 환경변수 확인
  console.log("Environment variables:");
  console.log("AWS_REGION:", process.env.AWS_REGION);
  console.log("MEDIACONVERT_ROLE_ARN:", process.env.MEDIACONVERT_ROLE_ARN);
  console.log("S3_PROCESSED_BUCKET:", process.env.S3_PROCESSED_BUCKET);
  console.log("BACKEND_WEBHOOK_URL:", process.env.BACKEND_WEBHOOK_URL);

  // MediaConvert 클라이언트 테스트
  try {
    const {
      MediaConvertClient,
      DescribeEndpointsCommand,
    } = require("@aws-sdk/client-mediaconvert");

    const client = new MediaConvertClient({
      region: process.env.AWS_REGION || "ap-northeast-2",
    });

    console.log("Testing MediaConvert endpoint...");
    const endpointCommand = new DescribeEndpointsCommand({});
    const endpointResponse = await client.send(endpointCommand);

    console.log(
      "MediaConvert endpoint response:",
      JSON.stringify(endpointResponse, null, 2)
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Test completed successfully",
        endpoint: endpointResponse.Endpoints?.[0]?.Url,
        environment: {
          region: process.env.AWS_REGION,
          roleArn: process.env.MEDIACONVERT_ROLE_ARN,
          processedBucket: process.env.S3_PROCESSED_BUCKET,
        },
      }),
    };
  } catch (error) {
    console.error("Test failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
    };
  }
};
