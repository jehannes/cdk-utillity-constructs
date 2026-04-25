---
inclusion: manual
---

# Learnings

## GitHub Actions & Releases (2026-04-24)

- `npm install` requires a direct asset download URL, not the release page URL. Release page: `https://github.com/{owner}/{repo}/releases/{tag}` — this is HTML, not a tarball. Direct asset: `https://github.com/{owner}/{repo}/releases/download/{tag}/{filename}.tgz`. The `/download/` segment is the key difference. Relevant to Requirement 6 AC2 in `github-release-workflow` spec.
- `npm install user/repo#tag` shorthand clones the repo and runs `prepare` script, requiring the consumer to have the full build toolchain (jsii, tsgo, etc.). For jsii-based CDK construct libraries, this is impractical — consumers would need the entire jsii compilation chain. Pre-built `.tgz` URLs are the only viable non-registry distribution method until npm publishing is set up.
- npm `--tag` flag maps to release channels: `npm publish --tag alpha`, `--tag beta`, `--tag latest`. This enables `npm install cdk-utility-constructs@alpha` etc. Package name `cdk-utility-constructs` is unscoped (no `@scope/` prefix in `package.json`), so it publishes as a public unscoped package — first-come-first-served on the name. npm publishing is out of scope for the current `github-release-workflow` spec but planned as a follow-up.
- `gh release delete --cleanup-tag` removes both the GitHub Release and its associated git tag in one command — no need for a separate `git push --delete origin <tag>` step.
- `gh release list --json tagName --jq` with `select(test("^v[0-9]+$"))` filters release tags to exact `v<integer>` pattern. The `// 0` jq fallback handles the no-releases case (first-ever release defaults to version 1).
- Single-job GitHub Actions workflows (sequential steps) are preferred over multi-job (lint→test→build as separate jobs) for this repo: avoids `actions/upload-artifact`/`actions/download-artifact` overhead and repeated `npm install`/`npm ci` across jobs. The existing `pr.yml` had 3-4 redundant dependency installs per run.
- Concurrent merges to `main` can race on version number determination — both workflows compute the same next version. Mitigated by `gh release create` failing if the tag already exists; the second workflow fails and can be re-run. Acceptable for low-traffic repos.
- When a PR is open, pushing to the branch triggers both `alpha.yml` (on `push`) and `beta.yml` (on `pull_request` sync) for the same commit — the alpha build is redundant since beta already covers it. Potential optimization: skip alpha when an open PR exists from the current branch using `gh pr list --head "${{ github.ref_name }}" --state open`. Not yet implemented.

## npm dependency gotchas (2026-04-25)

- `uuid` v14 is ESM-only — breaks jsii projects which output CommonJS (`require()` calls fail with TS1479). Fix: pin to `uuid@^9.0.0`, the last CJS-compatible version. The `v5()` and `v5.DNS` APIs are identical between v9 and v14, so no code changes needed in `lib/cloudfront-for-lambda/cloudfront-for-lambda.ts`. General rule: in jsii construct libraries, always verify new major versions of dependencies haven't dropped CJS support before upgrading.
- `uuid` v14 bundles its own TypeScript declarations, but v9 does not. Downgrading from v14 to v9 causes `TS7016: Could not find a declaration file for module 'uuid'` at jsii compile time. Fix: `npm i --save-dev @types/uuid`. Easy to miss because the TS1479 ESM error gets fixed first, then this surfaces on the next `jsii` run.
- `target` vs `module` in `tsconfig.json`: `target: "ES2022"` controls output syntax (arrow functions, optional chaining), but `module: "Node16"` controls the module system (CJS vs ESM). With `module: "Node16"`, TypeScript checks `package.json` for `"type": "module"` — absent means CommonJS, so it emits `require()`. jsii doesn't support ESM packages, so `"type": "module"` can't be added — all jsii construct libraries are locked to CJS regardless of `target`.
- jsii strict tsconfig validation (`JSII4000`) only allows `module` values `"node16"` or `"commonjs"`. Setting `"node20"`, `"esnext"`, or any other value causes `jsii` to fail with `[typescript-config/invalid-tsconfig]`. This is enforced by `jsii`'s `validateTsconfig: "strict"` in `package.json`. Don't try to work around the CJS constraint by changing `module` — jsii will block it at compile time.
- jsii `JSII6` / `metadata/missing-dev-dependency` warning: jsii requires `devDependencies` to be pinned to the **exact minimum version** of the corresponding `peerDependencies` range. The check in `node_modules/jsii/lib/project-info.js` is `devDependencies[name] !== semver.minVersion(range).raw`. So `"aws-cdk-lib": "^2.212.0"` in peerDeps requires `"aws-cdk-lib": "2.212.0"` (not `"2.250.0"`, not `"^2.212.0"`) in devDeps. Same for `"constructs": "^10.4.2"` → `"constructs": "10.4.2"`. This ensures tests run against the lowest version consumers might use. Matching ranges or pinning to a higher version both trigger the warning.

## Linting tool quirks (2026-04-25)

- `oxlint` renamed its config field from `"ignore"` to `"ignorePatterns"` in `.oxlintrc.json`. Using the old `"ignore"` field causes `Failed to parse config with error Error("unknown field 'ignore'...")`. The valid fields are: `$schema`, `plugins`, `jsPlugins`, `categories`, `rules`, `settings`, `env`, `globals`, `overrides`, `options`, `ignorePatterns`, `extends`.
- `awslint` `exclude` array in `.awslint.json` does **not** filter out errors from `aws-cdk-lib` transitive types (e.g., `prefer-ref-interface:aws-cdk-lib.aws_s3.IBucketNotificationDestination.bind.bucket`). Neither glob patterns (`"*:aws-cdk-lib.*"`) nor exact error codes work in the config file for these. The `awslint` section in `package.json` also has an `exclude` array but it's equally ignored for these transitive type errors. Two working alternatives: (1) CLI `-x` flag: `awslint -x "prefer-ref-interface:aws-cdk-lib*"` in the `lint:aws` script, or (2) disable the rule entirely via `"prefer-ref-interface": false` in the `rules` section of `.awslint.json`. Option 2 is cleaner but loses the check on your own props (mitigated by keeping `[disable-awslint:prefer-ref-interface]` JSDoc tags as documentation of intent).
- `awslint` `[disable-awslint:prefer-ref-interface]` JSDoc tags work for your own construct props (e.g., `CloudFrontForLambdaProps.certificate`, `S3BackupProps.centralBackupBucket`) but only after rebuilding the `.jsii` assembly with `npx jsii`. awslint reads from `.jsii`, not source — stale assemblies mean JSDoc changes have no effect.
- `awslint`'s `prefer-ref-interface` rule is a CDK team internal convention, not relevant to third-party construct libraries. It existed because CDK v1 was split into many packages (`@aws-cdk/aws-s3`, `@aws-cdk/aws-lambda`, etc.) and L1 ref interfaces (`IxxxRef`) avoided hard cross-package dependencies. CDK v2 consolidated everything into `aws-cdk-lib`, making this moot. For third-party L2/L3 constructs, accepting `IBucket`/`ICertificate`/`IParameter` is the standard and correct approach — disabling this rule is the right call.

## TypeScript strict mode gotchas (2026-04-25)

- In strict mode (`strict: true` in `tsconfig.json`), `catch` clause variables are typed as `unknown`, not `any`. Accessing `error.message` directly in a `catch (error) {}` block causes a type error. Fix: cast with `(error as Error).message`. This surfaced in `test/cloudfront-for-lambda.test.ts` line 1219 inside a `vm.runInContext` try/catch. Easy to miss because many older TS codebases had `"useUnknownInCatchVariables": false` or didn't enable `strict`.

## npm packaging gotchas (2026-04-25)

- `.npmignore` in this repo excludes `dist` (the jsii output directory referenced by `"main": "dist/index.js"` in `package.json`). Later `!.jsii` re-include rules don't undo the `dist` exclusion. Result: `npm pack` produces a tarball with no compiled code — consumers get an empty package. `.npmignore` rule ordering: later rules override earlier ones only for the *same path*, not for parent directories. If `dist` is excluded, files under `dist/` are also excluded regardless of later `!dist/**/*` rules. Fix: remove the `dist` line entirely since `"files"` in `package.json` already controls inclusion (`"files": ["dist/**/*", ".jsii"]`). When both `.npmignore` and `"files"` exist, `.npmignore` takes precedence — `"files"` is ignored.
- `"clean": "rm -rf dist/ lib/ .jsii *.tgz"` in `package.json` deletes the `lib/` source directory (construct source code lives in `lib/`). Should only clean build outputs: `dist/`, `.jsii`, `*.tgz`. The `lib/` directory is `rootDir` in `tsconfig.json`, not a build artifact.

## CDK API deprecations (2026-04-25)

- `acm.DnsValidatedCertificate` is deprecated in aws-cdk-lib. Used in `getCertificate()` in `lib/cloudfront-for-lambda/cloudfront-for-lambda.ts` line 322. The replacement `acm.Certificate` with `validation: acm.CertificateValidation.fromDns(hostedZone)` does **not** support the `region` parameter — it creates the certificate in the stack's region. For CloudFront distributions (which require certs in `us-east-1`), the only clean alternatives are: (1) require users to pass a pre-created `us-east-1` certificate via the `certificate` prop, (2) use a cross-region custom resource, or (3) keep using the deprecated API and accept the warning until CDK provides a built-in cross-region certificate construct. The deprecated API still works — it's just flagged. Open CDK feature request: https://github.com/aws/aws-cdk/issues/25343 (open since 2023, no resolution). Decision: ride it out — the API won't be removed until CDK v3 at earliest, and the `certificate` prop already gives users an escape hatch to avoid the deprecation warning by passing their own us-east-1 cert.

## Release readiness checklist (2026-04-25)

When preparing `cdk-utility-constructs` for release, verify:
- `package.json` `"description"` is not empty (npm/Construct Hub display)
- `package.json` `"repository.url"` is not empty (npm links to repo)
- `.npmignore` does not exclude `dist/` (the compiled output directory)
- `"clean"` script does not delete `lib/` (source code)
- README props tables match actual exported interfaces (e.g., `CloudFrontForLambdaProps` lists `certificate`, `useWildcardCertificate`, `wildcardCertificateArn`, `allowDirectAccess`, `allowedMethods`, `geoRestriction` — not stale names like `sslCertificateArn` or `publicZone`)
- `lambdaFunction` prop type is `lambda.Function` (concrete class, needed for `.timeout`), not `lambda.IFunction` — README should match
- No dev-only comments left in shipped source (e.g., `/* Suggestions: ... */` at bottom of `cloudfront-for-lambda.ts`)
- JSDoc on all exported interface properties matches the property's purpose (e.g., `DomainConfig.domainName` JSDoc was a copy of the interface-level doc, not a property description)
