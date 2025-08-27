# Linting Configuration

This project uses two complementary linting tools to ensure code quality and AWS CDK best practices:

## 🔧 Linting Tools

### 1. AWSlint
- **Purpose**: AWS CDK-specific best practices and API guidelines
- **Focus**: Construct design patterns, naming conventions, documentation requirements
- **Config**: `.awslint.json`
- **Version**: 2.212.0-alpha.0

### 2. Oxlint
- **Purpose**: Fast JavaScript/TypeScript linting (Rust-based)
- **Focus**: General code quality, performance, correctness
- **Config**: `.oxlintrc.json`
- **Version**: 1.13.0

## 📋 Available Scripts

### Basic Linting
```bash
# Run AWS CDK-specific linting
npm run lint

# Run general code quality linting (fast)
npm run lint:ox

# Run both linters
npm run lint:all
```

### Targeted Linting
```bash
# Lint only source files
npm run lint:ox:src

# Lint only test files  
npm run lint:ox:test
```

### Auto-fixing
```bash
# Auto-fix AWS CDK issues (where possible)
npm run lint:fix

# Auto-fix general code issues
npm run lint:ox:fix
```

## ⚙️ Configuration Details
These linters basically set to the most asinine settings

### AWSlint Configuration (`.awslint.json`)
- Enforces CDK construct design guidelines
- Requires documentation for public APIs
- Validates naming conventions
- Excludes generated files and test directories

### Oxlint Configuration (`.oxlintrc.json`)
- Fast linting with default rules
- Ignores build artifacts and generated files
- Focuses on common JavaScript/TypeScript issues
- Configured for Node.js and Jest environments

## 🚀 Integration

### In Development
```bash
# Quick check during development
npm run lint:ox

# Full validation before commit
npm run lint
```

### In CI/CD
Both linters should be run in your CI pipeline to ensure:
- AWS CDK best practices compliance (awslint)
- Code quality standards (oxlint)

## 🔍 Common Issues

### AWSlint Issues
- **Missing documentation**: Add JSDoc comments to public APIs
- **Naming conventions**: Follow CDK naming patterns
- **Props interfaces**: Use proper construct props patterns

### Oxlint Issues
- **Unused variables**: Remove or prefix with `_`
- **Code complexity**: Simplify complex functions
- **Performance**: Avoid inefficient patterns

## 📚 Resources

- [AWS CDK Design Guidelines](https://github.com/aws/aws-cdk/blob/main/docs/DESIGN_GUIDELINES.md)
- [Oxlint Documentation](https://oxc-project.github.io/docs/guide/usage/linter.html)
- [jsii Best Practices](https://github.com/aws/jsii/blob/main/docs/best-practices.md)
