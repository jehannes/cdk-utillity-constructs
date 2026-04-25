# Project Structure

```
├── lib/                          # Source code (tsconfig rootDir)
│   ├── index.ts                  # Barrel export — re-exports all constructs
│   ├── cloudfront-for-lambda/
│   │   └── cloudfront-for-lambda.ts
│   └── s3-backup/
│       └── s3-backup.ts
├── test/                         # Jest unit tests
│   ├── cloudfront-for-lambda.test.ts
│   └── s3-Backup.test.ts
├── docs/                         # Construct usage guides
│   ├── cloudfront-for-lambda/
│   └── s3Backup/
├── dist/                         # Compiled output (jsii + tsgo)
├── build.sh                      # Full build script
├── .awslint.json                 # CDK design guideline rules
├── .oxlintrc.json                # Oxlint config
├── jest.config.js                # Jest config (100% coverage thresholds)
├── tsconfig.json                 # TypeScript config (strict, ES2022)
└── package.json                  # npm/jsii config
```

## Conventions

### Adding a New Construct
1. Create `lib/{construct-name}/{construct-name}.ts` — one construct per file, kebab-case naming
2. Export from `lib/index.ts`
3. Create `test/{construct-name}.test.ts`
4. Create `docs/{constructName}/` with usage guide(s)

### Construct File Pattern
Each construct file contains:
- Exported interfaces for props (composed from smaller config interfaces where appropriate)
- Exported enum types
- Exported construct class extending `Construct`
- Private helper functions for resource creation (not exported, not in the class)
- Public properties exposing created resources
- JSDoc on all public APIs

### Test File Pattern
- One `describe` block per construct
- Nested `describe` blocks for feature groups
- `beforeEach` creates fresh `App`, `Stack`, and test resources
- Uses `Template.fromStack()` and `Match` from `aws-cdk-lib/assertions`
- Tests both happy paths and validation error cases (`expect(() => ...).toThrow()`)
