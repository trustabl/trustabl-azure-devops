# Trustabl

Runs [trustabl](https://github.com/trustabl/trustabl) — the static
reliability/safety analyzer for AI agent repos (Claude Agent SDK, OpenAI Agents
SDK, Google ADK, MCP) — as an Azure Pipelines task.

## Capabilities

- Scans your sources for tools, agents, subagents, and MCP servers.
- Computes a **readiness** score and its inverse **risk** score.
- **Fails the build** on a risk-score or severity threshold (both optional).
- Publishes `trustabl.json` + `trustabl.sarif` as a **pipeline artifact**.
- Uploads a markdown **run summary** and prints a console report.
- Exposes **output variables** (readiness, risk, severity, findings count, exit code).
- Runs on Microsoft-hosted Linux, Windows, and macOS agents.

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

### Full example (annotated)

Every input shown with its default and purpose:

```yaml
steps:
  - task: Trustabl@0
    name: trustabl                        # ref name → read outputs as $(trustabl.<var>)
    inputs:
      target: $(Build.SourcesDirectory)   # path or GitHub URL to scan
      version: latest                     # trustabl release tag (e.g. v0.5.0) or 'latest'
      detectors: ''                       # subset: claude_sdk,openai_sdk,google_adk — empty = all
      strict: false                       # --strict: fail on ANY finding, regardless of severity
      riskScoreThreshold: '0'             # fail when risk (100 - readiness) >= N (1-100); 0 = off
      severityThreshold: none             # fail at >= none | low | medium | high | critical
      publishArtifact: true               # upload trustabl.json + trustabl.sarif as an artifact
      artifactName: trustabl-scan-results # name of that artifact
      sarifFile: trustabl.sarif           # SARIF output path
      jsonFile: trustabl.json             # JSON ScanResult output path
      rulesRef: ''                        # pin a trustabl-rules git ref (empty = default)
      rulesRepo: ''                       # override trustabl-rules source repo (empty = default)
      githubToken: $(GITHUB_TOKEN)        # optional secret to dodge the GitHub API rate limit
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

---

© Trustabl. Licensed for use only — see the License tab. Not open source.
