import {
  MediaConvertClient,
  CreateJobCommand,
  CreateJobCommandInput,
  DescribeEndpointsCommand,
  GetJobCommand,
} from "@aws-sdk/client-mediaconvert";

export interface MediaConvertConfig {
  region: string;
  roleArn: string;
  processedBucket: string;
  backendWebhookUrl?: string;
}

export class MediaConvertService {
  private client: MediaConvertClient;
  private config: MediaConvertConfig;

  constructor(config: MediaConvertConfig) {
    this.config = config;
    this.client = new MediaConvertClient({
      region: config.region,
    });
  }

  async initialize(): Promise<void> {
    try {
      // MediaConvert 엔드포인트 조회
      const endpointCommand = new DescribeEndpointsCommand({});
      const endpointResponse = await this.client.send(endpointCommand);

      if (endpointResponse.Endpoints && endpointResponse.Endpoints.length > 0) {
        const endpoint = endpointResponse.Endpoints[0].Url;

        // 사용자 정의 엔드포인트로 클라이언트 재생성
        this.client = new MediaConvertClient({
          region: this.config.region,
          endpoint,
        });

        console.log(`MediaConvert initialized with endpoint: ${endpoint}`);
      }
    } catch (error) {
      console.error("Failed to initialize MediaConvert:", error);
      throw error;
    }
  }

  async createTranscodingJob(
    inputS3Uri: string,
    outputPrefix: string,
    mediaId: string,
    userSub: string
  ): Promise<string> {
    const jobInput: CreateJobCommandInput = {
      Role: this.config.roleArn,
      Settings: {
        Inputs: [
          {
            FileInput: inputS3Uri,
            AudioSelectors: {
              "Audio Selector 1": {
                Offset: 0,
                DefaultSelection: "DEFAULT",
                ProgramSelection: 1,
              },
            },
            VideoSelector: {
              ColorSpace: "FOLLOW",
            },
          },
        ],
        OutputGroups: [
          // MP4 출력 그룹
          {
            Name: "File Group",
            Outputs: [
              // 1080p
              {
                NameModifier: "_1080p",
                VideoDescription: {
                  Width: 1920,
                  Height: 1080,
                  CodecSettings: {
                    Codec: "H_264",
                    H264Settings: {
                      MaxBitrate: 5000000,
                      RateControlMode: "QVBR",
                      QvbrSettings: {
                        QvbrQualityLevel: 8,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: "FOLLOW_INPUT",
                    CodecSettings: {
                      Codec: "AAC",
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: "NORMAL",
                        Bitrate: 128000,
                        RateControlMode: "CBR",
                        CodecProfile: "LC",
                        CodingMode: "CODING_MODE_2_0",
                        RawFormat: "NONE",
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: "MP4",
                  Mp4Settings: {
                    CslgAtom: "INCLUDE",
                    FreeSpaceBox: "EXCLUDE",
                    MoovPlacement: "PROGRESSIVE_DOWNLOAD",
                  },
                },
              },
              // 720p
              {
                NameModifier: "_720p",
                VideoDescription: {
                  Width: 1280,
                  Height: 720,
                  CodecSettings: {
                    Codec: "H_264",
                    H264Settings: {
                      MaxBitrate: 2500000,
                      RateControlMode: "QVBR",
                      QvbrSettings: {
                        QvbrQualityLevel: 7,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: "FOLLOW_INPUT",
                    CodecSettings: {
                      Codec: "AAC",
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: "NORMAL",
                        Bitrate: 96000,
                        RateControlMode: "CBR",
                        CodecProfile: "LC",
                        CodingMode: "CODING_MODE_2_0",
                        RawFormat: "NONE",
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: "MP4",
                  Mp4Settings: {
                    CslgAtom: "INCLUDE",
                    FreeSpaceBox: "EXCLUDE",
                    MoovPlacement: "PROGRESSIVE_DOWNLOAD",
                  },
                },
              },
              // 480p
              {
                NameModifier: "_480p",
                VideoDescription: {
                  Width: 854,
                  Height: 480,
                  CodecSettings: {
                    Codec: "H_264",
                    H264Settings: {
                      MaxBitrate: 1000000,
                      RateControlMode: "QVBR",
                      QvbrSettings: {
                        QvbrQualityLevel: 6,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: "FOLLOW_INPUT",
                    CodecSettings: {
                      Codec: "AAC",
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: "NORMAL",
                        Bitrate: 64000,
                        RateControlMode: "CBR",
                        CodecProfile: "LC",
                        CodingMode: "CODING_MODE_2_0",
                        RawFormat: "NONE",
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: "MP4",
                  Mp4Settings: {
                    CslgAtom: "INCLUDE",
                    FreeSpaceBox: "EXCLUDE",
                    MoovPlacement: "PROGRESSIVE_DOWNLOAD",
                  },
                },
              },
            ],
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: `s3://${this.config.processedBucket}/${outputPrefix}`,
              },
            },
          },
          // 썸네일 출력 그룹
          {
            Name: "Thumbnail Group",
            Outputs: [
              {
                NameModifier: "_thumbnail",
                VideoDescription: {
                  Width: 640,
                  Height: 360,
                  CodecSettings: {
                    Codec: "FRAME_CAPTURE",
                    FrameCaptureSettings: {
                      FramerateNumerator: 1,
                      FramerateDenominator: 10, // 10초마다 1프레임
                      MaxCaptures: 5, // 최대 5개 썸네일
                      Quality: 80,
                    },
                  },
                },
                ContainerSettings: {
                  Container: "RAW",
                },
              },
            ],
            OutputGroupSettings: {
              Type: "FILE_GROUP_SETTINGS",
              FileGroupSettings: {
                Destination: `s3://${this.config.processedBucket}/${outputPrefix}thumbnails/`,
              },
            },
          },
        ],
      },
      UserMetadata: {
        mediaId: mediaId,
        userSub: userSub,
        backendWebhookUrl: this.config.backendWebhookUrl || "",
      },
    };

    try {
      const command = new CreateJobCommand(jobInput);
      const result = await this.client.send(command);

      console.log(
        `MediaConvert job created: ${result.Job?.Id} for media: ${mediaId}`
      );

      return result.Job?.Id || "";
    } catch (error) {
      console.error(
        `Failed to create MediaConvert job for media: ${mediaId}`,
        error
      );
      throw new Error("Failed to create transcoding job");
    }
  }

  async getJobStatus(jobId: string): Promise<string> {
    try {
      const command = new GetJobCommand({ Id: jobId });
      const result = await this.client.send(command);

      const status = result.Job?.Status || "UNKNOWN";
      console.log(`Job ${jobId} status: ${status}`);

      return status;
    } catch (error) {
      console.error(`Failed to get job status for ${jobId}:`, error);
      throw error;
    }
  }
}
