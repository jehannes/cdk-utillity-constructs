import * as cdk from "aws-cdk-lib";
import {
  aws_iam as iam,
  aws_s3 as s3,
  aws_ssm as ssm,
  aws_datasync as datasync,
  aws_logs as logs,
  CfnOutput,
  StackProps,
  Duration
} from "aws-cdk-lib";
import { Construct } from "constructs";

/**
 * S3Backup Construct - An AWS CDK construct for creating flexible S3-based backup solutions.
 * 
 * This construct provides three distinct backup patterns:
 * - STANDALONE: Independent backup buckets with versioning and lifecycle management
 * - DATA_SYNC: Automated synchronization between buckets using AWS DataSync
 * - DIRECT_UPLOAD: Direct uploads to existing buckets with folder-based permissions
 * 
 * Features include automatic IAM user creation, lifecycle management, CloudWatch integration,
 * and support for multiple instances within the same stack.
 */

export enum BackupType {
  /**
   * Indicates that the bucket is used as a standalone backup bucket.
   */
  STANDALONE = "standalone",
  /**
   * Indicates that the bucket is used for data synchronization.
   */
  DATA_SYNC = "data_sync",
  /**
   * Indicates that the main backup bucket is used for direct uploads.
   * Requires backup folder to be set.
   */
  DIRECT_UPLOAD = "direct_upload",
}

export interface DataSyncProps {
  /**
   * Optional: Target folder for data synchronization.
   */
  dataSyncTargetFolder?: string;
  /**
   * Optional: Interval for data synchronization.
   */
  dataSyncInterval?: cdk.Duration;
  /*
   * Optional: Schedule for the DataSync task.
   * If provided, the DataSync task will be created with this schedule.
   * This is only applicable if the backupType is DATA_SYNC.
   */
  dataSyncSchedule?: datasync.CfnTask.TaskScheduleProperty;
}

export interface BucketProps {
  /**
   * Optional: Name of the S3 bucket for backups.
   * If not provided, a unique bucket name will be generated.
   */
  bucketName?: string; // maybe require this?
  /**
   * Optional: Whether the stack is a standalone backup bucket.
   * If true, the bucket will be created without any additional configurations.
   */
  directUploadFolder?: string;
  /**
   * Optional: Indicates if lifecycle rules should be applied to the bucket.
   * If true, lifecycle rules will be added to the bucket.
   * This is intended to make configuration easier by allowing users to opt-out of default lifecycle rules.
   *
   * @default false
   */
  noLifecycleRules?: boolean;
}

export interface OutputConfig {
  /**
   * Whether to create bucket-related outputs.
   * @default true
   */
  includeBucketOutputs?: boolean;
  /**
   * Whether to create DataSync-related outputs.
   * @default true
   */
  includeDataSyncOutputs?: boolean;
  /**
   * Whether to create IAM user outputs.
   * @default true
   */
  includeUserOutputs?: boolean;
  /**
   * Whether to create access key outputs (includes sensitive access keys).
   * Note: This is separate from includeUserOutputs for security reasons.
   * @default false
   */
  includeAccessKeyOutputs?: boolean;
  /**
   * Optional prefix for all output IDs to avoid conflicts.
   * @default ""
   */
  outputPrefix?: string;
}

export interface iamUserProps {
  /**
   * Optional: Name of the IAM user for accessing the backup bucket.
   * If not provided, a default user name will be used.
   */
  userName?: string;
  /**
   * Optional: Serial number for the access key.
   * Can be incremented to rotate the access key.
   * 
   * @default 0
   */
  keySerial?: number;
  /**
   * Optional: Whether to create an access key for the backup user.
   * If true, an access key will be created for the IAM user.
   * @default true
   */
  createAccessKey?: boolean;
  /**
   * Optional: Whether to grant permissions to list all buckets.
   * If true, the IAM user will be granted permissions to list all buckets.
   * 
   * @default false
   */
  listAllBuckets?: boolean;
}

export interface S3BackupProps extends StackProps {
  /**
   * The type of backup to create.
   */
  backupType: BackupType;
  /**
   * Optional: Properties for the IAM user.
   *
   * @default {}
   */
  iamUserProps?: iamUserProps;
  /**
   * Optional: Properties for data synchronization.
   * 
   */
  dataSyncProps?: DataSyncProps;
  /**
   * Optional: Properties for the created S3 bucket.
   */
  bucketProps?: BucketProps;
  /**
   * Optional: The central backup bucket to use.
   */
  centralBackupBucket?: s3.IBucket;
  /**
   * Optional: An SSM parameter with the ARN of the central backup bucket.
   */
  centralBackupParameter?: ssm.IParameter;
  /**
   * Optional: Configuration for CloudFormation outputs.
   * If not provided, all relevant outputs will be created except access keys.
   */
  outputConfig?: OutputConfig;
}

export class S3Backup extends Construct {
  public bucket?: s3.Bucket;
  public user?: iam.User;
  public accessKey?: iam.CfnAccessKey;
  public dataSyncTask?: datasync.CfnTask;
  public dataSyncRole?: iam.Role;
  public dataSyncLogGroup?: logs.LogGroup;
  
  constructor(scope: Construct, id: string, props: S3BackupProps) {
    super(scope, id);

    // === Validation Phase ===
    checkProps(props); // verifies
    
    // === Property Initialization ===
    props.iamUserProps = props.iamUserProps ?? {};
    props.iamUserProps.createAccessKey = props.iamUserProps.createAccessKey ?? true;

    // === Bucket Creation Phase ===
    // Create backup bucket for STANDALONE and DATA_SYNC types
    this.bucket =
      props.backupType !== BackupType.DIRECT_UPLOAD
        ? createBackupBucket(
            this,
            props.backupType === BackupType.STANDALONE,
            props.bucketProps,
            id
          )
        : undefined;

    // === Central Bucket Resolution ===
    // For DATA_SYNC and DIRECT_UPLOAD, resolve the target central bucket
    const mainBackupBucket = props.backupType !== BackupType.STANDALONE
      ? props.centralBackupBucket ||
       s3.Bucket.fromBucketArn(
          this,
          `MainBackupBucket-${id}`,
          ssm.StringParameter.valueFromLookup(this, props.centralBackupParameter?.parameterName || '/backup/mainBucket/arn')
        )
      : undefined;

    // === DataSync Setup Phase ===
    // Create DataSync resources for automated synchronization
    if (
      props.backupType === BackupType.DATA_SYNC &&
      this.bucket &&
      mainBackupBucket &&
      props.dataSyncProps
    ) {
      const dataSync = createDataSync(this, this.bucket, mainBackupBucket, props.dataSyncProps, id);
      this.dataSyncTask = dataSync.dataSyncTask;
      this.dataSyncRole = dataSync.dataSyncRole;
      this.dataSyncLogGroup = dataSync.logGroup;
    }

    // === IAM User Creation Phase ===
    // Create backup user with appropriate permissions for the target bucket
    const targetBucket = this.bucket || mainBackupBucket;
    if (!targetBucket) {
      throw new Error(`No target bucket available for backupType: ${props.backupType}. This could indicate a configuration issue.`);
    }

    // Determine folder access strategy based on backup type
    const folderAccess = props.backupType === BackupType.DIRECT_UPLOAD 
      ? props.bucketProps?.directUploadFolder 
      : undefined;

    const userResult = createBackupUser(
      this,
      targetBucket,
      folderAccess,
      props?.iamUserProps,
      id
    );
    this.user = userResult.user;
    this.accessKey = userResult.accessKey;

    // === Output Generation Phase ===
    // Create CloudFormation outputs in a centralized manner
    createOutputs(this, {
      bucket: this.bucket,
      user: this.user,
      accessKey: this.accessKey,
      dataSyncTask: this.dataSyncTask,
      dataSyncRole: this.dataSyncRole,
      dataSyncLogGroup: this.dataSyncLogGroup,
    }, props.outputConfig);
  }

  public addLifecycleRule(rule: s3.LifecycleRule): void {
  if (this.bucket) {
    this.bucket.addLifecycleRule(rule);
    }
  }

  public addUserPolicy(statement: iam.PolicyStatement): void {
    if (this.user) {
      this.user.addToPolicy(statement);
    }
  }
}

interface OutputResources {
  bucket?: s3.Bucket;
  user?: iam.User;
  accessKey?: iam.CfnAccessKey;
  dataSyncTask?: datasync.CfnTask;
  dataSyncRole?: iam.Role;
  dataSyncLogGroup?: logs.LogGroup;
}

/**
 * Creates CloudFormation outputs for the backup construct resources.
 * 
 * @param construct - The parent construct where outputs will be created
 * @param resources - Collection of created AWS resources to output
 * @param config - Optional configuration controlling which outputs to create
 */
function createOutputs(
  construct: Construct, 
  resources: OutputResources, 
  config?: OutputConfig
): void {
  const outputConfig = {
    includeBucketOutputs: config?.includeBucketOutputs ?? true,
    includeDataSyncOutputs: config?.includeDataSyncOutputs ?? true,
    includeUserOutputs: config?.includeUserOutputs ?? true,
    includeAccessKeyOutputs: config?.includeAccessKeyOutputs ?? false, // Default to false for security
    outputPrefix: config?.outputPrefix ?? "",
  };

  const getOutputId = (baseName: string) => 
    outputConfig.outputPrefix ? `${outputConfig.outputPrefix}${baseName}` : baseName;

  // Bucket outputs
  if (outputConfig.includeBucketOutputs && resources.bucket) {
    new CfnOutput(construct, getOutputId("BucketName"), {
      value: resources.bucket.bucketName,
      description: "The name of the S3 backup bucket",
    });

    new CfnOutput(construct, getOutputId("BucketArn"), {
      value: resources.bucket.bucketArn,
      description: "The ARN of the S3 backup bucket",
    });
  }

  // DataSync outputs
  if (outputConfig.includeDataSyncOutputs && resources.dataSyncTask) {
    new CfnOutput(construct, getOutputId("DataSyncTaskArn"), {
      value: resources.dataSyncTask.attrTaskArn,
      description: "The ARN of the DataSync task for backup synchronization",
    });
  }

  if (outputConfig.includeDataSyncOutputs && resources.dataSyncLogGroup) {
    new CfnOutput(construct, getOutputId("DataSyncLogGroupArn"), {
      value: resources.dataSyncLogGroup.logGroupArn,
      description: "The ARN of the CloudWatch Log Group for DataSync task logs",
    });
  }

  // User outputs
  if (outputConfig.includeUserOutputs && resources.user) {
    new CfnOutput(construct, getOutputId("BackupUserName"), {
      value: resources.user.userName,
      description: "The name of the IAM user for S3 backup access",
    });

    new CfnOutput(construct, getOutputId("BackupUserArn"), {
      value: resources.user.userArn,
      description: "The ARN of the IAM user for S3 backup access",
    });
  }

  // Access key outputs (separate control for security)
  if (outputConfig.includeAccessKeyOutputs && resources.accessKey) {
    new CfnOutput(construct, getOutputId("AccessKeyId"), {
      value: resources.accessKey.ref,
      description: "The Access Key ID for the backup S3 bucket user",
    });

    new CfnOutput(construct, getOutputId("AccessKey"), {
      value: resources.accessKey.attrSecretAccessKey,
      description: "The Access Key for the backup S3 bucket user",
    });
  }
}

/**
 * Validates the construct properties based on the selected backup type.
 * Ensures that incompatible options are not combined and required properties are present.
 * 
 * @param props - The S3Backup construct properties to validate
 * @throws Error if validation fails with descriptive message
 */
function checkProps(props: S3BackupProps) {
  // Validate DATA_SYNC specific requirements
  if (props.backupType === BackupType.DATA_SYNC) {
    if (props.dataSyncProps?.dataSyncSchedule && props.dataSyncProps?.dataSyncInterval) {
      throw new Error(
        "Cannot specify both dataSyncSchedule and dataSyncInterval. Use dataSyncSchedule for more control or dataSyncInterval for simple rate-based scheduling."
      );
    }

    if (
      props.dataSyncProps?.dataSyncTargetFolder &&
      (props.dataSyncProps.dataSyncTargetFolder.startsWith("/") ||
        props.dataSyncProps.dataSyncTargetFolder.endsWith("/"))
    ) {
      throw new Error("dataSyncTargetFolder should not start or end with '/'.");
    }

    if (props.dataSyncProps?.dataSyncInterval) {
      if (props.dataSyncProps.dataSyncInterval.toMinutes() < 60) {
        throw new Error("dataSyncInterval must be at least 1 hour.");
      }
    }
  }

  // Validate DIRECT_UPLOAD specific requirements
  if (props.backupType === BackupType.DIRECT_UPLOAD) {
    if (!props.bucketProps || !props.bucketProps.directUploadFolder) {
      throw new Error("bucketProps with directUploadFolder must be specified when backupType is DIRECT_UPLOAD.");
    }

    if (
      props.bucketProps.directUploadFolder.startsWith("/") ||
      props.bucketProps.directUploadFolder.endsWith("/")
    ) {
      throw new Error("directUploadFolder should not start or end with '/'.");
    }

    if (props.dataSyncProps) {
      throw new Error(
        "DataSync properties (dataSyncProps) are not applicable when backupType is DIRECT_UPLOAD."
      );
    }
  }

  // Validate STANDALONE specific requirements
  if (props.backupType === BackupType.STANDALONE) {
    if (props.dataSyncProps) {
      throw new Error(
        "DataSync properties (dataSyncProps) are not applicable when backupType is STANDALONE."
      );
    }

    if (props.bucketProps?.directUploadFolder) {
      throw new Error("directUploadFolder is not applicable when backupType is STANDALONE.");
    }
  }

  // Validate bucket name format (basic S3 naming rules)
  if (props.bucketProps?.bucketName) {
    if (props.bucketProps.bucketName.length < 3 || props.bucketProps.bucketName.length > 63) {
      throw new Error("bucketName must be between 3 and 63 characters long.");
    }

    if (!/^[a-z0-9.-]+$/.test(props.bucketProps.bucketName)) {
      throw new Error("bucketName can only contain lowercase letters, numbers, dots, and hyphens.");
    }

    if (
      props.bucketProps.bucketName.startsWith(".") ||
      props.bucketProps.bucketName.endsWith(".") ||
      props.bucketProps.bucketName.startsWith("-") ||
      props.bucketProps.bucketName.endsWith("-")
    ) {
      throw new Error("bucketName cannot start or end with dots or hyphens.");
    }
  }

  // Validate userName format
  if (props.iamUserProps && props.iamUserProps.userName) {
    if (props.iamUserProps.userName.length > 64) {
      throw new Error("userName cannot be longer than 64 characters.");
    }

    if (!/^[a-zA-Z0-9+=,.@_-]+$/.test(props.iamUserProps.userName)) {
      throw new Error(
        "userName contains invalid characters. Only alphanumeric characters and +=,.@_- are allowed."
      );
    }
  }
}

/**
 * Creates and configures an S3 backup bucket with appropriate settings for the backup type.
 * Handles bucket naming, lifecycle rules, and security configurations.
 * 
 * @param construct - The parent construct
 * @param standalone - Whether this is a standalone backup bucket (affects lifecycle and policies)
 * @param props - Optional bucket configuration properties
 * @param uniqueId - Unique identifier for multiple instances support
 * @returns Configured S3 bucket with encryption and lifecycle rules
 */
function createBackupBucket(
  construct: Construct,
  standalone: boolean,
  props?: BucketProps,
  uniqueId?: string
): s3.Bucket {

  // === Bucket Naming Strategy ===
  // Append account ID and type suffix if within S3's 63-character limit
  // This ensures uniqueness while maintaining readable names
  //TO CONSIDER: transfer bucket naming logic to a separate function
  let bucketName = props?.bucketName;
  if (
    bucketName && //if bucketName is provided
    bucketName.length <= // check that added postfix does not exceed 64 characters
    (64 - cdk.Aws.ACCOUNT_ID.length - (standalone ? 12 : 13) - 2) //determine max postfix length (accountId + 2 * '-' + postfix)
  ) {
    bucketName = `${bucketName}-${cdk.Aws.ACCOUNT_ID}-${standalone ? `backup-bucket` : `ingest-bucket`}`;
  }

  // Create an S3 bucket for backups
  const bucket = new s3.Bucket(construct, `${standalone ? "BackupBucket" : "IngestBucket"}${uniqueId ? `-${uniqueId}` : ''}`, {
    bucketName: bucketName,
    removalPolicy: standalone ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: !standalone,
    versioned: standalone, // Enable versioning for standalone backups
    encryption: s3.BucketEncryption.S3_MANAGED,
  });

  if (!props?.noLifecycleRules) {
    addLifecycleRules(bucket, standalone);
  }

  return bucket;
}

/**
 * Adds cost-optimized lifecycle rules to an S3 bucket based on backup type.
 * Standalone buckets get long-term archival rules, while ingest buckets get auto-deletion.
 * 
 * @param bucket - The S3 bucket to configure
 * @param standalone - Whether this is a standalone backup bucket
 */
function addLifecycleRules(bucket: s3.Bucket, standalone: boolean) {
  if (standalone) {
    // Add lifecycle rules for long-term storage
    bucket.addLifecycleRule(
    {
      id: "LongTermStorage",
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30), // Move to Infrequent Access after 30 days
        },
        {
          storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
          transitionAfter: Duration.days(60), // Move to Glacier_IR after 2 months
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: Duration.days(90), // Move to Glacier Deep Archive after 3 months
        },
      ],
    });

    bucket.addLifecycleRule({
      id: "AccidentalDeletePrevention",
      enabled: true,
      noncurrentVersionExpiration: Duration.days(365),
      noncurrentVersionTransitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30), // Move to Infrequent Access after 30 days
          noncurrentVersionsToRetain: 1,
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: Duration.days(60), // Move to Deep Archive after 2 months
          noncurrentVersionsToRetain: 1,
        },
      ],
    });
  } else {
    bucket.addLifecycleRule({
      id: "Autodelete",
      enabled: true,
      expiration: Duration.days(30), // Delete objects after 30 days
    });
  }
}

/**
 * Creates a comprehensive AWS DataSync setup for automated S3-to-S3 synchronization.
 * Includes IAM role, CloudWatch logging, source/target locations, and scheduled task.
 * 
 * @param construct - The parent construct
 * @param originBucket - Source S3 bucket for data synchronization
 * @param targetBucket - Destination S3 bucket (central backup)
 * @param props - DataSync configuration properties
 * @param uniqueId - Unique identifier for multiple instances support
 * @returns Object containing DataSync task, IAM role, and log group
 */
//TO CONSIDER:could be refactored into multiple smaller functions to reduce complexity
function createDataSync(
  construct: Construct,
  originBucket: s3.Bucket,
  targetBucket: s3.IBucket,
  props: DataSyncProps,
  uniqueId?: string
): {
  dataSyncTask: datasync.CfnTask;
  dataSyncRole: iam.Role;
  logGroup: logs.LogGroup;
} {
  const targetFolder = props.dataSyncTargetFolder || originBucket.bucketName;

  // Create CloudWatch Log Group for DataSync task logging
  const logGroup = new logs.LogGroup(construct, `DataSyncLogGroup${uniqueId ? `-${uniqueId}` : ''}`, {
    logGroupName: `/aws/datasync/task/${originBucket.bucketName}-to-${targetBucket.bucketName}${uniqueId ? `-${uniqueId}` : ''}`,
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  const dataSyncRole = new iam.Role(construct, `DataSyncRole${uniqueId ? `-${uniqueId}` : ''}`, {
    assumedBy: new iam.ServicePrincipal("datasync.amazonaws.com", {
      conditions: {
        ArnLike: {
          "aws:SourceArn": `arn:aws:datasync:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:task/*`,
        },
      },
    }),
  });

  // === DataSync IAM Permission Strategy ===
  // DataSync requires specific S3 permissions for automated data transfer:
  // - Bucket-level: GetBucketLocation, ListBucket, ListBucketMultipartUploads
  // - Object-level: Full CRUD operations for reading source and writing to destination
  dataSyncRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:GetBucketLocation", 
        "s3:ListBucket", 
        "s3:ListBucketMultipartUploads"
      ],
      resources: [originBucket.bucketArn, targetBucket.bucketArn],
    })
  );

  dataSyncRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "s3:AbortMultipartUpload",
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:GetObjectTagging",
        "s3:GetObjectVersion",
        "s3:ListMultipartUploadParts",
        "s3:PutObject",
        "s3:PutObjectTagging",
      ],
      resources: [`${originBucket.bucketArn}/*`, `${targetBucket.bucketArn}/*`],
    })
  );

  // Add CloudWatch Logs permissions for DataSync reporting
  dataSyncRole.addToPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`],
    })
  );

  // Create source S3 location for DataSync
  const sourceS3Location = new datasync.CfnLocationS3(construct, `SourceS3Location${uniqueId ? `-${uniqueId}` : ''}`, {
    s3BucketArn: originBucket.bucketArn,
    s3Config: {
      bucketAccessRoleArn: dataSyncRole.roleArn,
    },
  });

  // Create the target S3 location for DataSync, to be able to define the s3 subdirectory
  const targetS3location = new datasync.CfnLocationS3(construct, `TargetS3Location${uniqueId ? `-${uniqueId}` : ''}`, {
    s3BucketArn: targetBucket.bucketArn,
    subdirectory: targetFolder,
    s3Config: {
      bucketAccessRoleArn: dataSyncRole.roleArn,
    },
  });

  // Create schedule expression based on props
  let scheduleConfig: datasync.CfnTask.TaskScheduleProperty;
  if (props.dataSyncSchedule) {
    scheduleConfig = props.dataSyncSchedule;
  } else if (props.dataSyncInterval) {
    scheduleConfig = {
      scheduleExpression: `rate(${props.dataSyncInterval.toMinutes()} minutes)`,
      status: "ENABLED",
    };
  } else {
    scheduleConfig = {
      scheduleExpression: "rate(1 day)",
      status: "ENABLED",
    };
  }

  const dataSyncTask = new datasync.CfnTask(construct, `DataSyncTask${uniqueId ? `-${uniqueId}` : ''}`, {
    sourceLocationArn: sourceS3Location.attrLocationArn,
    destinationLocationArn: targetS3location.attrLocationArn,
    name: `transfer ${originBucket.bucketName} to ${targetBucket.bucketName}/${targetFolder}`,
    taskMode: "BASIC",
    schedule: scheduleConfig,
    cloudWatchLogGroupArn: logGroup.logGroupArn,
    options: {
      transferMode: "CHANGED",
      taskQueueing: "ENABLED",
      preserveDeletedFiles: "PRESERVE",
      overwriteMode: "ALWAYS",
      verifyMode: "ONLY_FILES_TRANSFERRED",
      logLevel: "BASIC",
    },
  });

  return {
    dataSyncTask,
    dataSyncRole,
    logGroup,
  };
}

/**
 * Creates an IAM user with appropriate S3 permissions for backup operations.
 * Supports both full bucket access and folder-specific permissions for DIRECT_UPLOAD.
 * 
 * @param construct - The parent construct
 * @param bucket - Target S3 bucket for user permissions
 * @param folderName - Optional folder name for restricted access (DIRECT_UPLOAD mode)
 * @param props - IAM user configuration properties
 * @param uniqueId - Unique identifier for multiple instances support
 * @returns Object containing IAM user and optional access key
 */
function createBackupUser(
  construct: Construct,
  bucket: s3.IBucket,
  folderName?: string, //for direct upload
  props?: iamUserProps,
  uniqueId?: string
): { user: iam.User; accessKey: iam.CfnAccessKey | undefined } {
  // Create an IAM user to access the backup bucket
  const user = new iam.User(construct, `BackupUser${uniqueId ? `-${uniqueId}` : ''}`, {
    userName: props?.userName || `backup-user-${bucket.bucketName}${uniqueId ? `-${uniqueId}` : ''}`,
  });

  const accessKey = props?.createAccessKey ? new iam.CfnAccessKey(construct, `BackupUserAccessKey${uniqueId ? `-${uniqueId}` : ''}`, {
    userName: user.userName,
    serial: props?.keySerial, // Serial number for the access key, can be used for rotation
  }) : undefined;

  // === Permission Strategy ===
  // Apply appropriate S3 permissions based on access pattern
  if (folderName) {
    // DIRECT_UPLOAD: Folder-specific permissions for security isolation
    bucket.grantReadWrite(user, `/${folderName}/*`);
    bucket.grantRead(user);
  } else {
    // STANDALONE/DATA_SYNC: Full bucket access for complete backup operations
    bucket.grantReadWrite(user);
  }

  // Optional: Grant global bucket listing permission for administrative tasks
  if (props?.listAllBuckets) {
    // Grant permission to list all buckets
    user.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:ListAllMyBuckets"],
        resources: ["*"],
      })
    );
  }

  return { user, accessKey };
}