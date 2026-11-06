import { STATUSES, blankAdr, exampleAdr, fileName, scoreOptions, toMarkdown, validate } from "./adr.js";

const KEY = "adr-builder:draft";
const form = document.getElementById("form");
const $ = (id) => document.getElementById(id);

let adr = loadDraft() ?? exampleAdr();

function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft() {
  try {
    localStorage.setItem(KEY, JSON.stringify(adr));
  } catch {
    // Storage can be blocked. The app still works without it.
  }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function fillSimpleFields() {
  const statusSel = form.elements.status;
  statusSel.replaceChildren(...STATUSES.map((s) => el("option", { value: s, text: s })));
  for (const name of ["number", "title", "status", "date", "supersededBy", "deciders", "context", "rationale", "positive", "negative", "links"]) {
    form.elements[name].value = adr[name] ?? "";
  }
}

function renderDrivers() {
  const box = $("drivers");
  box.replaceChildren(
    ...adr.drivers.map((d, i) =>
      el("div", { class: "row item" }, [
        el("input", {
          type: "text", class: "grow", placeholder: "Driver, e.g. Cost", value: d.name, "aria-label": "Driver name",
          oninput: (e) => renameDriver(i, e.target.value),
        }),
        el("input", {
          type: "number", min: "1", max: "5", class: "narrow", value: d.weight, "aria-label": "Driver weight",
          oninput: (e) => { d.weight = Number(e.target.value) || 0; update(); },
        }),
        el("button", { type: "button", class: "small ghost", "aria-label": "Remove driver", text: "Remove",
          onclick: () => { removeDriver(i); } }),
      ]),
    ),
  );
}

function renameDriver(i, name) {
  const old = adr.drivers[i].name;
  adr.drivers[i].name = name;
  for (const o of adr.options) {
    o.scores ??= {};
    if (old in o.scores) {
      o.scores[name] = o.scores[old];
      delete o.scores[old];
    }
  }
  renderOptions();
  update();
}

function removeDriver(i) {
  const [gone] = adr.drivers.splice(i, 1);
  for (const o of adr.options) delete o.scores?.[gone.name];
  renderDrivers();
  renderOptions();
  update();
}

function renderOptions() {
  const box = $("options");
  const named = adr.drivers.filter((d) => d.name);
  box.replaceChildren(
    ...adr.options.map((o, i) =>
      el("div", { class: "option" }, [
        el("div", { class: "row" }, [
          el("input", {
            type: "text", class: "grow", placeholder: `Option ${i + 1}`, value: o.name, "aria-label": "Option name",
            oninput: (e) => { renameOption(o, e.target.value); },
          }),
          el("button", { type: "button", class: "small ghost", text: "Remove",
            onclick: () => { adr.options.splice(i, 1); renderOptions(); update(); } }),
        ]),
        named.length
          ? el("div", { class: "scores" }, named.map((d) =>
              el("label", { class: "score" }, [
                d.name,
                el("input", {
                  type: "range", min: "0", max: "5", step: "1", value: o.scores?.[d.name] ?? 0,
                  oninput: (e) => {
                    (o.scores ??= {})[d.name] = Number(e.target.value);
                    e.target.nextSibling.textContent = e.target.value;
                    update();
                  },
                }),
                el("output", { text: String(o.scores?.[d.name] ?? 0) }),
              ]),
            ))
          : el("p", { class: "hint", text: "Name a driver above to score this option." }),
        el("div", { class: "row" }, [
          el("label", { class: "grow" }, ["Pros", el("textarea", { rows: "2", oninput: (e) => { o.pros = e.target.value; update(); } }, [o.pros ?? ""])]),
          el("label", { class: "grow" }, ["Cons", el("textarea", { rows: "2", oninput: (e) => { o.cons = e.target.value; update(); } }, [o.cons ?? ""])]),
        ]),
      ]),
    ),
  );
}

function renameOption(o, name) {
  if (adr.chosen === o.name) adr.chosen = name;
  o.name = name;
  update();
}

function renderChosen() {
  const sel = form.elements.chosen;
  const names = adr.options.map((o) => o.name).filter(Boolean);
  sel.replaceChildren(el("option", { value: "", text: "Not decided yet" }), ...names.map((n) => el("option", { value: n, text: n })));
  sel.value = names.includes(adr.chosen) ? adr.chosen : "";
}

function update() {
  renderChosen();
  $("superseded-wrap").hidden = adr.status !== "Superseded";

  const ranked = scoreOptions(adr.drivers, adr.options);
  $("ranking").replaceChildren(
    ...ranked.map((r) =>
      el("li", { class: r.name === adr.chosen ? "chosen" : "" }, [
        el("span", { class: "rname", text: r.name }),
        el("span", { class: "bar" }, [el("span", { class: "fill", style: `width:${r.score}%` })]),
        el("span", { class: "rscore", text: String(r.score) }),
      ]),
    ),
  );
  if (!ranked.length) $("ranking").append(el("li", { class: "hint", text: "Add options and drivers to see a ranking." }));

  const errors = validate(adr);
  $("errors").replaceChildren(...errors.map((e) => el("li", { text: e })));

  $("filename").textContent = fileName(adr.number, adr.title);
  $("markdown").textContent = toMarkdown(adr);
  saveDraft();
}

function renderAll() {
  fillSimpleFields();
  renderDrivers();
  renderOptions();
  update();
}

form.addEventListener("input", (e) => {
  const name = e.target.name;
  if (!name) return;
  adr[name] = name === "number" ? Number(e.target.value) : e.target.value;
  update();
});

$("add-driver").addEventListener("click", () => { adr.drivers.push({ name: "", weight: 1 }); renderDrivers(); update(); });
$("add-option").addEventListener("click", () => { adr.options.push({ name: "", scores: {}, pros: "", cons: "" }); renderOptions(); update(); });
$("load-example").addEventListener("click", () => { adr = exampleAdr(); renderAll(); });
$("reset").addEventListener("click", () => { adr = blankAdr(); renderAll(); });

$("copy").addEventListener("click", async () => {
  const btn = $("copy");
  try {
    await navigator.clipboard.writeText(toMarkdown(adr));
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1500);
});

$("download").addEventListener("click", () => {
  const blob = new Blob([toMarkdown(adr)], { type: "text/markdown" });
  const a = el("a", { href: URL.createObjectURL(blob), download: fileName(adr.number, adr.title) });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
});

renderAll();
