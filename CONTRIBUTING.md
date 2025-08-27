# Contributing to CDK Utility Constructs

Thank you for your interest in contributing to my AWS CDK utility constructs library! 
However at this time I do not intend to grow this library beyond the constructs I build myself.

Should you want to try and convince me otherwise, here is a baseline guide to contributing.
Please keep in mind that I might ask more than this when I see your PR.

## Important Notice

⚠️ **Please read before contributing:**

- There is **no guarantee of interaction** from maintainers
- There is **no guarantee of response** to issues or pull requests
- Contributions are accepted at the sole discretion of the maintainers

## Requirements

All contributions must meet these strict requirements:

### minimum compatibility
- with the cdk [design guidelines](https://github.com/aws/aws-cdk/blob/main/docs/DESIGN_GUIDELINES.md)
- with construct hub
- with jsii

### Testing Requirements
- **100% test coverage** is mandatory for all new code
- All changes **must be tested in real-world scenarios** before submission
- Tests must pass in CI/CD pipeline

### Code Quality
- Use TypeScript with strict type checking
- Include comprehensive JSDoc documentation
- Follow the existing code style and patterns

## How to Contribute

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with complete test coverage
4. Test your changes in a real AWS environment
5. Submit a pull request with detailed description

## Testing Your Changes

Before submitting:
1. Run `npm test` to ensure all tests pass
2. Run `npm run build` to verify compilation
3. Deploy and test your constructs in an actual AWS account
4. Document any real-world testing scenarios in your PR

## Code of Conduct

By contributing, you agree to maintain professionalism and respect for all community members, while understanding the very limited support model of this project.
