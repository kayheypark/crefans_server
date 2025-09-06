import { Injectable, Logger } from '@nestjs/common';
import { MediaConvertClient, CreateJobCommand, CreateJobCommandInput } from '@aws-sdk/client-mediaconvert';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaConvertService {
  private readonly logger = new Logger(MediaConvertService.name);
  private readonly mediaConvertClient: MediaConvertClient;
  private readonly mediaConvertRole: string;
  private readonly processedBucket: string;

  constructor(private readonly configService: ConfigService) {
    this.mediaConvertClient = new MediaConvertClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
      endpoint: this.configService.get('MEDIACONVERT_ENDPOINT'), // 리전별 엔드포인트
    });

    this.mediaConvertRole = this.configService.get('MEDIACONVERT_ROLE_ARN');
    this.processedBucket = this.configService.get('S3_PROCESSED_BUCKET');
  }

  async createTranscodingJob(
    inputS3Uri: string,
    outputPrefix: string,
    mediaId: string,
  ): Promise<string> {
    const jobInput: CreateJobCommandInput = {
      Role: this.mediaConvertRole,
      Settings: {
        Inputs: [
          {
            FileInput: inputS3Uri,
            AudioSelectors: {
              'Audio Selector 1': {
                Offset: 0,
                DefaultSelection: 'DEFAULT',
                ProgramSelection: 1,
              },
            },
            VideoSelector: {
              ColorSpace: 'FOLLOW',
            },
          },
        ],
        OutputGroups: [
          // MP4 출력 그룹
          {
            Name: 'File Group',
            Outputs: [
              // 1080p
              {
                NameModifier: '_1080p',
                VideoDescription: {
                  Width: 1920,
                  Height: 1080,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 5000000,
                      RateControlMode: 'QVBR',
                      QvbrSettings: {
                        QvbrQualityLevel: 8,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: 'FOLLOW_INPUT',
                    CodecSettings: {
                      Codec: 'AAC',
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: 'NORMAL',
                        Bitrate: 128000,
                        RateControlMode: 'CBR',
                        CodecProfile: 'LC',
                        CodingMode: 'CODING_MODE_2_0',
                        RawFormat: 'NONE',
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: 'MP4',
                  Mp4Settings: {
                    CslgAtom: 'INCLUDE',
                    FreeSpaceBox: 'EXCLUDE',
                    MoovPlacement: 'PROGRESSIVE_DOWNLOAD',
                  },
                },
              },
              // 720p
              {
                NameModifier: '_720p',
                VideoDescription: {
                  Width: 1280,
                  Height: 720,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 2500000,
                      RateControlMode: 'QVBR',
                      QvbrSettings: {
                        QvbrQualityLevel: 7,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: 'FOLLOW_INPUT',
                    CodecSettings: {
                      Codec: 'AAC',
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: 'NORMAL',
                        Bitrate: 96000,
                        RateControlMode: 'CBR',
                        CodecProfile: 'LC',
                        CodingMode: 'CODING_MODE_2_0',
                        RawFormat: 'NONE',
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: 'MP4',
                  Mp4Settings: {
                    CslgAtom: 'INCLUDE',
                    FreeSpaceBox: 'EXCLUDE',
                    MoovPlacement: 'PROGRESSIVE_DOWNLOAD',
                  },
                },
              },
              // 480p
              {
                NameModifier: '_480p',
                VideoDescription: {
                  Width: 854,
                  Height: 480,
                  CodecSettings: {
                    Codec: 'H_264',
                    H264Settings: {
                      MaxBitrate: 1000000,
                      RateControlMode: 'QVBR',
                      QvbrSettings: {
                        QvbrQualityLevel: 6,
                      },
                    },
                  },
                },
                AudioDescriptions: [
                  {
                    AudioTypeControl: 'FOLLOW_INPUT',
                    CodecSettings: {
                      Codec: 'AAC',
                      AacSettings: {
                        AudioDescriptionBroadcasterMix: 'NORMAL',
                        Bitrate: 64000,
                        RateControlMode: 'CBR',
                        CodecProfile: 'LC',
                        CodingMode: 'CODING_MODE_2_0',
                        RawFormat: 'NONE',
                        SampleRate: 48000,
                      },
                    },
                  },
                ],
                ContainerSettings: {
                  Container: 'MP4',
                  Mp4Settings: {
                    CslgAtom: 'INCLUDE',
                    FreeSpaceBox: 'EXCLUDE',
                    MoovPlacement: 'PROGRESSIVE_DOWNLOAD',
                  },
                },
              },
            ],
            OutputGroupSettings: {
              Type: 'FILE_GROUP_SETTINGS',
              FileGroupSettings: {
                Destination: `s3://${this.processedBucket}/${outputPrefix}`,
              },
            },
          },
          // 썸네일 출력 그룹
          {
            Name: 'Thumbnail Group',
            Outputs: [
              {
                NameModifier: '_thumbnail',
                VideoDescription: {
                  Width: 640,
                  Height: 360,
                  CodecSettings: {
                    Codec: 'FRAME_CAPTURE',
                    FrameCaptureSettings: {
                      FramerateNumerator: 1,
                      FramerateDenominator: 10, // 10초마다 1프레임
                      MaxCaptures: 5, // 최대 5개 썸네일
                      Quality: 80,
                    },
                  },
                },
                ContainerSettings: {
                  Container: 'RAW',
                },
              },
            ],
            OutputGroupSettings: {
              Type: 'FILE_GROUP_SETTINGS',
              FileGroupSettings: {
                Destination: `s3://${this.processedBucket}/${outputPrefix}thumbnails/`,
              },
            },
          },
        ],
      },
      UserMetadata: {
        mediaId: mediaId,
      },
    };

    try {
      const command = new CreateJobCommand(jobInput);
      const result = await this.mediaConvertClient.send(command);
      
      this.logger.log(`MediaConvert job created: ${result.Job.Id} for media: ${mediaId}`);
      
      return result.Job.Id;
    } catch (error) {
      this.logger.error(`Failed to create MediaConvert job for media: ${mediaId}`, error.stack);
      throw new Error('Failed to create transcoding job');
    }
  }
}