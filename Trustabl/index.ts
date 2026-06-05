/*
 * Trustabl — Azure DevOps pipeline task.
 *
 * Azure analog of the trustabl GitHub Action / GitLab CI/CD component. Downloads
 * the trustabl release binary, scans the target, computes the readiness/risk
 * score, gates the build on risk/severity thresholds, publishes JSON + SARIF
 * artifacts, and uploads a markdown run summary.
 *
 * Proprietary — see LICENSE. Not open source.
 */

import tl = require('azure-pipelines-task-lib/task');
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---- types (subset of the trustabl JSON ScanResult we read) ----
interface Finding { severity?: string; tool_name?: string; confidence?: number; }
interface Readiness { tool_name?: string; weighted_severity?: number; }
interface ScanResult { overall_score?: number; findings?: Finding[]; readiness?: Readiness[]; }

// ---- scoring (ported verbatim from the GitHub Action's bash/jq/awk) ----
function severityWeight(s: string): number {
  return s === 'critical' ? 1.0 : s === 'high' ? 0.7 : s === 'medium' ? 0.4 : s === 'low' ? 0.15 : 0.05;
}
function sevRank(s: string): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : s === 'info' ? 0 : -1;
}
// Per-tool weight removed when the given severities are "resolved".
function removed(findings: Finding[], rm: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const f of findings) {
    if (f.severity && rm.indexOf(f.severity) >= 0) {
      const t = f.tool_name || '?';
      m[t] = (m[t] || 0) + severityWeight(f.severity) * (typeof f.confidence === 'number' ? f.confidence : 0);
    }
  }
  return m;
}
// Re-apply trustabl's own scoring with `rm` severities resolved → projected readiness [0,1].
function projected(readiness: Readiness[], findings: Finding[], rm: string[]): number {
  const r = removed(findings, rm);
  if (!readiness || readiness.length === 0) return 1;
  let min = Infinity;
  for (const e of readiness) {
    let w = (typeof e.weighted_severity === 'number' ? e.weighted_severity : 0) - (r[e.tool_name || '?'] || 0);
    if (w < 0) w = 0;
    let s = 1 - w / 3.0;
    if (s < 0) s = 0;
    if (s < min) min = s;
  }
  return min === Infinity ? 1 : min;
}
const p100 = (x: number): number => Math.floor(x * 100 + 0.5);
const clampScore = (x: number): number => (x < 0 ? 0 : x > 100 ? 100 : x);

// ---- run a tool, capture stdout + exit code (never throws on nonzero) ----
function capture(tool: string, args: string[], env?: NodeJS.ProcessEnv): { code: number; stdout: string } {
  const res = tl.execSync(tool, args, { silent: true, ignoreReturnCode: true, env } as any);
  return { code: res.code, stdout: res.stdout || '' };
}

async function run(): Promise<void> {
  try {
    // ---- inputs ----
    const target = tl.getInput('target', false) || tl.getVariable('Build.SourcesDirectory') || '.';
    const version = tl.getInput('version', false) || 'latest';
    const detectors = tl.getInput('detectors', false) || '';
    const strict = tl.getBoolInput('strict', false);
    const rulesRef = tl.getInput('rulesRef', false) || '';
    const rulesRepo = tl.getInput('rulesRepo', false) || '';
    const sarifFile = tl.getInput('sarifFile', false) || 'trustabl.sarif';
    const jsonFile = tl.getInput('jsonFile', false) || 'trustabl.json';
    const rst = parseInt(tl.getInput('riskScoreThreshold', false) || '0', 10) || 0;
    const st = (tl.getInput('severityThreshold', false) || 'none').toLowerCase();
    const publishArtifact = tl.getBoolInput('publishArtifact', false);
    const artifactName = tl.getInput('artifactName', false) || 'trustabl-scan-results';
    const githubToken = tl.getInput('githubToken', false) || process.env['GITHUB_TOKEN'] || '';

    const authHeader = githubToken ? ['-H', `Authorization: Bearer ${githubToken}`] : [];

    // ---- resolve version ----
    let ver = version;
    if (ver === 'latest') {
      const api = capture('curl', ['-sSL', ...authHeader, 'https://api.github.com/repos/trustabl/trustabl/releases/latest']);
      try { ver = JSON.parse(api.stdout).tag_name; } catch { ver = ''; }
      if (!ver) {
        tl.setResult(tl.TaskResult.Failed, "Could not resolve trustabl version. Pin 'version' to a tag, or set a GitHub token.");
        return;
      }
    }
    const vnum = ver.replace(/^v/, '');
    tl.debug(`trustabl version: ${ver}`);

    // ---- detect OS/arch, install binary ----
    const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const ext = osName === 'windows' ? 'zip' : 'tar.gz';
    const asset = `trustabl_${vnum}_${osName}_${arch}.${ext}`;
    const dest = path.join(tl.getVariable('Agent.TempDirectory') || os.tmpdir(), 'trustabl-bin');
    tl.mkdirP(dest);
    const archivePath = path.join(dest, asset);
    const url = `https://github.com/trustabl/trustabl/releases/download/${ver}/${asset}`;

    const dl = capture('curl', ['-fSL', '-H', 'Accept: application/octet-stream', ...authHeader, '-o', archivePath, url]);
    if (dl.code !== 0) {
      tl.setResult(tl.TaskResult.Failed, `Failed to download ${asset} from ${url}`);
      return;
    }
    // bsdtar (Windows 10+) extracts zip; gnu tar extracts tar.gz.
    const untar = capture('tar', ['-xf', archivePath, '-C', dest]);
    if (untar.code !== 0) {
      tl.setResult(tl.TaskResult.Failed, `Failed to extract ${asset}`);
      return;
    }
    const exe = path.join(dest, osName === 'windows' ? 'trustabl.exe' : 'trustabl');

    // ---- scan ----
    const env = { ...process.env };
    if (rulesRepo) env['TRUSTABL_RULES_REPO'] = rulesRepo;

    const baseArgs = ['scan', target];
    if (detectors) baseArgs.push('--detectors', detectors);
    if (strict) baseArgs.push('--strict');
    if (rulesRef) baseArgs.push('--rules-ref', rulesRef);

    // Run 1: SARIF
    const sarif = capture(exe, [...baseArgs, '--format', 'sarif'], env);
    fs.writeFileSync(sarifFile, sarif.stdout);
    const nativeCode = sarif.code;

    // Run 2: JSON (drives metrics + gates)
    const jsonRes = capture(exe, [...baseArgs, '--format', 'json'], env);
    fs.writeFileSync(jsonFile, jsonRes.stdout);
    let data: ScanResult = {};
    try { data = JSON.parse(jsonRes.stdout || '{}'); } catch { data = {}; }

    const findings = data.findings || [];
    const readiness = data.readiness || [];
    const sevs = findings.map((f) => f.severity || '');
    const count = sevs.length;
    const cnt = (s: string) => sevs.filter((x) => x === s).length;
    const sevCrit = cnt('critical'), sevHigh = cnt('high'), sevMed = cnt('medium'), sevLow = cnt('low'), sevInfo = cnt('info');

    const raw = typeof data.overall_score === 'number' ? data.overall_score : 1;
    const score = clampScore(Math.round(raw * 100));
    const risk = 100 - score;

    let maxSev: string;
    if (count === 0) maxSev = 'none';
    else if (sevs.indexOf('critical') >= 0) maxSev = 'critical';
    else if (sevs.indexOf('high') >= 0) maxSev = 'high';
    else if (sevs.indexOf('medium') >= 0) maxSev = 'medium';
    else if (sevs.indexOf('low') >= 0) maxSev = 'low';
    else maxSev = 'info';

    // projection ladder
    const pCrit = p100(projected(readiness, findings, ['critical']));
    const pCh = p100(projected(readiness, findings, ['critical', 'high']));
    const pChm = p100(projected(readiness, findings, ['critical', 'high', 'medium']));
    const pChml = p100(projected(readiness, findings, ['critical', 'high', 'medium', 'low']));
    const pAll = p100(projected(readiness, findings, ['critical', 'high', 'medium', 'low', 'info']));
    const dAll = pAll - score;

    // ---- output variables ----
    tl.setVariable('readinessScore', String(score), false, true);
    tl.setVariable('riskScore', String(risk), false, true);
    tl.setVariable('maxSeverity', maxSev, false, true);
    tl.setVariable('findingsCount', String(count), false, true);
    tl.setVariable('exitCode', String(nativeCode), false, true);

    // ---- console report ----
    const repo = tl.getVariable('Build.Repository.Name') || target;
    console.log('');
    console.log('================ TRUSTABL SCAN REPORT ================');
    console.log(`Repository      : ${repo}`);
    console.log(`Readiness       : ${score} / 100   (projected all-fixed: ${pAll}, +${dAll})`);
    console.log(`Risk            : ${risk} / 100`);
    console.log(`Findings        : ${count}   (critical ${sevCrit}, high ${sevHigh}, medium ${sevMed}, low ${sevLow}, info ${sevInfo})`);
    console.log(`Max severity    : ${maxSev}`);
    console.log(`Native exit     : ${nativeCode}`);
    console.log('-----------------------------------------------------');
    console.log(`Fix critical    : ${score} -> ${pCrit}`);
    console.log(`Fix +high       : ${pCrit} -> ${pCh}`);
    console.log(`Fix +medium     : ${pCh} -> ${pChm}`);
    console.log(`Fix +low        : ${pChm} -> ${pChml}`);
    console.log(`Fix +info       : ${pChml} -> ${pAll}`);
    console.log('=====================================================');
    console.log('');

    // ---- markdown summary (Azure run summary tab) ----
    const md: string[] = [];
    md.push('## Trustabl scan');
    md.push('');
    md.push(`**\`${repo}\` · ${count} findings**`);
    md.push('');
    md.push(`Readiness \`${score}\` → \`${pAll}\` (**+${dAll}**) if all findings resolved`);
    md.push('');
    md.push('| Severity | Count |');
    md.push('|---|---|');
    md.push(`| critical | ${sevCrit} |`);
    md.push(`| high | ${sevHigh} |`);
    md.push(`| medium | ${sevMed} |`);
    md.push(`| low | ${sevLow} |`);
    md.push(`| info | ${sevInfo} |`);
    md.push('');
    md.push('| Metric | Value |');
    md.push('|---|---|');
    md.push(`| Readiness score | \`${score}\` |`);
    md.push(`| Risk score | \`${risk}\` |`);
    md.push(`| Findings | \`${count}\` |`);
    md.push(`| Max severity | \`${maxSev}\` |`);
    md.push(`| Native exit | \`${nativeCode}\` |`);
    md.push('');
    md.push('_Projected score is an estimate from trustabl\'s own formula (listed fixes resolved, nothing new). Not a re-scan._');
    const summaryFile = path.join(tl.getVariable('Agent.TempDirectory') || os.tmpdir(), 'trustabl-summary.md');
    fs.writeFileSync(summaryFile, md.join('\n'));
    tl.uploadSummary(summaryFile);

    // ---- publish artifacts ----
    if (publishArtifact) {
      if (fs.existsSync(jsonFile)) {
        tl.command('artifact.upload', { artifactname: artifactName, containerfolder: artifactName }, path.resolve(jsonFile));
      }
      if (fs.existsSync(sarifFile)) {
        tl.command('artifact.upload', { artifactname: artifactName, containerfolder: artifactName }, path.resolve(sarifFile));
      }
    }

    // ---- gates ----
    let fail = false;
    const reasons: string[] = [];
    if (nativeCode === 2) { fail = true; reasons.push('scanner error (exit 2)'); }
    if (nativeCode === 1) { fail = true; reasons.push('trustabl gated (medium+ or --strict)'); }
    if (rst > 0 && risk >= rst) { fail = true; reasons.push(`risk ${risk} >= threshold ${rst}`); }
    if (st !== 'none' && count > 0 && sevRank(maxSev) >= sevRank(st)) {
      fail = true; reasons.push(`max severity ${maxSev} >= threshold ${st}`);
    }

    if (fail) {
      tl.setResult(tl.TaskResult.Failed, `Failed due to: ${reasons.join('; ')}`);
    } else {
      tl.setResult(tl.TaskResult.Succeeded, 'Successfully passed scanning');
    }
  } catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, `Trustabl task error: ${err && err.message ? err.message : err}`);
  }
}

run();
