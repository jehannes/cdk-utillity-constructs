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
