# CDK Utility Constructs

> [!WARNING]
> **Archived and unmaintained.** This library was never put to use, and both constructs
> have defects that make their primary paths unusable. Don't install it.
>
> - **`CloudFrontForLambda` cannot synthesize on its default path.** The ACM certificate is
>   requested for the bare domain segment (`api`) instead of the full name
>   (`api.example.com`), so CDK rejects it as not authoritative for the hosted zone.
>   Supplying your own us-east-1 certificate through the `certificate` prop is the only
>   path that synthesizes.
> - **The release tarball is empty.** The `cdk-utility-constructs-vN.tgz` asset advertised
>   in every GitHub Release contains no compiled code — only `package.json`, `README.md`,
>   and `LICENSE.md`. The complete package is the `*.jsii.tgz` attached alongside it.
>
> Both constructs were generalized out of smaller projects without a second use site to
> validate the abstraction. The remaining findings, including a duplicated CloudFront
> origin access control and a bucket-naming bug, are recorded in
> `.kiro/steering/learnings.md`. Everything below this banner is the original
> documentation, left uncorrected.

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

### CloudFrontForLambda

A construct that creates a CloudFront distribution with a Lambda Function URL as the origin, providing global CDN capabilities for serverless applications.

#### Basic Usage

```typescript
import { CloudFrontForLambda } from 'cdk-utility-constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
});

// CloudFront distribution with custom domain
new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com', // Creates api.example.com
});

// With subdomain
new CloudFrontForLambda(this, 'V1Distribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  subdomain: 'v1',
  hostedZoneDomain: 'example.com', // Creates v1.api.example.com
});
```

#### Features

- Automatic Lambda Function URL creation and management
- Custom domain support with Route53 integration
- SSL/TLS certificate management with AWS Certificate Manager
- Subdomain support for multi-environment deployments
- Optimized caching policies for serverless applications
- Support for multiple deployment patterns (with restrictions)
- Comprehensive security headers and policies

## 📚 Documentation

Detailed documentation for each construct:

- [S3Backup Construct Guide](./docs/s3Backup/S3BACKUP_CONSTRUCT_GUIDE.md)
- [S3Backup Multiple Instances Guide](./docs/s3Backup/MULTIPLE_INSTANCES_GUIDE.md)
- [CloudFront for Lambda Construct Guide](./docs/cloudfront-for-lambda/CLOUDFRONT_FOR_LAMBDA_GUIDE.md)
- [CloudFront for Lambda Multiple Deployments Guide](./docs/cloudfront-for-lambda/MULTIPLE_DEPLOYMENTS_GUIDE.md)

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
│   ├── cloudfront-for-lambda/
│   └── s3-backup/
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

### CloudFrontForLambda Props

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `lambdaFunction` | `lambda.Function` | The Lambda function to front with CloudFront | Required |
| `domainName` | `string` | Base domain name segment (e.g., 'api' for api.example.com) | Required |
| `hostedZoneDomain` | `string` | Top-level domain where the Route53 hosted zone exists | Required |
| `subdomain` | `string` | Subdomain prefix (e.g., 'v1' for v1.api.example.com) | - |
| `certificate` | `acm.ICertificate` | Custom ACM certificate (must be in us-east-1) | DNS validated cert |
| `useWildcardCertificate` | `boolean` | Use a wildcard certificate from SSM Parameter Store | `false` |
| `wildcardCertificateArn` | `string` | ARN or SSM parameter name for wildcard certificate | SSM default path |
| `allowDirectAccess` | `boolean` | Allow direct Lambda URL access without IAM auth | `false` |
| `allowedMethods` | `cf.AllowedMethods` | Allowed HTTP methods | `ALLOW_GET_HEAD` |
| `geoRestriction` | `cf.GeoRestriction` | Geographic restriction settings | `allowlist("NL")` |


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
