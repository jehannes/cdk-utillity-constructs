# CloudFront for Lambda - Multiple Deployments Guide

This guide details the restrictions, limitations, and best practices when deploying multiple CloudFront for Lambda constructs.

## Overview

The `CloudFrontForLambda` construct manages several AWS resources that have specific constraints when deployed multiple times:

- **Route53 DNS Records**: Cannot have duplicates in the same hosted zone
- **Lambda Function URLs**: Each Lambda function can only have one Function URL
- **CloudFront Distributions**: No inherent conflicts, but domain routing requires unique endpoints

## Supported Deployment Patterns

### ✅ Pattern 1: Different Domains

Deploy multiple distributions with completely different domains:

```typescript
// ✅ WORKS: Different base domains
new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: apiFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com', // api.example.com
});

new CloudFrontForLambda(this, 'WebDistribution', {
  lambdaFunction: webFunction,
  domainName: 'web',
  hostedZoneDomain: 'example.com', // web.example.com
});
```

**Why it works**: Creates different DNS records (`api.example.com` vs `web.example.com`).

### ✅ Pattern 2: Different Subdomains

Use subdomains to create multiple endpoints for the same base domain:

```typescript
// ✅ WORKS: Different subdomains
new CloudFrontForLambda(this, 'V1Api', {
  lambdaFunction: v1Function,
  domainName: 'api',
  subdomain: 'v1',
  hostedZoneDomain: 'example.com', // v1.api.example.com
});

new CloudFrontForLambda(this, 'V2Api', {
  lambdaFunction: v2Function,
  domainName: 'api',
  subdomain: 'v2',
  hostedZoneDomain: 'example.com', // v2.api.example.com
});
```

**Why it works**: Creates different DNS records with unique subdomains.

### ✅ Pattern 3: Different Hosted Zones

Deploy to different Route53 hosted zones:

```typescript
// ✅ WORKS: Different hosted zones
new CloudFrontForLambda(this, 'ProdApi', {
  lambdaFunction: prodFunction,
  domainName: 'api',
  hostedZoneDomain: 'prod-example.com', // api.prod-example.com
});

new CloudFrontForLambda(this, 'StagingApi', {
  lambdaFunction: stagingFunction,
  domainName: 'api',
  hostedZoneDomain: 'staging-example.com', // api.staging-example.com
});
```

**Why it works**: Different hosted zones can have the same relative domain names.

### ✅ Pattern 4: Cross-Stack Deployments

Deploy distributions in different CloudFormation stacks:

```typescript
// Stack 1
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    new CloudFrontForLambda(this, 'ApiDistribution', {
      lambdaFunction: apiFunction,
      domainName: 'api',
      hostedZoneDomain: 'example.com',
    });
  }
}

// Stack 2 (different region, account, or deployment)
export class WebStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    new CloudFrontForLambda(this, 'WebDistribution', {
      lambdaFunction: webFunction,
      domainName: 'web',
      hostedZoneDomain: 'example.com',
    });
  }
}
```

**Why it works**: Resources are isolated in separate CloudFormation stacks.

### ✅ Pattern 5: Sequential Deployments

Deploy to the same domain by destroying the previous deployment first:

```typescript
// Phase 1: Deploy blue version
new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: blueFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

// Phase 2: Destroy blue, then deploy green
// cdk destroy BlueStack
// cdk deploy GreenStack

new CloudFrontForLambda(this, 'ApiDistribution', {
  lambdaFunction: greenFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});
```

**Why it works**: No resource conflicts when deployments are sequential.

## Restricted Deployment Patterns

### ❌ Pattern 1: Identical Domains

**Problem**: Cannot create multiple distributions with the same exact domain.

```typescript
// ❌ FAILS: Identical domains
new CloudFrontForLambda(this, 'FirstDistribution', {
  lambdaFunction: function1,
  domainName: 'api',
  hostedZoneDomain: 'example.com', // api.example.com
});

new CloudFrontForLambda(this, 'SecondDistribution', {
  lambdaFunction: function2,
  domainName: 'api',
  hostedZoneDomain: 'example.com', // api.example.com ❌ DUPLICATE
});
```

**Error**: 
```
Route53 error: RRSet with DNS name api.example.com already exists
```

**Solutions**:
- Use different subdomains: `v1.api.example.com` and `v2.api.example.com`
- Use different base domains: `api.example.com` and `web.example.com`
- Deploy sequentially (destroy first, then deploy second)

### ❌ Pattern 2: Shared Lambda Functions

**Problem**: Each Lambda function can only have one Function URL.

```typescript
const sharedFunction = new lambda.Function(this, 'SharedFunction', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
});

// ❌ FAILS: Shared Lambda function
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
```

**Error**:
```
InvalidParameterValueException: The function already has a FunctionUrlConfig
```

**Solutions**:
- Create separate Lambda functions for each distribution
- Use one distribution with path-based routing in the Lambda function
- Use API Gateway instead of multiple CloudFront distributions

### ❌ Pattern 3: Cross-Stack Dependencies

**Problem**: Complex cross-stack references can cause deployment issues.

```typescript
// Stack A: Lambda function
export class LambdaStack extends Stack {
  public readonly apiFunction: lambda.Function;
  
  constructor(scope: Construct, id: string) {
    super(scope, id);
    
    this.apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
    });
  }
}

// Stack B: CloudFront distribution
export class CloudFrontStack extends Stack {
  constructor(scope: Construct, id: string, lambdaStack: LambdaStack) {
    super(scope, id);
    
    // ❌ PROBLEMATIC: Cross-stack reference with Function URL
    new CloudFrontForLambda(this, 'Distribution', {
      lambdaFunction: lambdaStack.apiFunction, // Cross-stack reference
      domainName: 'api',
      hostedZoneDomain: 'example.com',
    });
  }
}
```

**Issues**:
- Function URL is created in CloudFrontStack, not LambdaStack
- Circular dependencies possible
- Complex update scenarios
- Stack deletion order matters

**Solutions**:
- Keep Lambda function and CloudFront distribution in the same stack
- Export Function URL from LambdaStack if separation is needed
- Use AWS Systems Manager Parameter Store for loose coupling

## Best Practices for Multiple Deployments

### 1. Environment-Based Naming Strategy

```typescript
interface DeploymentConfig {
  environment: 'dev' | 'staging' | 'prod';
  region: string;
  domainSuffix?: string;
}

function createDistribution(scope: Construct, config: DeploymentConfig) {
  const subdomain = config.environment === 'prod' ? undefined : config.environment;
  const domain = config.domainSuffix || 'example.com';
  
  return new CloudFrontForLambda(scope, `Api${config.environment}`, {
    lambdaFunction: createFunction(scope, config),
    domainName: 'api',
    subdomain: subdomain,
    hostedZoneDomain: domain,
  });
}

// Usage
createDistribution(this, { environment: 'dev', region: 'us-east-1' });
createDistribution(this, { environment: 'staging', region: 'us-east-1' });
createDistribution(this, { environment: 'prod', region: 'us-east-1' });
```

**Results**:
- `dev.api.example.com`
- `staging.api.example.com`  
- `api.example.com`

### 2. Feature Branch Deployments

```typescript
interface FeatureBranchConfig {
  branchName: string;
  cleanBranchName: string; // Sanitized for DNS
}

function createFeatureBranch(scope: Construct, config: FeatureBranchConfig) {
  return new CloudFrontForLambda(scope, `Feature${config.cleanBranchName}`, {
    lambdaFunction: createFunction(scope, config),
    domainName: 'api',
    subdomain: config.cleanBranchName,
    hostedZoneDomain: 'dev.example.com',
  });
}

// Usage
createFeatureBranch(this, { 
  branchName: 'feature/new-api',
  cleanBranchName: 'new-api'
});
```

**Result**: `new-api.api.dev.example.com`

### 3. Blue-Green Deployment Strategy

```typescript
class BlueGreenDeployment {
  constructor(scope: Construct, id: string) {
    // Blue (current production)
    const blueDistribution = new CloudFrontForLambda(scope, 'BlueDistribution', {
      lambdaFunction: createBlueFunction(scope),
      domainName: 'api',
      hostedZoneDomain: 'example.com',
    });
    
    // Green (new version)
    const greenDistribution = new CloudFrontForLambda(scope, 'GreenDistribution', {
      lambdaFunction: createGreenFunction(scope),
      domainName: 'api',
      subdomain: 'green',
      hostedZoneDomain: 'example.com',
    });
    
    // Manual process:
    // 1. Deploy this stack (green.api.example.com is available)
    // 2. Test green.api.example.com
    // 3. Update Route53 alias to point api.example.com to green distribution
    // 4. Remove blue distribution in next deployment
  }
}
```

### 4. API Versioning Strategy

```typescript
class ApiVersioning {
  constructor(scope: Construct, id: string) {
    // Version 1 (legacy)
    new CloudFrontForLambda(scope, 'V1Api', {
      lambdaFunction: createV1Function(scope),
      domainName: 'api',
      subdomain: 'v1',
      hostedZoneDomain: 'example.com',
    });
    
    // Version 2 (current)
    new CloudFrontForLambda(scope, 'V2Api', {
      lambdaFunction: createV2Function(scope),
      domainName: 'api',
      subdomain: 'v2',
      hostedZoneDomain: 'example.com',
    });
    
    // Current version (no subdomain)
    new CloudFrontForLambda(scope, 'CurrentApi', {
      lambdaFunction: createV2Function(scope), // Same as v2
      domainName: 'api',
      hostedZoneDomain: 'example.com',
    });
  }
}
```

**Results**:
- `v1.api.example.com` (legacy)
- `v2.api.example.com` (current version)
- `api.example.com` (current version alias)

### 5. Regional Deployments

```typescript
class MultiRegionDeployment {
  constructor(scope: Construct, id: string) {
    // US East
    new CloudFrontForLambda(scope, 'USEastApi', {
      lambdaFunction: createFunction(scope, 'us-east-1'),
      domainName: 'api',
      subdomain: 'us-east',
      hostedZoneDomain: 'example.com',
    });
    
    // EU West
    new CloudFrontForLambda(scope, 'EUWestApi', {
      lambdaFunction: createFunction(scope, 'eu-west-1'),
      domainName: 'api',
      subdomain: 'eu-west',
      hostedZoneDomain: 'example.com',
    });
  }
}
```

## Migration Strategies

### Strategy 1: Gradual Migration

```typescript
// Phase 1: Deploy new version alongside old
new CloudFrontForLambda(this, 'LegacyApi', {
  lambdaFunction: legacyFunction,
  domainName: 'api',
  hostedZoneDomain: 'example.com',
});

new CloudFrontForLambda(this, 'NewApi', {
  lambdaFunction: newFunction,
  domainName: 'api',
  subdomain: 'v2',
  hostedZoneDomain: 'example.com',
});

// Phase 2: Switch traffic gradually using Route53 weighted routing
// Phase 3: Remove legacy distribution
```

### Strategy 2: DNS Cutover

```typescript
// Before: api.example.com -> Old Distribution
// During migration:

// 1. Deploy new distribution with temporary subdomain
new CloudFrontForLambda(this, 'NewApi', {
  lambdaFunction: newFunction,
  domainName: 'api',
  subdomain: 'new',
  hostedZoneDomain: 'example.com',
});

// 2. Test new.api.example.com
// 3. Update DNS manually or with Route53 aliases
// 4. Remove old distribution
```

## Troubleshooting Multiple Deployments

### Issue 1: Route53 Record Conflicts

**Symptoms**:
```
CREATE_FAILED: Route53 RecordSet already exists
```

**Diagnosis**:
```bash
# List existing records
aws route53 list-resource-record-sets \
  --hosted-zone-id Z123456789 \
  --query 'ResourceRecordSets[?Name==`api.example.com.`]'
```

**Solutions**:
- Use different subdomains
- Delete conflicting records manually
- Use `cdk diff` to preview changes

### Issue 2: Lambda Function URL Conflicts

**Symptoms**:
```
InvalidParameterValueException: The function already has a FunctionUrlConfig
```

**Diagnosis**:
```bash
# Check function URL configuration
aws lambda get-function-url-config \
  --function-name MyFunction
```

**Solutions**:
- Create separate Lambda functions
- Remove existing Function URL if safe
- Use different function names

### Issue 3: Stack Update Failures

**Symptoms**:
- Stack update hangs or fails
- Resources in UPDATE_FAILED state

**Diagnosis**:
```bash
# Check stack events
aws cloudformation describe-stack-events \
  --stack-name MyStack \
  --query 'StackEvents[?ResourceStatus==`UPDATE_FAILED`]'
```

**Solutions**:
- Check resource dependencies
- Use `cdk deploy --rollback` for safer updates
- Consider blue-green deployment strategy

## Summary

Multiple CloudFront for Lambda deployments are supported with proper planning:

**✅ Always Works**:
- Different domains or subdomains
- Different hosted zones
- Separate CloudFormation stacks
- Sequential deployments

**❌ Never Works**:
- Identical domains in same hosted zone
- Shared Lambda functions
- Complex cross-stack dependencies

**Best Practices**:
- Use environment-based subdomains
- Keep related resources in same stack
- Plan domain naming strategy upfront
- Test in non-production environments first
- Use blue-green deployments for production

For more detailed examples, see the [test files](../../test/cloudfront-for-lambda.test.ts) which demonstrate many of these patterns.
