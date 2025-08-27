# S3Backup Construct - Comprehensive Guide

A powerful and flexible AWS CDK construct for creating S3-based backup solutions with multiple deployment patterns, automated data synchronization, and comprehensive IAM management.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Backup Types](#backup-types)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Multiple Instances](#multiple-instances)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)
- [Contributing](#contributing)

## Overview

The S3Backup construct provides three distinct backup patterns:
- **STANDALONE**: Independent backup buckets with versioning and lifecycle management
- **DATA_SYNC**: Automated synchronization between buckets using AWS DataSync
- **DIRECT_UPLOAD**: Direct uploads to existing buckets with folder-based permissions

## Features

✅ **Multiple Backup Patterns**: Choose from standalone, data sync, or direct upload modes  
✅ **Automatic Lifecycle Management**: Built-in rules for cost-effective long-term storage  
✅ **IAM User Management**: Automated creation of users with appropriate permissions  
✅ **DataSync Integration**: Automated data synchronization with customizable schedules  
✅ **Multiple Instances Support**: Deploy multiple backup configurations in the same stack  
✅ **Comprehensive Validation**: Input validation and error handling  
✅ **Flexible Output Configuration**: Control CloudFormation outputs with security considerations  
✅ **CloudWatch Integration**: Logging and monitoring for DataSync operations  

## Installation

```bash
npm install aws-cdk-lib constructs
```

Import the construct in your CDK application:

```typescript
import { S3Backup, BackupType, S3BackupProps } from './lib/constructs/s3Backup';
```

## Quick Start

### Basic Standalone Backup

```typescript
import * as cdk from 'aws-cdk-lib';
import { S3Backup, BackupType } from './lib/constructs/s3Backup';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'BackupStack');

// Create a standalone backup bucket
const backup = new S3Backup(stack, 'MyBackup', {
  backupType: BackupType.STANDALONE
});

// Access created resources
console.log('Bucket ARN:', backup.bucket?.bucketArn);
console.log('User ARN:', backup.user?.userArn);
```

### Basic Data Sync Setup

```typescript
// Existing central bucket
const centralBucket = s3.Bucket.fromBucketName(stack, 'CentralBucket', 'my-central-backup-bucket');

// Create data sync backup
const syncBackup = new S3Backup(stack, 'SyncBackup', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: centralBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'my-backups',
    dataSyncInterval: cdk.Duration.hours(6)
  }
});
```

## Backup Types

### 1. STANDALONE

Creates an independent backup bucket with versioning, encryption, and lifecycle rules.

**Use Cases:**
- Critical data that needs long-term retention
- Independent backup systems
- Data that requires versioning

**Features:**
- S3 versioning enabled
- Automatic lifecycle transitions (IA → Glacier → Deep Archive)
- Retention policies for non-current versions
- S3-managed encryption

**Example:**
```typescript
const standaloneBackup = new S3Backup(stack, 'CriticalBackup', {
  backupType: BackupType.STANDALONE,
  bucketProps: {
    bucketName: 'my-critical-backups',
    noLifecycleRules: false // Enable lifecycle rules
  },
  iamUserProps: {
    userName: 'backup-user',
    listAllBuckets: true
  },
  outputConfig: {
    outputPrefix: 'Critical',
    includeAccessKeyOutputs: true
  }
});
```

### 2. DATA_SYNC

Creates an ingest bucket that automatically synchronizes data to a central backup bucket using AWS DataSync.

**Use Cases:**
- Centralized backup architecture
- Automated data replication
- Scheduled backup operations

**Features:**
- AWS DataSync task creation
- Customizable sync schedules
- CloudWatch logging
- IAM role management
- Source and destination S3 locations

**Example:**
```typescript
const dataSyncBackup = new S3Backup(stack, 'AutoSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: centralBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'automated-backups',
    dataSyncSchedule: {
      scheduleExpression: 'cron(0 2 * * ? *)', // Daily at 2 AM
      status: 'ENABLED'
    }
  },
  outputConfig: {
    outputPrefix: 'AutoSync'
  }
});
```

### 3. DIRECT_UPLOAD

Provides direct access to an existing central bucket with folder-specific permissions.

**Use Cases:**
- Direct uploads to existing infrastructure
- Folder-based access control
- Lightweight backup solutions

**Features:**
- No additional bucket creation
- Folder-specific IAM permissions
- Uses existing central bucket

**Example:**
```typescript
const directUpload = new S3Backup(stack, 'DirectUpload', {
  backupType: BackupType.DIRECT_UPLOAD,
  centralBackupBucket: centralBucket,
  bucketProps: {
    directUploadFolder: 'user-uploads'
  },
  iamUserProps: {
    userName: 'upload-user',
    createAccessKey: true
  }
});
```

## Configuration Options

### S3BackupProps Interface

```typescript
interface S3BackupProps extends StackProps {
  backupType: BackupType;
  iamUserProps?: iamUserProps;
  dataSyncProps?: DataSyncProps;
  bucketProps?: BucketProps;
  centralBackupBucket?: s3.IBucket;
  centralBackupParameter?: ssm.IParameter;
  outputConfig?: OutputConfig;
}
```

### IAM User Configuration

```typescript
interface iamUserProps {
  userName?: string;           // Custom user name
  keySerial?: number;          // Access key serial (for rotation)
  createAccessKey?: boolean;   // Whether to create access key (default: true)
  listAllBuckets?: boolean;    // Grant list all buckets permission
}
```

### DataSync Configuration

```typescript
interface DataSyncProps {
  dataSyncTargetFolder?: string;                           // Target folder name
  dataSyncInterval?: cdk.Duration;                        // Simple interval-based schedule
  dataSyncSchedule?: datasync.CfnTask.TaskScheduleProperty; // Advanced cron schedule
}
```

### Bucket Configuration

```typescript
interface BucketProps {
  bucketName?: string;          // Custom bucket name
  directUploadFolder?: string;  // Folder for DIRECT_UPLOAD type
  noLifecycleRules?: boolean;   // Skip lifecycle rules creation
}
```

### Output Configuration

```typescript
interface OutputConfig {
  includeBucketOutputs?: boolean;      // Include bucket-related outputs
  includeDataSyncOutputs?: boolean;    // Include DataSync-related outputs
  includeUserOutputs?: boolean;        // Include IAM user outputs
  includeAccessKeyOutputs?: boolean;   // Include access key outputs (security sensitive)
  outputPrefix?: string;               // Prefix for all output IDs
}
```

## Usage Examples

### Enterprise Backup Solution

```typescript
// Central backup bucket (created separately)
const centralBucket = new s3.Bucket(stack, 'CentralBackupBucket', {
  bucketName: 'company-central-backups',
  versioned: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  lifecycleRules: [{
    id: 'CentralLifecycle',
    enabled: true,
    transitions: [
      { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: cdk.Duration.days(30) },
      { storageClass: s3.StorageClass.GLACIER, transitionAfter: cdk.Duration.days(90) },
      { storageClass: s3.StorageClass.DEEP_ARCHIVE, transitionAfter: cdk.Duration.days(365) }
    ]
  }]
});

// Critical standalone backups
const databaseBackup = new S3Backup(stack, 'DatabaseBackup', {
  backupType: BackupType.STANDALONE,
  bucketProps: {
    bucketName: 'database-backups'
  },
  iamUserProps: {
    userName: 'db-backup-user',
    listAllBuckets: false
  },
  outputConfig: {
    outputPrefix: 'Database',
    includeAccessKeyOutputs: true
  }
});

// Automated log synchronization
const logSync = new S3Backup(stack, 'LogSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: centralBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'application-logs',
    dataSyncInterval: cdk.Duration.hours(4)
  },
  outputConfig: {
    outputPrefix: 'Logs'
  }
});

// User file uploads
const userUploads = new S3Backup(stack, 'UserUploads', {
  backupType: BackupType.DIRECT_UPLOAD,
  centralBackupBucket: centralBucket,
  bucketProps: {
    directUploadFolder: 'user-files'
  },
  iamUserProps: {
    userName: 'user-upload-service'
  },
  outputConfig: {
    outputPrefix: 'UserFiles'
  }
});
```

### Development Environment Setup

```typescript
// Development backup with relaxed settings
const devBackup = new S3Backup(stack, 'DevBackup', {
  backupType: BackupType.STANDALONE,
  bucketProps: {
    bucketName: 'dev-backups',
    noLifecycleRules: true // Skip lifecycle for development
  },
  iamUserProps: {
    userName: 'dev-backup-user',
    listAllBuckets: true // Allow listing for debugging
  },
  outputConfig: {
    outputPrefix: 'Dev',
    includeAccessKeyOutputs: true, // OK for dev environment
    includeBucketOutputs: true,
    includeUserOutputs: true
  }
});
```

### Home Assistant Backup

```typescript
// Home Assistant specific backup configuration
const haBackup = new S3Backup(stack, 'HomeAssistantBackup', {
  backupType: BackupType.STANDALONE,
  bucketProps: {
    bucketName: 'homeassistant-backups'
  },
  iamUserProps: {
    userName: 'homeassistant-backup',
    keySerial: 1
  },
  outputConfig: {
    outputPrefix: 'HomeAssistant',
    includeAccessKeyOutputs: false, // Security best practice
    includeBucketOutputs: true,
    includeUserOutputs: true
  }
});

// Add custom lifecycle rule for Home Assistant
haBackup.addLifecycleRule({
  id: 'HomeAssistantRetention',
  enabled: true,
  expiration: cdk.Duration.days(90), // Keep backups for 90 days
  transitions: [
    {
      storageClass: s3.StorageClass.INFREQUENT_ACCESS,
      transitionAfter: cdk.Duration.days(7)
    }
  ]
});

// Add custom IAM policy for additional permissions
haBackup.addUserPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetBucketLocation'],
  resources: ['*']
}));
```

## Multiple Instances

The construct supports multiple instances in the same stack with automatic resource ID disambiguation.

### Key Features
- **Unique Resource IDs**: All AWS resources get unique identifiers
- **Output Prefixing**: Avoid CloudFormation output conflicts
- **Isolated Resources**: Each instance operates independently

### Example: Multiple Backup Types

```typescript
// Multiple standalone backups
const backup1 = new S3Backup(stack, 'CriticalBackup', {
  backupType: BackupType.STANDALONE,
  outputConfig: { outputPrefix: 'Critical' }
});

const backup2 = new S3Backup(stack, 'RegularBackup', {
  backupType: BackupType.STANDALONE,
  outputConfig: { outputPrefix: 'Regular' }
});

// Multiple DataSync configurations
const docsSync = new S3Backup(stack, 'DocumentsSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: centralBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'documents',
    dataSyncInterval: cdk.Duration.hours(12)
  },
  outputConfig: { outputPrefix: 'Documents' }
});

const mediaSync = new S3Backup(stack, 'MediaSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: centralBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'media',
    dataSyncInterval: cdk.Duration.hours(6)
  },
  outputConfig: { outputPrefix: 'Media' }
});
```

For detailed information on multiple instances, see the [MULTIPLE_INSTANCES_GUIDE.md](./MULTIPLE_INSTANCES_GUIDE.md).

## Best Practices

### Security

1. **Access Key Management**
   ```typescript
   outputConfig: {
     includeAccessKeyOutputs: false // Don't expose in CloudFormation outputs
   }
   ```

2. **Least Privilege IAM**
   ```typescript
   iamUserProps: {
     listAllBuckets: false, // Only grant if necessary
     userName: 'specific-purpose-user'
   }
   ```

3. **Encryption**
   - All buckets use S3-managed encryption by default
   - Consider using KMS encryption for sensitive data

### Cost Optimization

1. **Lifecycle Rules**
   ```typescript
   bucketProps: {
     noLifecycleRules: false // Enable automatic transitions
   }
   ```

2. **DataSync Scheduling**
   ```typescript
   dataSyncProps: {
     dataSyncInterval: cdk.Duration.hours(24) // Reduce frequency for cost savings
   }
   ```

### Operational Excellence

1. **Descriptive Naming**
   ```typescript
   // Good
   new S3Backup(stack, 'DatabaseBackup', props);
   
   // Avoid
   new S3Backup(stack, 'Backup1', props);
   ```

2. **Output Organization**
   ```typescript
   outputConfig: {
     outputPrefix: 'Database', // Clear identification
     includeBucketOutputs: true,
     includeUserOutputs: true
   }
   ```

3. **Monitoring**
   - DataSync tasks automatically log to CloudWatch
   - Monitor backup completion and failures

### Performance

1. **DataSync Optimization**
   ```typescript
   dataSyncProps: {
     dataSyncSchedule: {
       scheduleExpression: 'cron(0 2 * * ? *)', // Off-peak hours
       status: 'ENABLED'
     }
   }
   ```

2. **Bucket Naming**
   - Use region-appropriate naming conventions
   - Avoid long bucket names that exceed limits

## Troubleshooting

### Common Issues

#### 1. Resource ID Conflicts
**Error**: `Resource with id 'BackupBucket' already exists`

**Solution**: Each S3Backup instance needs a unique construct ID:
```typescript
// Wrong
new S3Backup(stack, 'Backup', props1);
new S3Backup(stack, 'Backup', props2); // Conflict!

// Correct
new S3Backup(stack, 'HomeAssistantBackup', props1);
new S3Backup(stack, 'DatabaseBackup', props2);
```

#### 2. CloudFormation Output Conflicts
**Error**: `Output with id 'BucketName' already exists`

**Solution**: Use output prefixes:
```typescript
outputConfig: {
  outputPrefix: 'HomeAssistant' // Creates 'HomeAssistantBucketName'
}
```

#### 3. IAM User Name Conflicts
**Error**: `User already exists`

**Solution**: Use unique user names or let the construct generate them:
```typescript
iamUserProps: {
  userName: 'unique-backup-user-name'
}
// Or omit userName for auto-generation
```

#### 4. DataSync Validation Errors
**Error**: `dataSyncTargetFolder should not start or end with '/'`

**Solution**: Use folder names without leading/trailing slashes:
```typescript
dataSyncProps: {
  dataSyncTargetFolder: 'my-folder' // Not '/my-folder/' or 'my-folder/'
}
```

#### 5. Bucket Name Validation
**Error**: `bucketName can only contain lowercase letters, numbers, dots, and hyphens`

**Solution**: Follow S3 naming conventions:
```typescript
bucketProps: {
  bucketName: 'my-backup-bucket' // Not 'My_Backup_Bucket'
}
```

### Debug Tips

1. **Enable CloudWatch Logs** for DataSync tasks
2. **Check IAM permissions** using AWS CLI or console
3. **Validate bucket policies** and access controls
4. **Monitor CloudFormation events** during deployment

### Getting Help

1. Check the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/)
2. Review [AWS S3 best practices](https://docs.aws.amazon.com/s3/latest/userguide/best-practices.html)
3. Consult [AWS DataSync documentation](https://docs.aws.amazon.com/datasync/)

## API Reference

### Classes

#### S3Backup
Main construct class for creating backup solutions.

**Constructor**
```typescript
new S3Backup(scope: Construct, id: string, props: S3BackupProps)
```

**Properties**
- `bucket?: s3.Bucket` - The created backup bucket (undefined for DIRECT_UPLOAD)
- `user?: iam.User` - The created IAM user
- `accessKey?: iam.CfnAccessKey` - The created access key (if enabled)
- `dataSyncTask?: datasync.CfnTask` - The DataSync task (DATA_SYNC only)
- `dataSyncRole?: iam.Role` - The DataSync IAM role (DATA_SYNC only)
- `dataSyncLogGroup?: logs.LogGroup` - The CloudWatch log group (DATA_SYNC only)

**Methods**
- `addLifecycleRule(rule: s3.LifecycleRule): void` - Add custom lifecycle rule to bucket
- `addUserPolicy(statement: iam.PolicyStatement): void` - Add custom IAM policy to user

### Enums

#### BackupType
```typescript
enum BackupType {
  STANDALONE = "standalone",
  DATA_SYNC = "data_sync", 
  DIRECT_UPLOAD = "direct_upload"
}
```

### Interfaces

All interfaces are fully documented in the [Configuration Options](#configuration-options) section above.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

### Development Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build
```

### Testing

The construct includes comprehensive test coverage:
- Unit tests for all backup types
- Integration tests for multiple instances
- Validation tests for error conditions
- Output configuration tests

Run tests with:
```bash
npm test
```

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### v1.0.0
- Initial release with three backup types
- Multiple instances support
- Comprehensive validation
- Full test coverage

---

*For more examples and detailed usage, see the test files in the `test/` directory.*
