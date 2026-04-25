import { Construct } from "constructs";
import {
  aws_cloudfront as cf,
  aws_cloudfront_origins as origins,
  aws_certificatemanager as acm,
  aws_route53 as r53,
  aws_route53_targets as r53targets,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_ssm as ssm,
  CfnOutput,
  Stack,
  Duration,
} from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";

/**
 * Domain configuration for CloudFront distribution
 */
export interface DomainConfig {
  /**
   * The base domain name segment used to construct the full domain
   * 
   * @example 'api' results in 'api.example.com'
   */
  readonly domainName: string;

  /**
   * Subdomain for the CloudFront distribution
   * 
   * @example 'api' for 'api.example.com'
   * @default - no subdomain
   */
  readonly subdomain?: string;

  /**
   * Top-level domain where the Route53 hosted zone exists
   * 
   * @example 'example.com'
   */
  readonly hostedZoneDomain: string;
}

/**
 * Certificate configuration for HTTPS
 */
export interface CertificateConfig {
  /**
   * Certificate configuration for HTTPS
   * 
   * [disable-awslint:prefer-ref-interface]
   * 
   * @default - A new certificate will be created with DNS validation
   */
  readonly certificate?: acm.ICertificate;

  /**
   * Whether to use a wildcard certificate from SSM Parameter Store
   * 
   * @default false
   */
  readonly useWildcardCertificate?: boolean;

  /**
   * ARN of wildcard certificate or SSM parameter name containing the ARN
   * 
   * Only used when useWildcardCertificate is true
   * 
   * @default - Uses SSM parameter at `/certificate/${domainName}/${hostedZoneDomain}`
   */
  readonly wildcardCertificateArn?: string;
}

/**
 * Behavior configuration for the CloudFront distribution
 */
export interface BehaviorConfig {
  /**
   * Whether to allow direct access to the Lambda function URL without IAM authentication
   * 
   * @default false - IAM authentication required
   */
  readonly allowDirectAccess?: boolean;

  /**
   * Allowed HTTP methods for the CloudFront distribution
   * 
   * @default cf.AllowedMethods.ALLOW_GET_HEAD
   */
  readonly allowedMethods?: cf.AllowedMethods;

  /**
   * Geographic restriction settings for the distribution
   * 
   * @default cf.GeoRestriction.allowlist("NL") - Netherlands only
   */
  readonly geoRestriction?: cf.GeoRestriction;
}

/**
 * Properties for the CloudFrontForLambda construct
 */
export interface CloudFrontForLambdaProps extends DomainConfig, CertificateConfig, BehaviorConfig {
  /**
   * The Lambda function to use as the CloudFront distribution origin
   * 
   * [disable-awslint:ref-via-interface] the actual class is needed for the function timeout
   */
  readonly lambdaFunction: lambda.Function;
}

/**
 * CloudFront distribution with Lambda Function URL origin
 *
 * Creates a CloudFront distribution with a Lambda function URL as the origin,
 * configures a custom domain with HTTPS support, and sets up Route53 DNS records.
 *
 * Features:
 * - Lambda Function URL as origin with IAM authentication
 * - TLS certificate with DNS validation
 * - Security best practices (TLS 1.2+, HTTPS redirection)
 * - Geographic restriction support
 * - IPv6 and HTTP/3 support
 * - Wildcard certificate support
 *
 * @example
 *
 * new CloudFrontForLambda(this, 'ApiDistribution', {
 *   lambdaFunction: myLambdaFunction,
 *   domainName: 'api',
 *   hostedZoneDomain: 'example.com'
 * });
 */
export class CloudFrontForLambda extends Construct {
  /**
   * The CloudFront distribution
   */
  public readonly distribution: cf.Distribution;

  /**
   * The Lambda function URL
   */
  public readonly functionUrl: lambda.FunctionUrl;

  /**
   * The ACM certificate used for HTTPS
   */
  public readonly certificate: acm.ICertificate;

  /**
   * The Route53 hosted zone
   */
  public readonly hostedZone: r53.IHostedZone;

  /**
   * Creates a new CloudFrontForLambda construct
   *
   * @param scope - The parent construct
   * @param id - The construct ID
   * @param props - Configuration properties
   */
  constructor(scope: Construct, id: string, props: CloudFrontForLambdaProps) {
    super(scope, id);
    
    // Destructure properties with updated names
    const { 
      lambdaFunction, 
      subdomain, 
      domainName, 
      hostedZoneDomain,
      certificate: customCertificate,
      useWildcardCertificate,
      wildcardCertificateArn,
      allowDirectAccess = false,
      allowedMethods = cf.AllowedMethods.ALLOW_GET_HEAD,
      geoRestriction = cf.GeoRestriction.allowlist("NL")
    } = props;

    // Construct full domain name
    const fullDomain = subdomain ? `${subdomain}.${domainName}.${hostedZoneDomain}` : `${domainName}.${hostedZoneDomain}`;
    const zoneDomain = `${domainName}.${hostedZoneDomain}`;
    const stack = Stack.of(this);

    // Create a Lambda Function URL with IAM authentication for secure access
    this.functionUrl = lambdaFunction.addFunctionUrl({
      authType: allowDirectAccess
        ? lambda.FunctionUrlAuthType.NONE
        : lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    // Look up the Route53 public hosted zone for the domain
    this.hostedZone = r53.HostedZone.fromLookup(this, "PublicZone", {
      domainName: zoneDomain,
      privateZone: false,
    });

    // Get or create certificate
    this.certificate = customCertificate ||
      getCertificate(this, domainName, hostedZoneDomain, this.hostedZone, useWildcardCertificate, wildcardCertificateArn);
    
    if (customCertificate && !this.certificate.certificateArn.includes("us-east-1")) {
      throw new Error(
        "Custom certificate must be in us-east-1 region for CloudFront distributions."
      );
    }

    // Create Lambda origin
    const lambdaOrigin = getLambdaUrlOrigin(
      this,
      this.functionUrl,
      lambdaFunction.timeout ?? cdk.Duration.seconds(3),
      allowDirectAccess
    );

    // Create the CloudFront distribution with security and performance settings
    this.distribution = new cf.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: lambdaOrigin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, // Force HTTPS
        cachePolicy: cf.CachePolicy.CACHING_DISABLED, // No caching for dynamic API responses
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, // Forward all headers except Host
        allowedMethods: allowedMethods,
      },
      domainNames: [fullDomain], // Custom domain for the distribution
      certificate: this.certificate, // Use the ACM certificate
      priceClass: cf.PriceClass.PRICE_CLASS_100, // US, Canada, Europe (lower cost)
      geoRestriction: geoRestriction,
      minimumProtocolVersion: cf.SecurityPolicyProtocol.TLS_V1_2_2021, // Modern TLS version
      httpVersion: cf.HttpVersion.HTTP2_AND_3, // Enable HTTP/3 for better performance
      enableIpv6: true, // Enable IPv6 support
    });

    // Add permission to the Lambda function for CloudFront to invoke it
    if (allowDirectAccess) {
      lambdaFunction.addPermission("CloudFrontInvoke", {
        principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
        action: "lambda:InvokeFunction",
        sourceArn: `arn:aws:cloudfront::${stack.account}:distribution/${this.distribution.distributionId}`,
      });
    }

    // Create Route53 A record (IPv4) pointing to the CloudFront distribution
    new r53.ARecord(this, "AliasARecord", {
      zone: this.hostedZone,
      target: r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(this.distribution)),
      recordName: fullDomain,
    });

    // Create Route53 AAAA record (IPv6) pointing to the CloudFront distribution
    new r53.AaaaRecord(this, "AliasAaaaRecord", {
      zone: this.hostedZone,
      target: r53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(this.distribution)),
      recordName: fullDomain,
    });

    // Output the custom domain URL
    new CfnOutput(this, "ExternalUrl", {
      value: `https://${fullDomain}`,
      description: "HTTPS URL for accessing the API via custom domain",
    });

    // Output the Lambda Function URL (requires IAM authentication)
    new CfnOutput(this, "LambdaFunctionUrl", {
      value: this.functionUrl.url,
      description: "Direct Lambda Function URL (requires IAM authentication)",
    });

    // Output the CloudFront distribution domain name
    new CfnOutput(this, "CloudfrontDistributionDomainName", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront distribution domain name",
    });

    // Output the CloudFront distribution ID (useful for cache invalidations)
    new CfnOutput(this, "CloudfrontDistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront distribution ID (useful for cache invalidations)",
    });

    // Output the CloudFront distribution URL
    new CfnOutput(this, "CloudfrontDistributionUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
      description: "HTTPS URL for the CloudFront distribution",
    });
  }
}

/**
 * Gets or creates an ACM certificate for the CloudFront distribution
 * 
 * @param construct - The construct scope
 * @param domain - The domain name part 
 * @param tld - The top-level domain part
 * @param publicZone - Optional hosted zone to use
 * @param useWildcard - Whether to use a wildcard certificate
 * @param wildcardCertificateArn - ARN or SSM parameter for wildcard certificate
 * @returns The ACM certificate
 */
function getCertificate(
  construct: Construct,
  domain: string,
  tld: string,
  publicZone: r53.IHostedZone,
  useWildcard?: boolean,
  wildcardCertificateArn?: string
): acm.ICertificate {
  // If wildcard is requested, handle wildcard certificate logic
  if (useWildcard) {
    let certArn: string;
    if (wildcardCertificateArn) {
      certArn = wildcardCertificateArn.includes("arn:aws:acm:")
        ? wildcardCertificateArn
        : ssm.StringParameter.valueForStringParameter(construct, wildcardCertificateArn);
    } else {
      certArn = ssm.StringParameter.valueForStringParameter(
        construct,
        `/certificate/${domain}/${tld}`
      );
    }
    return acm.Certificate.fromCertificateArn(construct, "WildcardCert", certArn);
  }

  return new acm.DnsValidatedCertificate(construct, "Certificate", {
    domainName: domain,
    hostedZone: publicZone,
    region: "us-east-1", // Required for CloudFront distributions
  });
}

/**
 * Creates a Lambda Function URL origin for CloudFront
 * 
 * @param construct - The construct scope
 * @param lambdaFunctionUrl - The Lambda function URL
 * @param timeout - The read timeout for the origin
 * @param allowDirectAccess - Whether to allow direct access without IAM auth
 * @returns The CloudFront origin
 */
function getLambdaUrlOrigin(
  construct: Construct,
  lambdaFunctionUrl: lambda.FunctionUrl,
  timeout: Duration,
  allowDirectAccess: boolean
): cf.IOrigin {
  let lambdaOrigin;
  if (allowDirectAccess) {
    // Create direct origin without OAC
    lambdaOrigin = new origins.FunctionUrlOrigin(lambdaFunctionUrl, {
      originShieldEnabled: false,
      originId: "LambdaOrigin",
      readTimeout: timeout,
    });
  } else {
    // Use OAC for protected access
    const oac = new cf.CfnOriginAccessControl(construct, "lambdaUrlOAC", {
      originAccessControlConfig: {
        name: cdk.Names.uniqueId(construct),
        description: "Allow access to lambda url",
        originAccessControlOriginType: "lambda",
        signingBehavior: "always", // Always sign requests
        signingProtocol: "sigv4",
      },
    });

    lambdaOrigin = origins.FunctionUrlOrigin.withOriginAccessControl(lambdaFunctionUrl, {
      originShieldEnabled: false,
      originId: "LambdaOrigin",
      readTimeout: timeout,
      originAccessControlId: oac.attrId,
    });
  }

  return lambdaOrigin;
}


