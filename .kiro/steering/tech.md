# Tech Stack & Build

## Language & Runtime
- TypeScript 5.9, targeting ES2022
- Node.js 18+ (tested on 24)
- Strict mode enabled (`strict`, `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`, `strictPropertyInitialization`)

## Core Dependencies (peer)
- `aws-cdk-lib` ^2.212.0
- `constructs` ^10.4.2

## Build Toolchain
- **jsii** — Multi-language compilation (Python target via jsii-pacmak)
- **tsgo** — TypeScript compilation (used in build.sh before jsii)
- **Jest 30** + **ts-jest** — Unit testing
- **awslint** — CDK design guideline enforcement
- **oxlint** — Fast JS/TS linting (Rust-based)

## Key Commands

| Command | Purpose |
|---|---|
| `npm run build` | Full build: clean → tsgo → jsii → jsii-pacmak → package |
| `npm test` | Run Jest tests with coverage |
| `npm run test:coverage` | Tests with coverage report |
| `npm run lint` | Run both awslint and oxlint |
| `npm run lint:aws` | CDK design guideline checks only |
| `npm run lint:ox` | General code quality checks only |
| `npm run lint:aws:fix` | Auto-fix awslint issues |
| `npm run lint:ox:fix` | Auto-fix oxlint issues |

## Testing Requirements
- 100% code coverage enforced (branches, functions, lines, statements)
- Tests use `aws-cdk-lib/assertions` (`Template`, `Match`)
- Test pattern: Arrange/Act/Assert with `beforeEach` for stack setup
- Tests live in `test/` directory, matched by `**/*.test.ts`

## jsii Constraints
When writing construct code, respect jsii limitations:
- No mapped types, conditional types, or template literal types in public API
- No `Partial<T>`, `Pick<T>`, `Omit<T>` in exported interfaces
- Enums must use string values
- All public members need JSDoc with `@default` tags on optional props
- Use `readonly` on all interface properties
