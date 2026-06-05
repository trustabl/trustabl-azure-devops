# Trustabl

Runs [trustabl](https://github.com/trustabl/trustabl) — the static
reliability/safety analyzer for AI agent repos (Claude Agent SDK, OpenAI Agents
SDK, Google ADK, MCP) — as an Azure Pipelines task.

The task:
- Scans your sources for tools, agents, subagents, and MCP servers.
- Prints a readiness report and uploads a markdown **run summary**.
- Publishes `trustabl.json` + `trustabl.sarif` as a **pipeline artifact**.
- Exposes output variables (readiness, risk, severity, findings count, exit code).
- Optionally **fails the build** on a risk-score or severity threshold.

## Usage

```yaml
steps:
  - task: Trustabl@0
    inputs:
      severityThreshold: high      # fail on any high/critical finding (optional)
```

Zero-config (scans `$(Build.SourcesDirectory)`, fails only if trustabl itself
flags medium+):

```yaml
steps:
  - task: Trustabl@0
```

### Consuming outputs

Give the step a `name`, then read `$(<name>.<var>)` in later steps:

```yaml
steps:
  - task: Trustabl@0
    name: trustabl
    inputs:
      riskScoreThreshold: "0"      # observe, don't gate
  - script: echo "readiness=$(trustabl.readinessScore) risk=$(trustabl.riskScore) findings=$(trustabl.findingsCount)"
```

## Inputs

| Name | Default | Description |
|---|---|---|
| `target` | `$(Build.SourcesDirectory)` | Path or GitHub URL to scan. |
| `version` | `latest` | trustabl release tag (e.g. `v0.5.0`) or `latest`. |
| `detectors` | _(all)_ | Comma-separated subset: `claude_sdk,openai_sdk,google_adk`. |
| `strict` | `false` | Pass `--strict` (fail on any finding). |
| `riskScoreThreshold` | `0` | Fail when `risk >= N` (1-100). `0` disables. |
| `severityThreshold` | `none` | Fail when any finding `>= severity` (`none`/`low`/`medium`/`high`/`critical`). |
| `publishArtifact` | `true` | Upload `trustabl.json` + `trustabl.sarif` as a pipeline artifact. |
| `artifactName` | `trustabl-scan-results` | Artifact name. |
| `sarifFile` | `trustabl.sarif` | SARIF output path. |
| `jsonFile` | `trustabl.json` | JSON ScanResult output path. |
| `rulesRef` | _(default)_ | Pin a `trustabl-rules` git ref. |
| `rulesRepo` | _(default)_ | Override `trustabl-rules` source repo. |
| `githubToken` | _(none)_ | Optional bearer token to avoid the anonymous GitHub API rate limit on version resolution + download. Pass a secret, e.g. `$(GITHUB_TOKEN)`. |

## Output variables

| Variable | Description |
|---|---|
| `readinessScore` | Integer percent [0,100], higher = better. |
| `riskScore` | `100 - readiness`. Integer [0,100], higher = worse. |
| `maxSeverity` | Highest severity among findings, or `none`. |
| `findingsCount` | Total finding count. |
| `exitCode` | trustabl native exit code (0 / 1 / 2). |

## Notes

- Runs on Microsoft-hosted Linux, Windows, and macOS agents.
- SARIF is published as a downloadable pipeline artifact.

---

© Trustabl. Licensed for use only — see the License tab. Not open source.
