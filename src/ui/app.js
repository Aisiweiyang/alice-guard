"use strict";

const state = { scenarios: [], selected: null, running: false, privyStatus: null, attackCases: [], attackRunning: false };
const byId = (id) => document.getElementById(id);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function showError(message) {
  const banner = byId("error-banner");
  banner.textContent = message;
  banner.hidden = false;
  window.setTimeout(() => { banner.hidden = true; }, 5000);
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || "The local demo rejected the request.");
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

function setBadge(id, text, kind) {
  const badge = byId(id);
  badge.textContent = text;
  badge.className = `${id === "decision-badge" ? "status-badge" : "micro-badge"} ${kind || ""}`.trim();
}

function selectScenario(scenario) {
  state.selected = scenario;
  byId("request-preview").value = scenario.request;
  document.querySelectorAll(".scenario-button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.scenario === scenario.id);
    button.setAttribute("aria-pressed", button.dataset.scenario === scenario.id ? "true" : "false");
  });
}

function renderScenarioButtons() {
  const container = byId("scenario-buttons");
  container.replaceChildren();
  state.scenarios.forEach((scenario, index) => {
    const button = element("button", "scenario-button");
    button.type = "button";
    button.dataset.scenario = scenario.id;
    button.setAttribute("aria-pressed", "false");
    button.append(element("span", "scenario-index", String(index + 1).padStart(2, "0")));
    button.append(element("span", "", scenario.title));
    button.addEventListener("click", () => selectScenario(scenario));
    container.append(button);
  });
  if (state.scenarios[0]) {
    selectScenario(state.scenarios[0]);
    byId("run-button").disabled = false;
  }
}

function renderPipeline(result) {
  const container = byId("pipeline");
  container.replaceChildren();
  const steps = [
    ["intent", "INTENT"],
    ["risk", "RISK"],
    ["policy", "POLICY"],
    ["plan", "PLAN GUARD"],
    ["execution", "EXECUTION"],
  ];
  const ran = {
    intent: result.checks.intentAccepted,
    risk: result.checks.riskEvaluated,
    policy: result.checks.policyEvaluated,
    plan: result.checks.planValidated,
    execution: false,
  };
  steps.forEach(([key, label]) => {
    const item = element("div", "pipeline-step", label);
    if (ran[key]) item.classList.add("ran");
    if (result.status === "denied" && result.stoppedAt === key) item.classList.add("stopped");
    container.append(item);
  });
}

function renderIntent(intent) {
  const container = byId("intent-content");
  container.replaceChildren();
  if (!intent) {
    container.className = "empty-state";
    container.textContent = "Rejected before a trusted intent was created.";
    setBadge("intent-state", "REJECTED", "deny");
    return;
  }
  container.className = "";
  const list = element("dl", "definition-grid");
  [["Action", intent.action], ["Input", `${intent.amountIn} ${intent.assetIn}`], ["Output", intent.assetOut], ["Max slippage", `${intent.maxSlippageBps} bps`]].forEach(([label, value]) => {
    list.append(element("dt", "", label), element("dd", "", value));
  });
  container.append(list);
  setBadge("intent-state", "VALID", "allow");
}

function reasonList(reasons) {
  const list = element("ul", "reason-list");
  reasons.forEach((reason) => {
    const item = element("li", "reason-item");
    item.append(element("code", "", reason.code), element("span", "", reason.severity || "rule"));
    item.title = reason.message;
    list.append(item);
  });
  return list;
}

function renderRisk(risk) {
  const container = byId("risk-content");
  container.replaceChildren();
  if (!risk) {
    container.className = "empty-state";
    container.textContent = "Not executed — the request stopped earlier.";
    setBadge("risk-level", "NOT RUN", "");
    return;
  }
  container.className = "";
  const score = element("div", "risk-score");
  score.append(element("strong", "", risk.score), element("span", "", "/ 100"));
  const meter = element("div", "risk-meter");
  meter.style.setProperty("--score", String(risk.score));
  meter.append(element("span"));
  container.append(score, meter, reasonList(risk.reasons));
  setBadge("risk-level", risk.level.toUpperCase(), risk.level === "low" ? "allow" : risk.level === "medium" ? "approval" : "deny");
}

function renderPolicy(policy) {
  const container = byId("policy-content");
  container.replaceChildren();
  if (!policy) {
    container.className = "empty-state";
    container.textContent = "Not executed — no policy decision was requested.";
    setBadge("policy-state", "NOT RUN", "");
    return;
  }
  container.className = "policy-scroll";
  const list = element("ul", "trace-list");
  policy.trace.forEach((trace) => {
    const item = element("li", "trace-item");
    item.append(element("code", "", trace.ruleId), element("span", `trace-outcome ${trace.outcome}`, trace.outcome.toUpperCase()));
    list.append(item);
  });
  container.append(reasonList(policy.reasons), list);
  setBadge("policy-state", policy.decision.toUpperCase(), policy.decision === "allow" ? "allow" : policy.decision === "deny" ? "deny" : "approval");
}

function addHash(container, label, value) {
  const block = element("div", "hash-block");
  block.append(element("span", "", label), element("code", "", value || "GENESIS / NONE"));
  container.append(block);
}

function renderPrivyStatus(status) {
  const container = byId("live-privy-content");
  container.replaceChildren();
  state.privyStatus = status;
  if (!status || status.status === "NOT_CONFIGURED" || !status.wallet || !status.policy) {
    container.className = "empty-state";
    container.textContent = "Live Privy status is disabled. The deterministic decision demo remains available.";
    setBadge("live-privy-state", "NOT CONFIGURED", "approval");
    byId("runtime-mode").textContent = "OFFLINE DECISION DEMO";
    byId("wallet-runtime").textContent = "WALLET STATUS OFF";
    return;
  }

  container.className = "";
  const checks = element("div", "live-check-grid");
  [
    ["PUBLIC STATE", status.liveChecks.publicState],
    ["PRIVY BINDING", status.liveChecks.remoteBinding],
    ["MONAD BALANCE", status.liveChecks.onchainBalances],
  ].forEach(([label, value]) => {
    const item = element("div", "live-check-item");
    item.append(element("span", "", label), element("strong", value === "MATCHED" ? "allow-text" : "warning-text", value));
    checks.append(item);
  });
  const details = element("dl", "definition-grid live-definition-grid");
  const nativeBalance = status.balances ? `${status.balances.nativeBalanceRaw} wei MON` : "UNAVAILABLE";
  const tokenBalance = status.balances ? `${status.balances.tokenBalanceRaw} base units USDC` : "UNAVAILABLE";
  [
    ["Wallet", status.wallet.address],
    ["Policy ID", status.policy.id],
    ["Policy bound", status.policy.bound === true ? "YES" : status.policy.bound === false ? "NO" : "UNKNOWN"],
    ["Owner matched", status.policy.ownerMatched === true ? "YES" : status.policy.ownerMatched === false ? "NO" : "UNKNOWN"],
    ["MON balance", nativeBalance],
    ["USDC balance", tokenBalance],
  ].forEach(([label, value]) => details.append(element("dt", "", label), element("dd", "", value)));
  addHash(container, "LIVE POLICY HASH", status.policy.observedHash || status.policy.expectedHash);
  container.append(checks, details);
  if (/^0x[0-9a-fA-F]{40}$/.test(status.wallet.address)) {
    const link = element("a", "explorer-link", "View wallet on MonadVision ↗");
    link.href = `https://testnet.monadvision.com/address/${status.wallet.address}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(link);
  }
  container.append(element("p", "policy-mode-note", `Checked ${new Date(status.checkedAt).toLocaleString()} · read-only evidence`));

  const verified = status.status === "VERIFIED";
  setBadge("live-privy-state", status.status, verified ? "allow" : "deny");
  byId("runtime-mode").textContent = verified ? "LIVE POLICY VERIFIED" : "LIVE STATUS DEGRADED";
  byId("runtime-mode").classList.toggle("live", verified);
  byId("mode-dot").classList.toggle("live", verified);
  byId("wallet-runtime").textContent = status.capabilities.walletProvisioned ? "WALLET PROVISIONED" : "WALLET NOT PROVISIONED";
}

function renderPlan(plan) {
  const container = byId("plan-content");
  container.replaceChildren();
  if (!plan) {
    container.className = "empty-state";
    container.textContent = "No transaction plan created. The guard stopped safely.";
    setBadge("plan-state", "NOT CREATED", "deny");
    return;
  }
  container.className = "";
  addHash(container, "PLAN HASH", plan.planHash);
  const list = element("ol", "transaction-list");
  plan.transactions.forEach((transaction) => {
    const item = element("li", "transaction-item");
    const top = element("div", "transaction-top");
    top.append(element("span", "", `0${transaction.sequence + 1} · ${transaction.purpose}`), element("span", "", "VALIDATED"));
    const meta = element("div", "transaction-meta");
    [["target", transaction.target], ["amount raw", transaction.amountRaw], ["gas limit", transaction.gasLimit]]
      .concat(transaction.spender ? [["spender", transaction.spender]] : [])
      .concat(transaction.market ? [["market", transaction.market]] : [])
      .concat(transaction.minAmountOutRaw ? [["min output", transaction.minAmountOutRaw]] : [])
      .forEach(([label, value]) => meta.append(element("span", "", label), element("span", "", value)));
    item.append(top, element("p", "", transaction.explanation), meta);
    list.append(item);
  });
  container.append(list);
  setBadge("plan-state", `${plan.transactionCount} VALIDATED`, "allow");
}

function renderWalletPolicy(walletPolicy) {
  const container = byId("wallet-policy-content");
  container.replaceChildren();
  container.className = "";
  addHash(container, "WALLET POLICY HASH", walletPolicy.walletPolicyHash);
  container.append(element(
    "p",
    "policy-mode-note",
    "This decision trace uses the committed local manifest. Live read-only Privy binding evidence is shown above.",
  ));
  const list = element("ul", "coverage-list");
  walletPolicy.coverage.forEach((entry) => {
    const item = element("li", "coverage-item");
    item.append(element("code", "", entry.rule), element("span", entry.enforcement === "PRIVY_ENFORCED" ? "coverage-privy" : "coverage-app", entry.enforcement));
    list.append(item);
  });
  container.append(list);
  const kind = walletPolicy.status === "MATCHED" ? "allow" : walletPolicy.status === "DRIFTED" ? "deny" : "approval";
  const label = walletPolicy.status === "NOT_CONFIGURED" ? "LOCAL MANIFEST" : walletPolicy.status.replace("_", " ");
  setBadge("wallet-policy-state", label, kind);
}

function renderAudit(audit) {
  const container = byId("audit-content");
  container.replaceChildren();
  container.className = "";
  addHash(container, "AUDIT HASH", audit.auditHash);
  addHash(container, "PREVIOUS HASH", audit.previousAuditHash);
  const list = element("ul", "event-list");
  audit.events.forEach((event) => {
    const item = element("li", "event-item");
    item.append(element("code", "", event.type), element("span", "", event.safeSummary));
    list.append(item);
  });
  container.append(list);
  setBadge("audit-state", audit.chainValid ? "CHAIN VALID" : "CHAIN INVALID", audit.chainValid ? "allow" : "deny");
}

function definitionList(entries, className = "definition-grid") {
  const list = element("dl", className);
  entries.forEach(([label, value]) => list.append(element("dt", "", label), element("dd", "", value ?? "NOT PRESENT")));
  return list;
}

function codeList(codes) {
  const list = element("ul", "code-list");
  codes.forEach((code) => list.append(element("li", "", code)));
  return list;
}

function renderProof(proof) {
  const container = byId("proof-content");
  container.replaceChildren();
  if (!proof?.capsule) {
    container.className = "empty-state";
    container.textContent = "No Decision Capsule is available for this result. No execution authorization was issued.";
    setBadge("proof-state", "NO CAPSULE", "approval");
    return;
  }
  if (proof.verification?.executionAuthorized !== false || typeof proof.verification.ok !== "boolean" || !Array.isArray(proof.verification.reasonCodes) || proof.capsule.attestation?.status !== "UNATTESTED") {
    container.className = "empty-state";
    container.textContent = "Unexpected proof capability state. This demo cannot display it as an authorized action.";
    setBadge("proof-state", "UNAVAILABLE", "deny");
    return;
  }
  container.className = "proof-content";
  const capsule = proof.capsule;
  const flow = element("ol", "proof-flow");
  ["Request", "Evidence sources", "Structured intent", "Risk facts", "Policy decision", "Decision Capsule", "Exact plan", "Wallet coverage", "Execution OFF", "Audit chain"]
    .forEach((label) => flow.append(element("li", "", label)));
  container.append(flow);
  const grid = element("div", "proof-grid");
  const summary = element("article", "data-card capsule-summary");
  summary.append(element("h3", "proof-card-heading", "Decision Capsule"));
  const verdictKind = capsule.verdict === "ALLOW" ? "allow" : capsule.verdict === "DENY" ? "deny" : "approval";
  const labels = element("div", "capsule-labels");
  labels.append(element("span", `micro-badge ${verdictKind}`, capsule.verdict), element("span", "micro-badge approval", "UNATTESTED"), element("span", "micro-badge", "PROPOSE_ONLY"));
  summary.append(labels, element("p", "policy-mode-note", proof.verification.ok ? "Proposal checks passed against server-held context. Execution remains disabled." : "Proposal checks blocked this action. A policy denial can produce a valid decision record; inspect the reason codes below."));
  addHash(summary, "CAPSULE HASH", capsule.capsuleHash);
  summary.append(definitionList([
    ["Record ID", capsule.recordId], ["Request ID", capsule.requestId], ["Chain", capsule.chainId],
    ["Wallet", capsule.walletAddress], ["Created", capsule.decisionCreatedAt], ["Expires", capsule.decisionExpiresAt],
    ["Execution nonce", capsule.executionNonce], ["Quote block", capsule.quoteBlockNumber], ["Quote expires", capsule.quoteExpiresAt],
  ]));
  const reasons = proof.verification.reasonCodes || [];
  if (reasons.length) summary.append(element("h4", "proof-subheading", "Verifier reason codes"), codeList(reasons));
  if (capsule.safeReasonCodes?.length) summary.append(element("h4", "proof-subheading", "Decision reason codes"), codeList(capsule.safeReasonCodes));
  if (capsule.firedRuleIds?.length) summary.append(element("h4", "proof-subheading", "Fired rules"), codeList(capsule.firedRuleIds));

  const bindings = element("article", "data-card");
  bindings.append(element("h3", "proof-card-heading", "Bound decision inputs"));
  const bindingList = element("div", "binding-scroll");
  bindingList.tabIndex = 0;
  bindingList.setAttribute("role", "region");
  bindingList.setAttribute("aria-label", "All Decision Capsule hash bindings");
  [["REQUEST", capsule.requestHash], ["INTENT", capsule.intentHash], ["EVIDENCE", capsule.evidenceHash], ["EVIDENCE ROOT", capsule.evidenceRoot], ["RISK CONFIG", capsule.riskConfigHash],
    ["APPLICATION POLICY", capsule.applicationPolicyHash], ["POLICY DEFINITION", capsule.policyDefinitionHash], ["WALLET POLICY", capsule.walletPolicyHash], ["EXACT PLAN", capsule.planHash],
    ["SIMULATION", capsule.simulationHash], ["APPROVAL", capsule.approvalHash], ["ENVELOPE", capsule.envelopeHash], ["DECISION MATERIAL", capsule.materialHash]]
    .forEach(([label, value]) => addHash(bindingList, `${label} HASH`, value ?? "NOT PRESENT"));
  bindings.append(bindingList);
  bindings.append(element("p", "policy-mode-note", "A digest is an integrity binding, not a signature. These checks rely on the server's trusted context."));
  grid.append(summary, bindings);

  const provenance = element("article", "data-card provenance-card");
  provenance.append(element("h3", "proof-card-heading", "Evidence provenance"));
  const entries = element("div", "provenance-list");
  for (const item of proof.provenance || []) {
    const entry = element("details", "provenance-item");
    const heading = element("summary");
    const untrusted = ["MODEL_DERIVED", "UNTRUSTED_EXTERNAL", "OFFLINE_FIXTURE"].includes(item.trustClass);
    heading.append(element("span", "provenance-source", item.sourceId), element("span", `trust-label ${untrusted ? "untrusted" : ""}`, item.trustClass));
    entry.append(heading, definitionList([
      ["Evidence ID", item.evidenceId], ["Source type", item.sourceType], ["Observed", item.observedAt], ["Expires", item.expiresAt],
      ["Block", item.blockNumber], ["Validation", item.validationStatus],
    ]));
    addHash(entry, "CONTENT HASH", item.contentHash);
    entries.append(entry);
  }
  if (!entries.childElementCount) entries.append(element("p", "policy-mode-note", "No provenance entries are present."));
  provenance.append(element("p", "policy-mode-note", "Trust labels describe the server-assigned source class. A model or external text cannot grant itself authority."), entries);

  const coverage = element("article", "data-card");
  coverage.append(element("h3", "proof-card-heading", "Declared enforcement coverage"));
  const coverageList = element("ul", "coverage-list proof-coverage");
  for (const item of capsule.enforcementCoverage || []) {
    const row = element("li", "coverage-item");
    row.append(element("code", "", item.rule), element("span", item.enforcement === "PRIVY_ENFORCED" ? "coverage-privy" : "coverage-app", item.enforcement));
    coverageList.append(row);
  }
  coverage.append(coverageList, element("p", "policy-mode-note", "PRIVY_ENFORCED describes the declared wallet-policy layer. This offline record does not demonstrate a live Privy denial; live binding status is shown separately."));
  grid.append(provenance, coverage);
  container.append(grid, element("p", "proof-limitation", proof.limitation || "Synthetic offline evidence only. No signing, broadcasting or funding was attempted."));
  setBadge("proof-state", proof.verification.ok ? "PROPOSAL CHECKS PASSED" : "PROPOSAL BLOCKED", proof.verification.ok ? "allow" : "deny");
}

function selectedAttackCase() {
  return state.attackCases.find((entry) => entry.id === byId("attack-case").value);
}

function describeAttackCase() {
  const entry = selectedAttackCase();
  byId("attack-description").textContent = entry ? `${entry.description} Expected decision: ${entry.expected}.` : "No case selected.";
}

async function loadAttackLab() {
  try {
    const catalog = await fetchJson("/api/attack-lab");
    if (catalog.mode !== "offline-attack-lab" || catalog.capabilities?.signing !== false || catalog.capabilities?.broadcast !== false || catalog.capabilities?.funding !== false || !Array.isArray(catalog.cases) || !catalog.cases.length) {
      throw new Error("The offline test catalog is unavailable or has an unexpected capability state.");
    }
    state.attackCases = catalog.cases;
    const select = byId("attack-case");
    select.replaceChildren();
    catalog.cases.forEach((entry) => {
      const option = element("option", "", `${entry.expected === "DENY" ? "Attack" : "Control"} · ${entry.title}`);
      option.value = entry.id;
      select.append(option);
    });
    select.disabled = false;
    byId("attack-run").disabled = false;
    describeAttackCase();
    setBadge("attack-state", `${catalog.cases.length} OFFLINE CASES`, "");
  } catch {
    byId("attack-description").textContent = "The test catalog could not be loaded. Reload the page to retry.";
    byId("attack-result").textContent = "Offline Attack Lab unavailable. No test or wallet action was attempted.";
    setBadge("attack-state", "UNAVAILABLE", "approval");
  }
}

async function runAttackCase() {
  const selected = selectedAttackCase();
  if (!selected || state.attackRunning) return;
  state.attackRunning = true;
  const button = byId("attack-run");
  const container = byId("attack-result");
  button.disabled = true;
  byId("attack-case").disabled = true;
  button.firstElementChild.textContent = "Checking boundary…";
  container.className = "attack-result empty-state";
  container.replaceChildren(element("p", "", "Running the synthetic offline case…"));
  container.setAttribute("aria-busy", "true");
  setBadge("attack-state", "RUNNING", "");
  try {
    const result = await fetchJson("/api/attack-lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: selected.id }) });
    if (result.mode !== "offline-attack-lab" || result.id !== selected.id || result.expected !== selected.expected || typeof result.passed !== "boolean" || (result.passed && result.expected !== result.observed) || result.executionAuthorized !== false || result.walletReached !== false || !["ALLOW", "DENY"].includes(result.observed) || !Array.isArray(result.reasonCodes)) {
      throw new Error("Unexpected test response. No successful boundary result can be reported.");
    }
    container.className = "attack-result";
    container.replaceChildren(element("h3", "proof-card-heading", result.title));
    const labels = element("div", "capsule-labels");
    labels.append(element("span", `micro-badge ${result.observed === "DENY" ? "deny" : "allow"}`, result.observed), element("span", `micro-badge ${result.passed ? "allow" : "deny"}`, result.passed ? "CASE ASSERTIONS PASSED" : "CASE ASSERTIONS FAILED"), element("span", "micro-badge", "WALLET NOT REACHED"));
    container.append(labels, definitionList([["Category", result.category], ["Expected", result.expected], ["Attempted change", result.mutation], ["Enforcement boundary", result.boundary]], "definition-grid attack-details"));
    container.append(element("h4", "proof-subheading", "Reason codes"), codeList(result.reasonCodes));
    container.append(element("p", "policy-mode-note", result.observed === "ALLOW" ? "The legitimate fixture passed verification. ALLOW is a policy result only; execution is disabled." : "This fixture was rejected before any wallet adapter was reached."));
    setBadge("attack-state", result.passed ? "TEST PASSED" : "TEST FAILED", result.passed ? "allow" : "deny");
  } catch (error) {
    container.className = "attack-result empty-state";
    container.textContent = error instanceof Error && error.name !== "AbortError" ? error.message : "The test request timed out. No result is available; reload or retry.";
    setBadge("attack-state", "UNAVAILABLE", "approval");
  } finally {
    state.attackRunning = false;
    button.disabled = false;
    byId("attack-case").disabled = false;
    button.firstElementChild.textContent = "Run offline test";
    container.setAttribute("aria-busy", "false");
  }
}

function renderResult(result) {
  const kind = result.status === "prepared" ? "allow" : result.status === "requires_approval" ? "approval" : "deny";
  setBadge("decision-badge", result.status.replace("_", " ").toUpperCase(), kind);
  renderPipeline(result);
  renderIntent(result.intent);
  renderRisk(result.risk);
  renderPolicy(result.policy);
  renderPlan(result.plan);
  renderWalletPolicy(result.walletPolicy);
  renderAudit(result.audit);
  renderProof(result.proof);
}

async function runSelected() {
  if (!state.selected || state.running) return;
  state.running = true;
  const button = byId("run-button");
  button.disabled = true;
  document.querySelectorAll(".scenario-button").forEach((entry) => { entry.disabled = true; });
  button.firstElementChild.textContent = "Evaluating…";
  try {
    const result = await fetchJson("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: state.selected.id }),
    });
    renderResult(result);
  } catch (error) {
    showError(error instanceof Error ? error.message : "The demo failed closed.");
  } finally {
    state.running = false;
    document.querySelectorAll(".scenario-button").forEach((entry) => { entry.disabled = false; });
    button.disabled = false;
    button.firstElementChild.textContent = "Run Guard";
  }
}

async function buildEvidencePack() {
  const button = byId("evidence-build");
  if (button.disabled) return;
  const container = byId("evidence-result");
  button.disabled = true;
  byId("evidence-download").hidden = true;
  container.className = "attack-result empty-state";
  container.textContent = "Building and checking bundled offline fixtures…";
  container.setAttribute("aria-busy", "true");
  setBadge("evidence-state", "BUILDING", "");
  try {
    const pack = await fetchJson("/api/evidence/judge");
    if (pack.schemaVersion !== "alice-guard.judge-evidence.v1" || pack.mode !== "offline-fixture" || pack.attestation !== "UNATTESTED" ||
        !/^0x[0-9a-f]{64}$/.test(pack.packHash) || pack.capabilities?.executionAuthorized !== false ||
        pack.capabilities?.signing !== false || pack.capabilities?.broadcast !== false || pack.capabilities?.funding !== false ||
        pack.metrics?.repeatCount !== 1 || !Array.isArray(pack.scenarios) || pack.scenarios.length !== 3 || !Array.isArray(pack.attackResults) || pack.attackResults.length !== pack.metrics.caseCount) {
      throw new Error("Unexpected evidence format. No verified pack is available.");
    }
    container.className = "attack-result";
    container.replaceChildren(element("h3", "proof-card-heading", "Reproducible offline fixtures"),
      definitionList([["Scenarios", String(pack.scenarios.length)], ["Attack / control cases", `${pack.metrics.maliciousCaseCount} / ${pack.metrics.benignCaseCount}`],
        ["Runs per case", "1 (not the benchmark)"], ["Fixture time", pack.fixtureTime], ["Attestation", pack.attestation]], "definition-grid attack-details"));
    addHash(container, "PACK HASH", pack.packHash);
    container.append(element("p", "policy-mode-note", "Replay locally with npm.cmd run evidence:judge:verify -- <downloaded-file.json>. The verifier regenerates the reference fixtures; it does not trust a package's own pass flag."));
    container.append(element("p", "policy-mode-note", "This confirms reproducibility against the same trusted code, not a signature, live execution or hackathon eligibility."));
    byId("evidence-download").hidden = false;
    setBadge("evidence-state", "FIXTURE PACK READY", "allow");
  } catch {
    container.textContent = "Evidence generation is unavailable. Reload to retry; no result or execution authority is claimed.";
    setBadge("evidence-state", "UNAVAILABLE", "approval");
  } finally {button.disabled = false; container.setAttribute("aria-busy", "false");}
}

async function initialize() {
  byId("evidence-build").addEventListener("click", buildEvidencePack);
  byId("run-button").addEventListener("click", runSelected);
  byId("attack-run").addEventListener("click", runAttackCase);
  byId("attack-case").addEventListener("change", describeAttackCase);
  const pipeline = byId("pipeline");
  ["INTENT", "RISK", "POLICY", "PLAN GUARD", "EXECUTION"].forEach((label) => pipeline.append(element("div", "pipeline-step", label)));
  try {
    const statusPromise = fetchJson("/api/privy/status").catch(() => null);
    const [health, catalog] = await Promise.all([fetchJson("/api/health"), fetchJson("/api/scenarios")]);
    if (health.walletEnabled || health.signingEnabled || health.broadcastEnabled) throw new Error("Unsafe demo capability state.");
    state.scenarios = catalog.scenarios;
    renderScenarioButtons();
    void loadAttackLab();
    renderPrivyStatus(await statusPromise);
    byId("health-status").textContent = "LOCAL SERVICE HEALTHY · SIGNING AND BROADCAST DISABLED";
  } catch (error) {
    byId("health-status").textContent = "LOCAL SERVICE UNAVAILABLE";
    showError(error instanceof Error ? error.message : "Unable to initialize the local demo.");
  }
}

initialize();
