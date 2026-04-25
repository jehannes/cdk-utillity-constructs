# Product Overview

CDK Utility Constructs is a reusable AWS CDK construct library (TypeScript) published via jsii for multi-language support (Python target included).

It provides higher-level constructs that simplify common AWS deployment patterns:

- **S3Backup** — Flexible S3-based backup with three modes: STANDALONE (independent versioned bucket), DATA_SYNC (automated S3-to-S3 via AWS DataSync), and DIRECT_UPLOAD (folder-scoped access to an existing bucket). Includes IAM user creation, lifecycle management, and CloudWatch integration.
- **CloudFrontForLambda** — CloudFront distribution fronting a Lambda Function URL. Supports custom domains via Route53, ACM certificates (including wildcard via SSM), OAC for IAM-protected origins, geo-restriction, and HTTP/3.

All constructs must comply with:
- [AWS CDK Design Guidelines](https://github.com/aws/aws-cdk/blob/main/docs/DESIGN_GUIDELINES.md)
- jsii compatibility (no unsupported TypeScript features)
- Construct Hub publishing requirements

License: Apache-2.0
