# CloudFront for Lambda Construct Guide

The `CloudFrontForLambda` construct creates a CloudFront distribution with a Lambda Function URL as the origin, providing a complete solution for serverless API distribution with global edge caching.

## Table of Contents

- [Quick Start](#quick-start)
- [Basic Usage](#basic-usage)
- [Configuration Options](#configuration-options)
- [Domain Management](#domain-management)
- [Certificate Configuration](#certificate-configuration)
- [Security Features](#security-features)
- [Multiple Deployments](#multiple-deployments)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Quick Start

```typescript
import { CloudFrontForLambda } from 'cdk-utility-constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
});

new CloudFrontForLambda(this, 'MyCloudFront', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});
```

This creates a CloudFront distribution accessible at `api.example.com` that forwards requests to your Lambda function.

## Basic Usage

### Simple API Distribution

```typescript
import { CloudFrontForLambda } from 'cdk-utility-constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const apiFunction = new lambda.Function(this, 'ApiFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
    exports.handler = async (event) => {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello from Lambda!' })
      };
    };
  `),
});

const distribution = new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});
```

### With Subdomain

```typescript
new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  subdomain: 'v1',
  hostedZoneDomain: 'example.com',
});
// Creates distribution at v1.api.example.com
```

## Configuration Options

### Interface Reference

```typescript
interface CloudFrontForLambdaProps extends DomainConfig, CertificateConfig, BehaviorConfig {
  readonly lambdaFunction: lambda.Function;
}

interface DomainConfig {
  readonly domainName: string;
  readonly subdomain?: string;
  readonly hostedZoneDomain: string;
}

interface CertificateConfig {
  readonly certificate?: acm.ICertificate;
  readonly useWildcardCertificate?: boolean;
  readonly wildcardCertificateArn?: string;
}

interface BehaviorConfig {
  readonly allowDirectAccess?: boolean;
  readonly responseTimeout?: Duration;
  readonly allowedMethods?: cf.AllowedMethods;
  readonly geoRestriction?: cf.GeoRestriction;
}
```

### Advanced Configuration

```typescript
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { Duration } from 'aws-cdk-lib';

new CloudFrontForLambda(this, 'AdvancedDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  
  // Security settings
  allowDirectAccess: false, // Requires IAM authentication
  
  // Performance settings
  responseTimeout: Duration.seconds(30),
  allowedMethods: cf.AllowedMethods.ALLOW_ALL,
  
  // Geographic restrictions
  geoRestriction: cf.GeoRestriction.allowlist(['US', 'CA', 'GB']),
});
```

## Domain Management

### Automatic DNS Configuration

The construct automatically:
- Looks up your Route53 hosted zone
- Creates DNS records (A and AAAA) pointing to CloudFront
- Manages certificate validation

### Custom Domain Examples

```typescript
// Root domain
new CloudFrontForLambda(this, 'RootDomain', {
  lambdaFunction: myFunction,
  domainName: 'mysite',
  hostedZoneDomain: 'example.com',
});
// Creates: mysite.example.com

// API with version
new CloudFrontForLambda(this, 'VersionedApi', {
  lambdaFunction: myFunction,
  domainName: 'api',
  subdomain: 'v2',
  hostedZoneDomain: 'example.com',
});
// Creates: v2.api.example.com
```

## Certificate Configuration

### Automatic Certificate Creation

By default, the construct creates a DNS-validated certificate:

```typescript
new CloudFrontForLambda(this, 'AutoCert', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  // Certificate automatically created and validated
});
```

### Custom Certificate

```typescript
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

const customCert = new acm.Certificate(this, 'CustomCert', {
  domainName: 'api.example.com',
  validation: acm.CertificateValidation.fromDns(),
});

new CloudFrontForLambda(this, 'CustomCertDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  certificate: customCert,
});
```

### Wildcard Certificate

```typescript
// Using wildcard certificate from SSM Parameter Store
new CloudFrontForLambda(this, 'WildcardDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  useWildcardCertificate: true,
  wildcardCertificateArn: '/certificate/api/example.com', // SSM parameter path
});

// Using direct ARN
new CloudFrontForLambda(this, 'WildcardDistribution2', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  useWildcardCertificate: true,
  wildcardCertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',
});
```

## Security Features

### IAM Authentication (Recommended)

```typescript
new CloudFrontForLambda(this, 'SecureDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  allowDirectAccess: false, // Default - requires IAM authentication
});
```

Benefits:
- Prevents direct access to Lambda Function URL
- Requires proper IAM credentials for access
- CloudFront creates Origin Access Control (OAC) automatically

### Direct Access (Less Secure)

```typescript
new CloudFrontForLambda(this, 'PublicDistribution', {
  lambdaFunction: myFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  allowDirectAccess: true, // Lambda Function URL accessible without IAM
});
```

⚠️ **Warning**: Only use `allowDirectAccess: true` for public APIs that don't require authentication.

### Security Best Practices

The construct automatically enforces:
- HTTPS-only access (HTTP redirects to HTTPS)
- Modern TLS versions (TLSv1.2 minimum)
- Disabled caching for dynamic responses
- Origin request policies optimized for Lambda

## Multiple Deployments

### ✅ Supported Scenarios

#### 1. Different Domains

```typescript
// ✅ This works - different domains
new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

new CloudFrontForLambda(this, 'WebDistribution', {
  lambdaFunction: webFunction,
  domainName: 'web',
  hostedZoneDomain: 'example.com',
});
```

#### 2. Different Subdomains

```typescript
// ✅ This works - different subdomains
new CloudFrontForLambda(this, 'V1Api', {
  lambdaFunction: v1Function,
  domainName: 'api',
  subdomain: 'v1',
  hostedZoneDomain: 'example.com',
});

new CloudFrontForLambda(this, 'V2Api', {
  lambdaFunction: v2Function,
  domainName: 'api',
  subdomain: 'v2',
  hostedZoneDomain: 'example.com',
});
```

#### 3. Different Stacks

```typescript
// Stack 1
new CloudFrontForLambda(stack1, 'Distribution1', {
  lambdaFunction: function1,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

// Stack 2 - different AWS account or region
new CloudFrontForLambda(stack2, 'Distribution2', {
  lambdaFunction: function2,
  domainName: 'api',
  hostedZoneDomain: 'different-domain.com',
});
```

#### 4. Different Lambda Functions

```typescript
// ✅ This works - same domain, different Lambda functions
new CloudFrontForLambda(this, 'ProdDistribution', {
  lambdaFunction: prodFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

// Deploy to different stack or after destroying the first one
new CloudFrontForLambda(this, 'StagingDistribution', {
  lambdaFunction: stagingFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});
```

### ❌ Restrictions and Limitations

#### 1. Same Domain Conflicts

```typescript
// ❌ This will fail during CloudFormation deployment
new CloudFrontForLambda(this, 'FirstDistribution', {
  lambdaFunction: function1,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

new CloudFrontForLambda(this, 'SecondDistribution', {
  lambdaFunction: function2,
  domainName: 'api',        // Same domain
  hostedZoneDomain: 'example.com', // Same hosted zone
});
// Error: Cannot create duplicate Route53 records
```

#### 2. Lambda Function URL Limitations

```typescript
// ❌ This will fail - each Lambda can only have one Function URL
const sharedFunction = new lambda.Function(this, 'SharedFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromInline('...'),
});

new CloudFrontForLambda(this, 'FirstDistribution', {
  lambdaFunction: sharedFunction, // Creates Function URL
  domainName: 'api1',
  hostedZoneDomain: 'example.com',
});

new CloudFrontForLambda(this, 'SecondDistribution', {
  lambdaFunction: sharedFunction, // ❌ Tries to create second Function URL
  domainName: 'api2',
  hostedZoneDomain: 'example.com',
});
// Error: Lambda function already has a Function URL
```

#### 3. Cross-Stack References

```typescript
// ❌ This may cause circular dependencies or deployment issues
const lambdaStack = new Stack(app, 'LambdaStack');
const myFunction = new lambda.Function(lambdaStack, 'Function', {...});

const cloudfrontStack = new Stack(app, 'CloudFrontStack');
new CloudFrontForLambda(cloudfrontStack, 'Distribution', {
  lambdaFunction: myFunction, // Cross-stack reference
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});
```

### Migration Strategies

#### Blue-Green Deployment

```typescript
// Step 1: Deploy new version with different subdomain
new CloudFrontForLambda(this, 'GreenDistribution', {
  lambdaFunction: newFunction,
  domainName: 'api',
  subdomain: 'green',
  hostedZoneDomain: 'example.com',
});

// Step 2: Test at green.api.example.com
// Step 3: Update DNS or redeploy with original domain
// Step 4: Remove old distribution
```

#### Staged Rollout

```typescript
// Production
new CloudFrontForLambda(this, 'ProdDistribution', {
  lambdaFunction: prodFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

// Staging (different subdomain)
new CloudFrontForLambda(this, 'StagingDistribution', {
  lambdaFunction: stagingFunction,
  domainName: 'api',
  subdomain: 'staging',
  hostedZoneDomain: 'example.com',
});
```

## Best Practices

### 1. Resource Organization

```typescript
// ✅ Good: Keep related resources together
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      // ... function configuration
    });
    
    const distribution = new CloudFrontForLambda(this, 'ApiDistribution', {
      lambdaFunction: apiFunction,
      domainName: 'api',
      hostedZoneDomain: 'example.com',
    });
    
    // Export important values
    new CfnOutput(this, 'DistributionDomain', {
      value: distribution.distribution.distributionDomainName,
    });
  }
}
```

### 2. Environment-Specific Configurations

```typescript
// ✅ Good: Use environment-specific settings
interface ApiStackProps extends StackProps {
  readonly environment: 'dev' | 'staging' | 'prod';
  readonly domainName: string;
}

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    
    const subdomain = props.environment === 'prod' ? undefined : props.environment;
    
    new CloudFrontForLambda(this, 'Distribution', {
      lambdaFunction: apiFunction,
      domainName: props.domainName,
      subdomain: subdomain,
      hostedZoneDomain: 'example.com',
      allowDirectAccess: props.environment === 'dev', // Only for dev
    });
  }
}
```

### 3. Security Configuration

```typescript
// ✅ Good: Secure by default
new CloudFrontForLambda(this, 'SecureDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
  
  // Security settings
  allowDirectAccess: false, // Require IAM authentication
  geoRestriction: cf.GeoRestriction.allowlist(['US', 'CA']), // Geographic restrictions
  responseTimeout: Duration.seconds(30), // Reasonable timeout
});
```

### 4. Monitoring and Observability

```typescript
// ✅ Good: Add monitoring
const distribution = new CloudFrontForLambda(this, 'MonitoredDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

// Add CloudWatch alarms
new cloudwatch.Alarm(this, 'HighErrorRate', {
  metric: distribution.distribution.metricErrorRate(),
  threshold: 5,
  evaluationPeriods: 2,
});
```

## Troubleshooting

### Common Issues

#### 1. Certificate Validation Timeout

**Problem**: Certificate validation hangs or times out.

**Solution**:
```typescript
// Ensure your Route53 hosted zone is properly configured
// and has NS records pointing to it from your domain registrar

// Check hosted zone configuration
const hostedZone = r53.HostedZone.fromLookup(this, 'HostedZone', {
  domainName: 'example.com',
});

console.log('Hosted Zone ID:', hostedZone.hostedZoneId);
```

#### 2. "Domain not authoritative" Error

**Problem**: DNS zone is not authoritative for the certificate domain.

**Solution**:
- Verify your domain's NS records point to Route53
- Ensure the hosted zone domain matches your certificate domain
- Check that you have proper permissions to modify DNS records

#### 3. Function URL Already Exists

**Problem**: Lambda function already has a Function URL.

**Solution**:
```typescript
// Use a different Lambda function
const newFunction = new lambda.Function(this, 'NewFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
});

// Or remove the existing Function URL first (if safe to do so)
```

#### 4. Route53 Record Conflicts

**Problem**: Duplicate Route53 records for the same domain.

**Solution**:
- Use different subdomains
- Deploy to different hosted zones
- Remove existing conflicting records
- Use different domain names

### Debug Tips

#### 1. Check CloudFormation Events

```bash
# Check stack events for deployment issues
aws cloudformation describe-stack-events \
  --stack-name YourStackName \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

#### 2. Verify Route53 Configuration

```bash
# Check hosted zone
aws route53 list-hosted-zones-by-name --dns-name example.com

# Check records
aws route53 list-resource-record-sets --hosted-zone-id Z123456789
```

#### 3. Test Function URL Directly

```bash
# Test the Lambda Function URL directly
curl -H "Authorization: AWS4-HMAC-SHA256 ..." \
  https://abc123.lambda-url.us-east-1.on.aws/
```

#### 4. Check CloudFront Distribution

```bash
# Get distribution details
aws cloudfront get-distribution --id E123456789ABCD
```

### Getting Help

- Check the [AWS CDK documentation](https://docs.aws.amazon.com/cdk/)
- Review CloudFormation stack events in the AWS Console
- Use AWS CLI to inspect resource states
- Enable CloudTrail for audit logs
- Check CloudWatch Logs for Lambda function errors

---

For more examples and advanced usage patterns, see the [test files](../../test/cloudfront-for-lambda.test.ts) in the repository.
