// Pure logic for the ADR builder. No DOM access here, so it runs in the
// browser and under `node --test` unchanged.

export const STATUSES = ["Proposed", "Accepted", "Rejected", "Deprecated", "Superseded"];

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function fileName(number, title) {
  const n = String(Math.max(1, Math.trunc(Number(number) || 1))).padStart(4, "0");
  const slug = slugify(title) || "untitled";
  return `${n}-${slug}.md`;
}

// Split a textarea into clean, non-empty lines. Leading "- " or "* " is dropped
// so people can paste bullet lists.
export function lines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

// Weighted decision matrix. drivers: [{name, weight}], options: [{name, scores: {driverName: 1..5}}]
// Returns options ranked by weighted score, normalized to 0..100.
export function scoreOptions(drivers, options) {
  const usable = drivers.filter((d) => d.name && Number(d.weight) > 0);
  const totalWeight = usable.reduce((sum, d) => sum + Number(d.weight), 0);
  const ranked = options
    .filter((o) => o.name)
    .map((o) => {
      let raw = 0;
      for (const d of usable) {
        const s = clamp(Number(o.scores?.[d.name] ?? 0), 0, 5);
        raw += s * Number(d.weight);
      }
      const max = totalWeight * 5;
      return { name: o.name, raw, score: max ? Math.round((raw / max) * 100) : 0 };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return ranked;
}

function clamp(x, lo, hi) {
  if (Number.isNaN(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function validate(adr) {
  const errors = [];
  if (!adr.title?.trim()) errors.push("Add a title.");
  if (!STATUSES.includes(adr.status)) errors.push("Pick a valid status.");
  if (!adr.context?.trim()) errors.push("Describe the context and problem.");
  const names = (adr.options ?? []).map((o) => o.name).filter(Boolean);
  if (names.length < 2) errors.push("List at least two options so the decision is a real choice.");
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    errors.push("Option names must be unique.");
  }
  if (adr.chosen && !names.includes(adr.chosen)) errors.push("The chosen option must be one of the options.");
  if (adr.status === "Superseded" && !adr.supersededBy?.trim()) {
    errors.push("Say which ADR supersedes this one.");
  }
  return errors;
}

function bullets(items) {
  return items.map((i) => `- ${i}`).join("\n");
}

// Render the ADR as Markdown, loosely following the MADR template.
export function toMarkdown(adr) {
  const out = [];
  const num = String(Math.max(1, Math.trunc(Number(adr.number) || 1))).padStart(4, "0");
  out.push(`# ADR ${num}: ${adr.title?.trim() || "Untitled"}`, "");
  const meta = [`- Status: ${adr.status}`];
  if (adr.status === "Superseded" && adr.supersededBy) meta.push(`- Superseded by: ${adr.supersededBy.trim()}`);
  if (adr.date) meta.push(`- Date: ${adr.date}`);
  const deciders = lines(adr.deciders);
  if (deciders.length) meta.push(`- Deciders: ${deciders.join(", ")}`);
  out.push(...meta, "");

  out.push("## Context and problem", "", adr.context?.trim() || "_Not provided._", "");

  const drivers = (adr.drivers ?? []).filter((d) => d.name);
  if (drivers.length) {
    out.push("## Decision drivers", "");
    out.push(bullets(drivers.map((d) => `${d.name} (weight ${d.weight})`)), "");
  }

  const options = (adr.options ?? []).filter((o) => o.name);
  if (options.length) {
    out.push("## Options considered", "");
    out.push(bullets(options.map((o) => o.name)), "");
  }

  const ranked = scoreOptions(drivers, options);
  if (drivers.length && options.length) {
    out.push("## Decision matrix", "");
    const header = ["Option", ...drivers.map((d) => `${d.name} (x${d.weight})`), "Score"];
    out.push(`| ${header.join(" | ")} |`);
    out.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const r of ranked) {
      const o = options.find((x) => x.name === r.name);
      const cells = drivers.map((d) => String(o.scores?.[d.name] ?? 0));
      out.push(`| ${[r.name, ...cells, String(r.score)].join(" | ")} |`);
    }
    out.push("", "Scores are 0 to 5 per driver. The total is weighted and scaled to 100.", "");
  }

  out.push("## Decision", "");
  if (adr.chosen) {
    out.push(`Chosen option: **${adr.chosen}**.`);
    if (adr.rationale?.trim()) out.push("", adr.rationale.trim());
    const top = ranked[0];
    if (top && top.name !== adr.chosen) {
      out.push("", `Note: the matrix ranks **${top.name}** highest (${top.score}). The rationale above explains why we chose differently.`);
    }
  } else {
    out.push("_No option chosen yet._");
  }
  out.push("");

  for (const o of options) {
    const pros = lines(o.pros);
    const cons = lines(o.cons);
    if (!pros.length && !cons.length) continue;
    out.push(`### ${o.name}`, "");
    if (pros.length) out.push(bullets(pros.map((p) => `Good: ${p}`)));
    if (cons.length) out.push(bullets(cons.map((c) => `Bad: ${c}`)));
    out.push("");
  }

  const good = lines(adr.positive);
  const bad = lines(adr.negative);
  if (good.length || bad.length) {
    out.push("## Consequences", "");
    if (good.length) out.push(bullets(good.map((g) => `Positive: ${g}`)));
    if (bad.length) out.push(bullets(bad.map((b) => `Negative: ${b}`)));
    out.push("");
  }

  const links = lines(adr.links);
  if (links.length) out.push("## Links", "", bullets(links), "");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function exampleAdr() {
  return {
    number: 7,
    title: "Use a managed Postgres service for the orders database",
    status: "Accepted",
    supersededBy: "",
    date: "2026-11-05",
    deciders: "Platform team\nOrders team lead",
    context:
      "The orders service runs on a self-managed Postgres VM. Backups are a cron job, failover is manual, and patching takes a weekend each quarter. Order volume is growing about 15% a quarter and the team has two engineers.",
    drivers: [
      { name: "Operational load", weight: 3 },
      { name: "Cost", weight: 2 },
      { name: "Recovery time", weight: 3 },
      { name: "Lock-in risk", weight: 1 },
    ],
    options: [
      {
        name: "Managed Postgres",
        scores: { "Operational load": 5, Cost: 3, "Recovery time": 5, "Lock-in risk": 3 },
        pros: "Automated backups and point-in-time restore\nMulti-AZ failover in minutes",
        cons: "Higher monthly bill than a VM",
      },
      {
        name: "Keep self-managed VM",
        scores: { "Operational load": 1, Cost: 5, "Recovery time": 2, "Lock-in risk": 5 },
        pros: "Lowest direct cost\nFull control of extensions",
        cons: "Manual failover\nPatching burns weekends",
      },
      {
        name: "Move to a document database",
        scores: { "Operational load": 4, Cost: 3, "Recovery time": 4, "Lock-in risk": 1 },
        pros: "Flexible schema",
        cons: "Rewrite of every query\nWeak fit for relational order data",
      },
    ],
    chosen: "Managed Postgres",
    rationale: "It removes the most operational work for a small team and gives us a tested recovery path.",
    positive: "No more weekend patching\nRecovery time drops from hours to minutes",
    negative: "Database spend rises about 40%",
    links: "Postgres docs: https://www.postgresql.org/docs/",
  };
}

export function blankAdr() {
  return {
    number: 1,
    title: "",
    status: "Proposed",
    supersededBy: "",
    date: new Date().toISOString().slice(0, 10),
    deciders: "",
    context: "",
    drivers: [{ name: "", weight: 1 }],
    options: [
      { name: "", scores: {}, pros: "", cons: "" },
      { name: "", scores: {}, pros: "", cons: "" },
    ],
    chosen: "",
    rationale: "",
    positive: "",
    negative: "",
    links: "",
  };
}
