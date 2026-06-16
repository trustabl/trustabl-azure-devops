# Trustabl — Azure DevOps Extension

An Azure Pipelines task that runs [trustabl](https://github.com/trustabl/trustabl),
the static reliability/safety analyzer for AI agent repos (Claude Agent SDK,
OpenAI Agents SDK, Google ADK, MCP).

> **⚠️ Proprietary — not open source.** This extension is licensed for **use only**
> (install it and reference the task in your pipelines). Copying, forking,
> modifying, or redistributing the source is **not** permitted. See [`LICENSE`](LICENSE).

## Capabilities

- Downloads the official `trustabl` release binary (Linux / Windows / macOS agents).
- Scans your sources for tools, agents, subagents, and MCP servers.
- Computes a **readiness** score and its inverse **risk** score.
- **Fails the build** on a risk-score or severity threshold (both optional).
- Publishes `trustabl.json` + `trustabl.sarif` as a **pipeline artifact**.
- Uploads a markdown **run summary** and prints a console report.
- Exposes **output variables** (readiness, risk, severity, findings count, exit code).
- Optionally runs **AI enrichment** on findings (explanations + suggested fixes), published as `enriched.json`.

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
      enrich: false                       # run AI enrichment on findings (explanations + suggested fixes)
      llmProvider: anthropic              # LLM provider for enrichment (currently only 'anthropic')
      llmKey: $(ANTHROPIC_API_KEY)        # API key for the LLM provider (BYOK); required when enrich is true
      enrichModel: ''                     # Claude model for enrichment (empty = trustabl binary default)
      enrichRules: ''                     # comma-separated rule IDs to enrich; empty = all findings
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

## Enrich

Optionally run AI enrichment on findings — generates plain-language explanations and
suggested fixes for each finding, written to `enriched.json` and published alongside
the scan results (when `publishArtifact` is true).

Requires your own LLM API key (BYOK — bring your own key). Currently supports Anthropic.

```yaml
steps:
  - task: Trustabl@0
    inputs:
      enrich: true
      llmKey: $(ANTHROPIC_API_KEY)   # pipeline secret variable
```

Narrow enrichment to specific rules, or pin a non-default model:

```yaml
steps:
  - task: Trustabl@0
    inputs:
      enrich: true
      llmKey: $(ANTHROPIC_API_KEY)
      enrichModel: claude-sonnet-4-6
      enrichRules: ADK-201,ADK-105
```

Enrich is best-effort: if it fails (bad key, rate limit, etc.) it logs a warning and the
scan/gate results are unaffected.

> Enrich only generates explanations and suggested fixes — it does not modify source files
> or open pull requests.

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
| `rulesRepo` | _(default)_ | Override `trustabl-rules` source repo (sets `TRUSTABL_RULES_REPO`). |
| `githubToken` | _(none)_ | Optional bearer token to avoid the anonymous GitHub API rate limit on version resolution + download. Pass a secret, e.g. `$(GITHUB_TOKEN)`. |
| `enrich` | `false` | Run AI enrichment on findings (explanations + suggested fixes). Requires `llmKey`. |
| `llmProvider` | `anthropic` | LLM provider for enrichment. Currently only `anthropic`. |
| `llmKey` | _(none)_ | API key for the LLM provider (BYOK). Required when `enrich` is true. Pass a secret, e.g. `$(ANTHROPIC_API_KEY)`. |
| `enrichModel` | _(default)_ | Claude model for enrichment (e.g. `claude-sonnet-4-6`). Empty = trustabl binary default. |
| `enrichRules` | _(all)_ | Comma-separated rule IDs to enrich (e.g. `ADK-201,ADK-105`). Empty = all findings. |

## Output variables

| Variable | Description |
|---|---|
| `readinessScore` | Integer percent [0,100], higher = better. |
| `riskScore` | `100 - readiness`. Integer [0,100], higher = worse. |
| `maxSeverity` | Highest severity among findings, or `none`. |
| `findingsCount` | Total finding count. |
| `exitCode` | trustabl native exit code (0 / 1 / 2). |
| `enrichJsonFile` | Path to `enriched.json` (when `enrich` is true), empty otherwise. |

## Building from source

```bash
cd Trustabl
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsc → emits index.js next to task.json
```

Package the extension (needs `tfx-cli`):

```bash
npm i -g tfx-cli
tfx extension create --manifest-globs vss-extension.json
```

Upload the resulting `.vsix` to the Visual Studio Marketplace, then install it on
your Azure DevOps organization.
