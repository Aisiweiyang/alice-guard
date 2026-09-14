"use strict";

const state = { scenarios: [], selected: null, running: false };
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
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "The local demo rejected the request.");
  return body;
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
  if (state.scenarios[0]) selectScenario(state.scenarios[0]);
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
  container.append(element("p", "policy-mode-note", "Offline policy manifest only · no Privy wallet or signer is configured."));
  const list = element("ul", "coverage-list");
  walletPolicy.coverage.forEach((entry) => {
    const item = element("li", "coverage-item");
    item.append(element("code", "", entry.rule), element("span", entry.enforcement === "PRIVY_ENFORCED" ? "coverage-privy" : "coverage-app", entry.enforcement));
    list.append(item);
  });
  container.append(list);
  const kind = walletPolicy.status === "MATCHED" ? "allow" : walletPolicy.status === "DRIFTED" ? "deny" : "approval";
  setBadge("wallet-policy-state", walletPolicy.status.replace("_", " "), kind);
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
}

async function runSelected() {
  if (!state.selected || state.running) return;
  state.running = true;
  const button = byId("run-button");
  button.disabled = true;
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
    button.disabled = false;
    button.firstElementChild.textContent = "Run Guard";
  }
}

async function initialize() {
  byId("run-button").addEventListener("click", runSelected);
  const pipeline = byId("pipeline");
  ["INTENT", "RISK", "POLICY", "PLAN GUARD", "EXECUTION"].forEach((label) => pipeline.append(element("div", "pipeline-step", label)));
  try {
    const [health, catalog] = await Promise.all([fetchJson("/api/health"), fetchJson("/api/scenarios")]);
    if (health.walletEnabled || health.signingEnabled || health.broadcastEnabled) throw new Error("Unsafe demo capability state.");
    state.scenarios = catalog.scenarios;
    renderScenarioButtons();
    byId("health-status").textContent = "LOCAL SERVICE HEALTHY · SAFETY CAPABILITIES DISABLED";
  } catch (error) {
    byId("health-status").textContent = "LOCAL SERVICE UNAVAILABLE";
    showError(error instanceof Error ? error.message : "Unable to initialize the local demo.");
  }
}

initialize();
