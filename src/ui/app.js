"use strict";

const state = { scenarios: [], selected: null, running: false, privyStatus: null };
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
  const link = element("a", "explorer-link", "View wallet on MonadVision ↗");
  link.href = `${status.network.explorerUrl}/address/${status.wallet.address}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  container.append(link, element("p", "policy-mode-note", `Checked ${new Date(status.checkedAt).toLocaleString()} · read-only evidence`));

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
    const statusPromise = fetchJson("/api/privy/status").catch(() => null);
    const [health, catalog] = await Promise.all([fetchJson("/api/health"), fetchJson("/api/scenarios")]);
    if (health.walletEnabled || health.signingEnabled || health.broadcastEnabled) throw new Error("Unsafe demo capability state.");
    state.scenarios = catalog.scenarios;
    renderScenarioButtons();
    renderPrivyStatus(await statusPromise);
    byId("health-status").textContent = "LOCAL SERVICE HEALTHY · SIGNING AND BROADCAST DISABLED";
  } catch (error) {
    byId("health-status").textContent = "LOCAL SERVICE UNAVAILABLE";
    showError(error instanceof Error ? error.message : "Unable to initialize the local demo.");
  }
}

initialize();
