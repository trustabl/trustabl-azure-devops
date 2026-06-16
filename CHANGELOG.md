# Changelog

All notable changes to this Azure DevOps extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.2.0] — 2026-06-15

### Added

- **AI enrichment** (`enrich` input) — runs `trustabl enrich` against the JSON scan
  output to generate plain-language explanations and suggested fixes per finding,
  written to `enriched.json`. Bring-your-own-key (BYOK); currently supports
  Anthropic via `llmProvider` / `llmKey`. Optional `enrichModel` and `enrichRules`
  (comma-separated rule IDs) to scope the run. Best-effort — failures log a
  warning and never fail the build.
- **`enrichJsonFile` output variable** — path to `enriched.json` when `enrich` is
  true, empty otherwise.
- `enriched.json` is published alongside `trustabl.json` + `trustabl.sarif` when
  `publishArtifact` is true and `enrich` ran successfully.

### Notes

- This release does not apply suggested fixes to source files or open pull
  requests — it only generates the enrichment report. (No `autoEnrich` /
  `createFixPr` equivalent, unlike `trustabl-action`.)

## [0.1.0] — 2026-06-04

First release. Azure DevOps pipeline task that runs the
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
- **Scoring** — readiness (`overall_score` ×100), risk (`100 − readiness`), max
  severity, per-severity counts, and the projected-headroom ladder (re-applies
  trustabl's own formula).
- **Risk-score gate** (`riskScoreThreshold`) and **severity gate**
  (`severityThreshold`) → `tl.setResult(Failed)`. Both default off.
- **Output variables** — `readinessScore`, `riskScore`, `maxSeverity`,
  `findingsCount`, `exitCode` (consumed downstream as `$(<ref>.<var>)`).
- **Run summary** — markdown uploaded via `tl.uploadSummary`, plus a console
  report.
- **Artifacts** — `trustabl.json` + `trustabl.sarif` published via the
  `artifact.upload` command, gated by `publishArtifact` / `artifactName`.
- **CI publish workflow** (`.github/workflows/publish-extension.yml`) — pushing a
  semver tag (`vX.Y.Z`) stamps the version into both manifests, packages the
  `.vsix`, publishes to the Marketplace via `tfx`, and attaches the `.vsix` to a
  GitHub Release.
- **Proprietary license** from the first commit.

### Notes

- Azure has no native SARIF/SAST security widget, so SARIF is a plain downloadable
  artifact.
- Projected scores are an estimate, not a re-scan — treat as guidance.

### Compatibility

- Runs on Microsoft-hosted Linux, Windows, and macOS agents (needs `curl` + `tar`).
- Requires the trustabl release assets on GitHub (downloaded at task run time).

[0.2.0]: https://github.com/trustabl/trustabl-azure-devops/releases/tag/0.2.0
[0.1.0]: https://github.com/trustabl/trustabl-azure-devops/releases/tag/0.1.0
