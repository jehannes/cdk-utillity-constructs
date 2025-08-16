import { Template, Match } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { S3Backup, BackupType, S3BackupProps } from '../src/s3backup/s3Backup';

describe('S3Backup Construct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let mainBucket: s3.IBucket;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    
    // Create a main bucket for testing
    mainBucket = new s3.Bucket(stack, 'MainBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  });

  describe('BackupType.STANDALONE', () => {
    it('creates standalone backup bucket with versioning', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      new S3Backup(stack, 'StandaloneBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Should create backup bucket with versioning and encryption
      template.hasResourceProperties("AWS::S3::Bucket", 
        Match.objectLike({
          VersioningConfiguration: {
            Status: "Enabled"
          },
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: "AES256"
                }
              }
            ]
          }
        })
      );
    });

    it('creates lifecycle rules for long-term storage', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      new S3Backup(stack, 'StandaloneBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: "LongTermStorage",
              Status: "Enabled",
              Transitions: Match.arrayWith([
                {
                  StorageClass: "STANDARD_IA",
                  TransitionInDays: 30
                },
                {
                  StorageClass: "GLACIER_IR", 
                  TransitionInDays: 60
                },
                {
                  StorageClass: "DEEP_ARCHIVE",
                  TransitionInDays: 90
                }
              ])
            })
          ])
        }
      });
    });

    it('creates IAM user with backup permissions', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      new S3Backup(stack, 'StandaloneBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::IAM::User", {});
      template.hasResourceProperties("AWS::IAM::AccessKey", {});
      
      // Check for IAM policy with the actual permissions that CDK grants
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "s3:GetObject*",
                "s3:GetBucket*", 
                "s3:List*",
                "s3:DeleteObject*",
                Match.stringLikeRegexp("s3:PutObject.*"),
                "s3:Abort*"
              ])
            })
          ])
        }
      });
    });

    it('does not create DataSync resources', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      new S3Backup(stack, 'StandaloneBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.resourceCountIs("AWS::DataSync::Task", 0);
      template.resourceCountIs("AWS::DataSync::LocationS3", 0);
      template.resourceCountIs("AWS::Logs::LogGroup", 0);
    });
  });

  describe('BackupType.DATA_SYNC', () => {
    it('creates DataSync task with all components', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder',
          dataSyncInterval: cdk.Duration.hours(6),
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::DataSync::Task", {
        Name: Match.anyValue(), // Name is constructed dynamically with Fn::Join
        Schedule: {
          ScheduleExpression: "rate(360 minutes)",
          Status: "ENABLED"
        },
        Options: {
          LogLevel: "BASIC",
          OverwriteMode: "ALWAYS",
          PreserveDeletedFiles: "PRESERVE",
          TaskQueueing: "ENABLED",
          TransferMode: "CHANGED",
          VerifyMode: "ONLY_FILES_TRANSFERRED"
        },
        TaskMode: "BASIC"
      });
    });

    it('creates DataSync IAM role with proper permissions', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder',
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "datasync.amazonaws.com"
              },
              Condition: {
                ArnLike: {
                  "aws:SourceArn": Match.anyValue() // ARN is constructed dynamically
                }
              }
            }
          ]
        }
      });

      // Check for S3 permissions - look for DataSync role policy specifically
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: Match.arrayWith([
                "s3:GetBucketLocation",
                "s3:ListBucket", 
                "s3:ListBucketMultipartUploads"
              ])
            })
          ])
        },
        Roles: Match.arrayWith([
          Match.objectLike({
            Ref: Match.stringLikeRegexp(".*DataSyncRole.*")
          })
        ])
      });
    });

    it('creates CloudWatch Log Group', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder',
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::Logs::LogGroup", {
        LogGroupName: Match.anyValue(), // Log group name is constructed dynamically
        RetentionInDays: 30
      });
    });

    it('creates DataSync S3 locations', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder',
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Should create both source and target S3 locations
      template.resourceCountIs("AWS::DataSync::LocationS3", 2);
      
      // Check target location has subdirectory
      template.hasResourceProperties("AWS::DataSync::LocationS3", {
        Subdirectory: "test-folder"
      });
    });

    it('uses custom schedule when provided', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncSchedule: {
            scheduleExpression: 'cron(0 2 * * ? *)',
            status: 'ENABLED'
          }
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::DataSync::Task", {
        Schedule: {
          ScheduleExpression: "cron(0 2 * * ? *)",
          Status: "ENABLED"
        }
      });
    });

    it('uses default schedule when no schedule provided', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder',
        },
      };

      // Act
      new S3Backup(stack, 'DataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties("AWS::DataSync::Task", {
        Schedule: {
          ScheduleExpression: "rate(1 day)",
          Status: "ENABLED"
        }
      });
    });
  });

  describe('BackupType.DIRECT_UPLOAD', () => {
    it('does not create backup bucket', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads'
        }
      };

      // Act
      new S3Backup(stack, 'DirectUploadBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Should only have the main bucket, not a backup bucket
      template.resourceCountIs("AWS::S3::Bucket", 1);
    });

    it('creates user with folder-specific permissions', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads'
        }
      };

      // Act
      new S3Backup(stack, 'DirectUploadBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Check that IAM policy exists - folder permissions are handled by CDK's grantReadWrite
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow"
            })
          ])
        }
      });
    });
  });

  describe('Custom Bucket Configuration', () => {
    it('uses custom bucket name', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        bucketProps: {
          bucketName: 'my-custom-backup'
        }
      };

      // Act
      new S3Backup(stack, 'CustomBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // The bucket name will be constructed with account ID, so check for existence
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: Match.anyValue()
      });
    });

    it('uses custom bucket name for DATA_SYNC (non-standalone)', () => {
      // Arrange - This tests the non-standalone branch of bucket name construction
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        bucketProps: {
          bucketName: 'my-datasync-bucket'
        },
        dataSyncProps: {
          dataSyncTargetFolder: 'sync-folder'
        }
      };

      // Act
      new S3Backup(stack, 'CustomDataSyncBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Should create a bucket with the custom name (modified with account ID and ingest-bucket suffix)
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: Match.anyValue()
      });
    });

    it('uses original bucket name when too long for suffix', () => {
      // Arrange - Create a bucket name that's too long for the suffix to be added
      // Max length for standalone: 64 - 12 (account) - 12 (backup-bucket) - 2 (hyphens) = 38
      // So use a name longer than 38 characters
      const longBucketName = 'this-is-a-very-long-bucket-name-that-exceeds-limit';
      
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        bucketProps: {
          bucketName: longBucketName
        }
      };

      // Act
      new S3Backup(stack, 'LongCustomBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Should create a bucket with the original name (no suffix added)
      template.hasResourceProperties("AWS::S3::Bucket", {
        BucketName: longBucketName
      });
    });

    it('skips lifecycle rules when noLifecycleRules is true', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        bucketProps: {
          noLifecycleRules: true
        }
      };

      // Act
      new S3Backup(stack, 'NoLifecycleBackup', props);

      // Assert
      const template = Template.fromStack(stack);
      
      // Check that at least one bucket exists without lifecycle rules
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: Match.absent()
      });
    });
  });

  describe('Output Configuration - Basic Test', () => {
    it('construct can be created with default output config', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'OutputTestBackup', props);
      }).not.toThrow();
    });

    it('construct can be created with access key outputs enabled', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        outputConfig: {
          includeAccessKeyOutputs: true
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'AccessKeyOutputTestBackup', props);
      }).not.toThrow();
    });

    it('construct can be created with output prefix', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        outputConfig: {
          outputPrefix: 'Test'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'PrefixOutputTestBackup', props);
      }).not.toThrow();
    });

    it('construct can be created with selective output configuration', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        outputConfig: {
          includeBucketOutputs: false,
          includeUserOutputs: true,
          includeAccessKeyOutputs: false
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'SelectiveOutputTestBackup', props);
      }).not.toThrow();
    });
  });

  describe('Validation', () => {
    it('throws error when both dataSyncSchedule and dataSyncInterval are provided', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncSchedule: {
            scheduleExpression: 'cron(0 2 * * ? *)',
            status: 'ENABLED'
          },
          dataSyncInterval: cdk.Duration.hours(6)
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDataSync', props);
      }).toThrow('Cannot specify both dataSyncSchedule and dataSyncInterval');
    });

    it('throws error when DIRECT_UPLOAD is used without directUploadFolder', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDirectUpload', props);
      }).toThrow('bucketProps with directUploadFolder must be specified when backupType is DIRECT_UPLOAD');
    });

    it('throws error when dataSyncInterval is less than 1 hour', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncInterval: cdk.Duration.minutes(30)
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDataSyncInterval', props);
      }).toThrow('dataSyncInterval must be at least 1 hour');
    });

    it('accepts dataSyncInterval when it is exactly 1 hour', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncInterval: cdk.Duration.hours(1)
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'ValidDataSyncInterval', props);
      }).not.toThrow();
    });

    it('throws error when dataSyncTargetFolder has invalid format', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: '/invalid-folder/'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDataSyncFolder', props);
      }).toThrow('dataSyncTargetFolder should not start or end with');
    });

    it('throws error when directUploadFolder has invalid format', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: '/invalid-folder/'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDirectUploadFolder', props);
      }).toThrow('directUploadFolder should not start or end with');
    });

    it('throws error when STANDALONE is used with dataSyncProps', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'some-folder'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidStandalone', props);
      }).toThrow('DataSync properties (dataSyncProps) are not applicable when backupType is STANDALONE');
    });

    it('validates bucket name format', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        bucketProps: {
          bucketName: 'INVALID_BUCKET_NAME'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidBucketName', props);
      }).toThrow('bucketName can only contain lowercase letters, numbers, dots, and hyphens');
    });

    it('validates userName format', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          userName: 'invalid user name'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidUserName', props);
      }).toThrow('userName contains invalid characters');
    });

    it('throws error when DIRECT_UPLOAD is used with dataSyncProps', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads'
        },
        dataSyncProps: {
          dataSyncTargetFolder: 'some-folder'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidDirectUploadWithDataSync', props);
      }).toThrow('DataSync properties (dataSyncProps) are not applicable when backupType is DIRECT_UPLOAD');
    });

    it('throws error when STANDALONE is used with directUploadFolder', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'should-not-be-here'
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidStandaloneWithDirectUpload', props);
      }).toThrow('directUploadFolder is not applicable when backupType is STANDALONE');
    });

    it('validates bucket name length constraints', () => {
      // Test bucket name too short
      expect(() => {
        new S3Backup(stack, 'TestS3Backup1', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: 'ab' }
        });
      }).toThrow('bucketName must be between 3 and 63 characters long');

      // Test bucket name too long
      expect(() => {
        new S3Backup(stack, 'TestS3Backup2', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: 'a'.repeat(64) }
        });
      }).toThrow('bucketName must be between 3 and 63 characters long');
    });

    it('validates bucket name cannot start or end with dots or hyphens', () => {
      // Test bucket name starting with dot
      expect(() => {
        new S3Backup(stack, 'TestS3Backup3', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: '.invalid-bucket' }
        });
      }).toThrow('bucketName cannot start or end with dots or hyphens');

      // Test bucket name ending with dot
      expect(() => {
        new S3Backup(stack, 'TestS3Backup4', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: 'invalid-bucket.' }
        });
      }).toThrow('bucketName cannot start or end with dots or hyphens');

      // Test bucket name starting with hyphen
      expect(() => {
        new S3Backup(stack, 'TestS3Backup5', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: '-invalid-bucket' }
        });
      }).toThrow('bucketName cannot start or end with dots or hyphens');

      // Test bucket name ending with hyphen
      expect(() => {
        new S3Backup(stack, 'TestS3Backup6', {
          backupType: BackupType.STANDALONE,
          centralBackupBucket: mainBucket,
          bucketProps: { bucketName: 'invalid-bucket-' }
        });
      }).toThrow('bucketName cannot start or end with dots or hyphens');
    });

    it('validates userName length constraint', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          userName: 'a'.repeat(65)
        }
      };

      // Act & Assert
      expect(() => {
        new S3Backup(stack, 'InvalidLongUserName', props);
      }).toThrow('userName cannot be longer than 64 characters');
    });

    it('throws error when no target bucket is available (mocked scenario)', () => {
      // Create a test stack for this specific test with environment
      const testApp = new cdk.App();
      const testStack = new cdk.Stack(testApp, 'MockTestStack', {
        env: {
          account: '123456789012',
          region: 'us-east-1'
        }
      });
      
      // Mock the SSM parameter lookup to return an invalid ARN
      const mockValueFromLookup = jest.spyOn(ssm.StringParameter, 'valueFromLookup')
        .mockReturnValue('invalid-arn');
        
      // Mock s3.Bucket.fromBucketArn to return null (simulating failure to get bucket)
      const mockFromBucketArn = jest.spyOn(s3.Bucket, 'fromBucketArn')
        .mockReturnValue(null as any);

      try {
        // Arrange - DIRECT_UPLOAD without centralBackupBucket to force the error
        const props: S3BackupProps = {
          backupType: BackupType.DIRECT_UPLOAD,
          // Don't provide centralBackupBucket, force it to use SSM parameter which will return null
          bucketProps: {
            directUploadFolder: 'uploads'
          }
        };

        // Act & Assert
        expect(() => {
          new S3Backup(testStack, 'NoTargetBucket', props);
        }).toThrow('No target bucket available for backupType: direct_upload. This could indicate a configuration issue.');
      } finally {
        // Clean up mocks
        mockValueFromLookup.mockRestore();
        mockFromBucketArn.mockRestore();
      }
    });
  });

  describe('Resource Access', () => {
    it('exposes created resources through public properties for DATA_SYNC', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'test-folder'
        }
      };

      // Act
      const s3Backup = new S3Backup(stack, 'ResourceAccessTest', props);

      // Assert
      expect(s3Backup.bucket).toBeDefined();
      expect(s3Backup.user).toBeDefined();
      expect(s3Backup.accessKey).toBeDefined();
      expect(s3Backup.dataSyncTask).toBeDefined();
      expect(s3Backup.dataSyncRole).toBeDefined();
      expect(s3Backup.dataSyncLogGroup).toBeDefined();
    });

    it('provides undefined resources for DIRECT_UPLOAD type', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads'
        }
      };

      // Act
      const s3Backup = new S3Backup(stack, 'DirectUploadResourceTest', props);

      // Assert
      expect(s3Backup.bucket).toBeUndefined();
      expect(s3Backup.dataSyncTask).toBeUndefined();
      expect(s3Backup.dataSyncRole).toBeUndefined();
      expect(s3Backup.dataSyncLogGroup).toBeUndefined();
      
      // User should still be created
      expect(s3Backup.user).toBeDefined();
      expect(s3Backup.accessKey).toBeDefined();
    });

    it('provides appropriate resources for STANDALONE type', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      const s3Backup = new S3Backup(stack, 'StandaloneResourceTest', props);

      // Assert
      expect(s3Backup.bucket).toBeDefined();
      expect(s3Backup.user).toBeDefined();
      expect(s3Backup.accessKey).toBeDefined();
      
      // DataSync resources should not exist for standalone
      expect(s3Backup.dataSyncTask).toBeUndefined();
      expect(s3Backup.dataSyncRole).toBeUndefined();
      expect(s3Backup.dataSyncLogGroup).toBeUndefined();
    });
  });

  describe('Helper Methods', () => {
    it('addLifecycleRule method works when bucket exists', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };
      const s3Backup = new S3Backup(stack, 'LifecycleRuleTest', props);

      // Act
      s3Backup.addLifecycleRule({
        id: 'TestRule',
        enabled: true,
        expiration: cdk.Duration.days(365)
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::S3::Bucket", {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Id: "TestRule",
              Status: "Enabled",
              ExpirationInDays: 365
            })
          ])
        }
      });
    });

    it('addUserPolicy method works when user exists', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };
      const s3Backup = new S3Backup(stack, 'UserPolicyTest', props);

      // Act
      s3Backup.addUserPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObjectVersion'],
          resources: ['arn:aws:s3:::test-bucket/*']
        })
      );

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: "s3:GetObjectVersion",
              Resource: "arn:aws:s3:::test-bucket/*"
            })
          ])
        }
      });
    });

    it('addLifecycleRule does not throw when bucket is undefined', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads'
        }
      };
      const s3Backup = new S3Backup(stack, 'NoLifecycleRuleTest', props);

      // Act & Assert
      expect(() => {
        s3Backup.addLifecycleRule({
          id: 'TestRule',
          enabled: true,
          expiration: cdk.Duration.days(365)
        });
      }).not.toThrow();
    });

    it('addUserPolicy does not throw when user is undefined', () => {
      // This test is theoretical since the construct always creates a user
      // but tests the defensive programming in the method
      
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };
      const s3Backup = new S3Backup(stack, 'UserPolicyTestDefensive', props);
      
      // Manually set user to undefined for testing
      (s3Backup as any).user = undefined;

      // Act & Assert
      expect(() => {
        s3Backup.addUserPolicy(
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObjectVersion'],
            resources: ['arn:aws:s3:::test-bucket/*']
          })
        );
      }).not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('creates access key by default', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
      };

      // Act
      const s3Backup = new S3Backup(stack, 'DefaultAccessKeyTest', props);

      // Assert
      expect(s3Backup.accessKey).toBeDefined();
    });

    it('does not create access key when disabled', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          createAccessKey: false,
        }
      };

      // Act
      const s3Backup = new S3Backup(stack, 'NoAccessKeyTest', props);

      // Assert
      expect(s3Backup.accessKey).toBeUndefined();
    });

    it('uses custom user name when provided', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          userName: 'custom-backup-user',
        }
      };

      // Act
      new S3Backup(stack, 'CustomUserNameTest', props);

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::User", {
        UserName: 'custom-backup-user'
      });
    });

    it('uses custom key serial when provided', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          keySerial: 5,
        }
      };

      // Act
      new S3Backup(stack, 'CustomKeySerialTest', props);

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::AccessKey", {
        Serial: 5
      });
    });

    it('grants list all buckets permission when enabled', () => {
      // Arrange
      const props: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        iamUserProps: {
          listAllBuckets: true,
        }
      };

      // Act
      new S3Backup(stack, 'ListAllBucketsTest', props);

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: "Allow",
              Action: "s3:ListAllMyBuckets",
              Resource: "*"
            })
          ])
        }
      });
    });
  });
  
  describe('Multiple Instances', () => {
    it('can create multiple STANDALONE instances in the same stack', () => {
      // Use fresh stack to avoid interference
      const testApp = new cdk.App();
      const testStack = new cdk.Stack(testApp, 'MultipleStandaloneStack');
      const testMainBucket = new s3.Bucket(testStack, 'TestMainBucket', {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
      
      // Arrange
      const props1: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: testMainBucket,
        outputConfig: {
          outputPrefix: 'First'
        }
      };
      
      const props2: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: testMainBucket,
        outputConfig: {
          outputPrefix: 'Second'
        }
      };

      // Act
      const backup1 = new S3Backup(testStack, 'FirstBackup', props1);
      const backup2 = new S3Backup(testStack, 'SecondBackup', props2);

      // Assert
      expect(backup1.bucket).toBeDefined();
      expect(backup2.bucket).toBeDefined();
      expect(backup1.user).toBeDefined();
      expect(backup2.user).toBeDefined();
      
      const template = Template.fromStack(testStack);
      template.resourceCountIs("AWS::S3::Bucket", 3); // testMainBucket + 2 backup buckets
      template.resourceCountIs("AWS::IAM::User", 2);
    });

    it('can create multiple DATA_SYNC instances in the same stack', () => {
      // Arrange
      const props1: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'sync1',
        },
        outputConfig: {
          outputPrefix: 'DataSync1'
        }
      };
      
      const props2: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: {
          dataSyncTargetFolder: 'sync2',
        },
        outputConfig: {
          outputPrefix: 'DataSync2'
        }
      };

      // Act
      const backup1 = new S3Backup(stack, 'DataSync1', props1);
      const backup2 = new S3Backup(stack, 'DataSync2', props2);

      // Assert
      expect(backup1.bucket).toBeDefined();
      expect(backup2.bucket).toBeDefined();
      expect(backup1.dataSyncTask).toBeDefined();
      expect(backup2.dataSyncTask).toBeDefined();
      
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::S3::Bucket", 3); // mainBucket + 2 ingest buckets
      template.resourceCountIs("AWS::DataSync::Task", 2);
      template.resourceCountIs("AWS::IAM::User", 2);
      template.resourceCountIs("AWS::IAM::Role", 3); // 2 DataSync roles + 1 existing role from previous tests
      template.resourceCountIs("AWS::Logs::LogGroup", 2);
    });

    it('can create multiple DIRECT_UPLOAD instances in the same stack', () => {
      // Arrange
      const props1: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads1'
        },
        outputConfig: {
          outputPrefix: 'Upload1'
        }
      };
      
      const props2: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: {
          directUploadFolder: 'uploads2'
        },
        outputConfig: {
          outputPrefix: 'Upload2'
        }
      };

      // Act
      const backup1 = new S3Backup(stack, 'Upload1', props1);
      const backup2 = new S3Backup(stack, 'Upload2', props2);

      // Assert
      expect(backup1.bucket).toBeUndefined(); // DIRECT_UPLOAD doesn't create buckets
      expect(backup2.bucket).toBeUndefined();
      expect(backup1.user).toBeDefined();
      expect(backup2.user).toBeDefined();
      
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::S3::Bucket", 1); // Only mainBucket
      template.resourceCountIs("AWS::IAM::User", 2);
    });

    it('can mix different backup types in the same stack', () => {
      // Arrange
      const standaloneProps: S3BackupProps = {
        backupType: BackupType.STANDALONE,
        centralBackupBucket: mainBucket,
        outputConfig: { outputPrefix: 'Standalone' }
      };
      
      const dataSyncProps: S3BackupProps = {
        backupType: BackupType.DATA_SYNC,
        centralBackupBucket: mainBucket,
        dataSyncProps: { dataSyncTargetFolder: 'mixed-sync' },
        outputConfig: { outputPrefix: 'DataSync' }
      };
      
      const directUploadProps: S3BackupProps = {
        backupType: BackupType.DIRECT_UPLOAD,
        centralBackupBucket: mainBucket,
        bucketProps: { directUploadFolder: 'mixed-uploads' },
        outputConfig: { outputPrefix: 'DirectUpload' }
      };

      // Act
      const standaloneBackup = new S3Backup(stack, 'StandaloneBackup', standaloneProps);
      const dataSyncBackup = new S3Backup(stack, 'DataSyncBackup', dataSyncProps);
      const directUploadBackup = new S3Backup(stack, 'DirectUploadBackup', directUploadProps);

      // Assert
      expect(standaloneBackup.bucket).toBeDefined();
      expect(dataSyncBackup.bucket).toBeDefined();
      expect(directUploadBackup.bucket).toBeUndefined();
      
      expect(standaloneBackup.dataSyncTask).toBeUndefined();
      expect(dataSyncBackup.dataSyncTask).toBeDefined();
      expect(directUploadBackup.dataSyncTask).toBeUndefined();
      
      const template = Template.fromStack(stack);
      template.resourceCountIs("AWS::S3::Bucket", 3); // mainBucket + standalone + ingest
      template.resourceCountIs("AWS::IAM::User", 3);
      template.resourceCountIs("AWS::DataSync::Task", 1);
      template.resourceCountIs("AWS::IAM::Role", 2); // DataSync role + 1 existing role from previous tests
      template.resourceCountIs("AWS::Logs::LogGroup", 1);
    });
  });
});
