# Changelog

All notable changes to this Azure DevOps extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.1.0] — 2026-06-04

First release. Azure DevOps pipeline task port of the
[`trustabl/actions`](https://github.com/trustabl/actions) GitHub Action and the
GitLab CI/CD component — runs the
[trustabl](https://github.com/trustabl/trustabl) static analyzer against any
agent-SDK repository (Claude Agent SDK, OpenAI Agents SDK, Google ADK, MCP) and
gates the pipeline on readiness, risk, or severity thresholds.

**License:** proprietary — see [`LICENSE`](LICENSE). Install and reference the task
in your pipelines; copying, modification, forking, and redistribution are not
permitted. This extension is **not** open source.

### Added

- **`Trustabl` pipeline task** (Node20, TypeScript + `azure-pipelines-task-lib`)
  packaged as a Visual Studio Marketplace extension (`vss-extension.json`).
- **Binary install** — resolves `latest` (or a pinned tag) via the GitHub API,
  detects OS/arch (`process.platform`/`process.arch`), downloads the release asset
  with `curl`, extracts with `tar`. Optional `githubToken` bearer to dodge the
  anonymous GitHub API rate limit.
- **Scoring ported verbatim** from the GitHub Action: readiness (`overall_score`
  ×100), risk (`100 − readiness`), max severity, per-severity counts, and the
  projected-headroom ladder (re-applies trustabl's own formula).
- **Risk-score gate** (`riskScoreThreshold`) and **severity gate**
  (`severityThreshold`) → `tl.setResult(Failed)`. Both default off.
- **Output variables** — `readinessScore`, `riskScore`, `maxSeverity`,
  `findingsCount`, `exitCode` (consumed downstream as `$(<ref>.<var>)`).
- **Run summary** — markdown uploaded via `tl.uploadSummary` (Azure's analog of
  the GitHub step summary), plus a console report.
- **Artifacts** — `trustabl.json` + `trustabl.sarif` published via the
  `artifact.upload` command, gated by `publishArtifact` / `artifactName`.
- **CI publish workflow** (`.github/workflows/publish-extension.yml`) — pushing a
  semver tag (`vX.Y.Z`) stamps the version into both manifests, packages the
  `.vsix`, publishes to the Marketplace via `tfx`, and attaches the `.vsix` to a
  GitHub Release.
- **Proprietary license** from the first commit.

### Notes

- Azure has no native SARIF/SAST security widget, so SARIF is a plain artifact
  (the GitLab component's `gl-sast-report.json` integration has no Azure analog).
- Projected scores are an estimate, not a re-scan — treat as guidance.

### Compatibility

- Runs on Microsoft-hosted Linux, Windows, and macOS agents (needs `curl` + `tar`).
- Requires the trustabl release assets on GitHub (downloaded at task run time).

[0.1.0]: https://github.com/trustabl/trustabl-azure-devops/releases/tag/0.1.0
