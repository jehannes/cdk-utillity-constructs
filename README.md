# CDK Utility Constructs

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

This is a store of reusable AWS CDK constructs for things I wanted to make easier to deploy, or easier to deploy repeatedly, 
or just have in a separate construct for maintainability and/or legibility in cloudformation

I intend for all constructs to compliant to:

- jsii
- cdk [design guidelines](https://github.com/aws/aws-cdk/blob/main/docs/DESIGN_GUIDELINES.md)

## 🏗️ Constructs

### S3Backup

A  backup solution supporting three distinct patterns:

- **STANDALONE** - Independent backup buckets with versioning and lifecycle management
- **DATA_SYNC** - Automated synchronization between buckets using AWS DataSync
- **DIRECT_UPLOAD** - Direct uploads to existing buckets with folder-based permissions

#### Basic Usage

```typescript
import { S3Backup, BackupType } from 'cdk-utility-constructs';

// Standalone backup bucket
new S3Backup(this, 'MyBackup', {
  backupType: BackupType.STANDALONE,
  bucketProps: {
    bucketName: 'my-backup-bucket'
  }
});

// Data synchronization between buckets
new S3Backup(this, 'DataSyncBackup', {
  backupType: BackupType.DATA_SYNC,
  centralBackupBucket: existingBucket,
  dataSyncProps: {
    dataSyncInterval: Duration.hours(6)
  }
});
```

#### Features

- Automatic IAM user creation with least-privilege access
- Lifecycle management with intelligent tiering
- CloudWatch integration and monitoring
- Multiple instance support within the same stack
- Configurable CloudFormation outputs
- Support for encryption and versioning

## 📚 Documentation

Detailed documentation for each construct:

- [S3Backup Construct Guide](./docs/s3Backup/S3BACKUP_CONSTRUCT_GUIDE.md)
- [S3Backup Multiple Instances Guide](./docs/s3Backup/MULTIPLE_INSTANCES_GUIDE.md)

## 🔧 Development

### Prerequisites

- Node.js 18+ (tested on 24)
- AWS CDK 2.x
- TypeScript 5.x

### Building from Source

```bash
# Clone the repository
git clone https://github.com/jehannes/cdk-utility-constructs.git
cd cdk-utility-constructs

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Project Structure

```
├── lib/                    # Source code
│   ├── cloudfront-for-lambda/
│   └── s3-backup/
├── test/                   # Unit tests
├── docs/                   # Documentation
├── dist/                   # Compiled output
└── build.sh               # Build script
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📋 Construct reference

### S3Backup Props

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `backupType` | `BackupType` | The type of backup to create | Required |
| `bucketProps` | `BucketProps` | S3 bucket configuration | Optional |
| `iamUserProps` | `IamUserProps` | IAM user configuration | Optional |
| `dataSyncProps` | `DataSyncProps` | DataSync configuration | Optional |
| `centralBackupBucket` | `s3.IBucket` | Central backup bucket for DATA_SYNC/DIRECT_UPLOAD | Optional |
| `outputConfig` | `OutputConfig` | CloudFormation outputs configuration | Optional |


## 🤝 Contributing

Please read my [Contributing Guide](./CONTRIBUTING.md) for details on the code of conduct and the process for submitting pull requests.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for your changes
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE.md) file for details.

## 🆘 Support

- 📖 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/jehannes/cdk-utility-constructs/issues)


## 🙏 Acknowledgments

- AWS CDK team for the excellent framework
- AWS community for inspiration and best practices

---

Made with ❤️ by [Jehannes Zuidema](https://github.com/jehannes)
