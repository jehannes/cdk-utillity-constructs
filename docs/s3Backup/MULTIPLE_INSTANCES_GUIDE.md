# Multiple Instances Usage Guide

The S3Backup construct has been designed to support multiple instances within the same CDK stack. Here's how to use it effectively:

## Key Features for Multiple Instances

### 1. Unique Resource IDs
All internal AWS resources (buckets, users, roles, etc.) are automatically namespaced using the construct ID you provide:

```typescript
// Each instance gets unique resource IDs
const backup1 = new S3Backup(stack, 'HomeAssistantBackup', props1);
const backup2 = new S3Backup(stack, 'PhoneBackup', props2);
```

### 2. Output Prefixing
Use the `outputConfig.outputPrefix` to avoid CloudFormation output conflicts:

```typescript
const props1: S3BackupProps = {
  backupType: BackupType.STANDALONE,
  outputConfig: {
    outputPrefix: 'HomeAssistant'
  }
  // ... other props
};

const props2: S3BackupProps = {
  backupType: BackupType.DATA_SYNC,
  outputConfig: {
    outputPrefix: 'Phone'
  }
  // ... other props
};
```

## Usage Examples

### Multiple STANDALONE Instances
```typescript
import { S3Backup, BackupType } from './constructs/s3Backup';

// Create multiple standalone backup buckets
const homeAssistantBackup = new S3Backup(stack, 'HomeAssistantBackup', {
  backupType: BackupType.STANDALONE,
  outputConfig: { outputPrefix: 'HomeAssistant' }
});

const databaseBackup = new S3Backup(stack, 'DatabaseBackup', {
  backupType: BackupType.STANDALONE,
  outputConfig: { outputPrefix: 'Database' }
});
```

### Multiple DATA_SYNC Instances
```typescript
// Create multiple DataSync backup configurations
const documentsSync = new S3Backup(stack, 'DocumentsSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: mainBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'documents',
    dataSyncInterval: Duration.hours(12)
  },
  outputConfig: { outputPrefix: 'Documents' }
});

const photosSync = new S3Backup(stack, 'PhotosSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: mainBucket,
  dataSyncProps: {
    dataSyncTargetFolder: 'photos',
    dataSyncInterval: Duration.hours(6)
  },
  outputConfig: { outputPrefix: 'Photos' }
});
```

### Multiple DIRECT_UPLOAD Instances
```typescript
// Create multiple direct upload configurations for different use cases
const appUploads = new S3Backup(stack, 'AppUploads', {
  backupType: BackupType.DIRECT_UPLOAD,
  centralBackupBucket: mainBucket,
  bucketProps: {
    directUploadFolder: 'app-uploads'
  },
  outputConfig: { outputPrefix: 'App' }
});

const userUploads = new S3Backup(stack, 'UserUploads', {
  backupType: BackupType.DIRECT_UPLOAD,
  centralBackupBucket: mainBucket,
  bucketProps: {
    directUploadFolder: 'user-uploads'
  },
  outputConfig: { outputPrefix: 'User' }
});
```

### Mixed Backup Types
```typescript
// You can mix different backup types in the same stack
const standaloneBackup = new S3Backup(stack, 'CriticalStandalone', {
  backupType: BackupType.STANDALONE,
  outputConfig: { outputPrefix: 'Critical' }
});

const syncedBackup = new S3Backup(stack, 'RegularSync', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: mainBucket,
  dataSyncProps: { dataSyncTargetFolder: 'regular-backups' },
  outputConfig: { outputPrefix: 'Regular' }
});

const uploadBackup = new S3Backup(stack, 'DirectUpload', {
  backupType: BackupType.DIRECT_UPLOAD,
  centralBackupBucket: mainBucket,
  bucketProps: { directUploadFolder: 'direct-uploads' },
  outputConfig: { outputPrefix: 'Direct' }
});
```

## Best Practices

### 1. Use Descriptive Construct IDs
Choose construct IDs that clearly identify the purpose:
```typescript
// Good
new S3Backup(stack, 'HomeAssistantBackup', props);
new S3Backup(stack, 'DatabaseBackup', props);

// Avoid generic names
new S3Backup(stack, 'Backup1', props);
new S3Backup(stack, 'Backup2', props);
```

### 2. Use Output Prefixes
Always use output prefixes to avoid CloudFormation output conflicts:
```typescript
outputConfig: {
  outputPrefix: 'HomeAssistant', // Will create outputs like 'HomeAssistantBucketName'
  includeAccessKeyOutputs: false // Consider security implications
}
```

### 3. Organize by Purpose
Group related backup configurations:
```typescript
// Media backups
const photoBackup = new S3Backup(stack, 'PhotoBackup', { /*...*/ });
const videoBackup = new S3Backup(stack, 'VideoBackup', { /*...*/ });

// System backups
const configBackup = new S3Backup(stack, 'ConfigBackup', { /*...*/ });
const databaseBackup = new S3Backup(stack, 'DatabaseBackup', { /*...*/ });
```

### 4. Consider Resource Limits
Be aware of AWS service limits:
- IAM users per account: 5,000 (default)
- S3 buckets per account: 1,000 (hard limit)
- DataSync tasks per account: 100 (default, can be increased)

## Troubleshooting

### Resource ID Conflicts
If you encounter resource ID conflicts, ensure:
1. Each S3Backup instance has a unique construct ID
2. You're using output prefixes
3. Custom resource names (if provided) are unique

### CloudFormation Output Conflicts
Use unique output prefixes for each instance:
```typescript
outputConfig: {
  outputPrefix: 'UniquePrefix',
  // ... other config
}
```

### IAM User Name Conflicts
If providing custom user names, ensure they're unique:
```typescript
iamUserProps: {
  userName: 'unique-backup-user-name'
}
```
