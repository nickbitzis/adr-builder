import { test } from "node:test";
import assert from "node:assert/strict";
import { blankAdr, exampleAdr, fileName, lines, scoreOptions, slugify, toMarkdown, validate } from "../src/adr.js";

test("slugify makes safe file names", () => {
  assert.equal(slugify("Use Postgres for Orders!"), "use-postgres-for-orders");
  assert.equal(slugify("  Café & Crème  "), "cafe-creme");
  assert.equal(slugify("---"), "");
  assert.ok(slugify("a".repeat(100)).length <= 60);
});

test("fileName pads the number and falls back for empty titles", () => {
  assert.equal(fileName(7, "Use Kafka"), "0007-use-kafka.md");
  assert.equal(fileName(0, ""), "0001-untitled.md");
  assert.equal(fileName("12", "x"), "0012-x.md");
});

test("lines strips bullets and blanks", () => {
  assert.deepEqual(lines("- one\n\n* two\n  three  "), ["one", "two", "three"]);
  assert.deepEqual(lines(undefined), []);
});

test("scoreOptions weights drivers and scales to 100", () => {
  const drivers = [{ name: "Cost", weight: 3 }, { name: "Speed", weight: 1 }];
  const options = [
    { name: "A", scores: { Cost: 5, Speed: 1 } },
    { name: "B", scores: { Cost: 1, Speed: 5 } },
    { name: "C", scores: { Cost: 5, Speed: 5 } },
  ];
  const ranked = scoreOptions(drivers, options);
  assert.deepEqual(ranked.map((r) => r.name), ["C", "A", "B"]);
  assert.equal(ranked[0].score, 100);
  assert.equal(ranked[1].score, 80); // (15 + 1) / 20
  assert.equal(ranked[2].score, 40); // (3 + 5) / 20
});

test("scoreOptions ignores unnamed or zero-weight drivers and clamps scores", () => {
  const ranked = scoreOptions(
    [{ name: "", weight: 5 }, { name: "Cost", weight: 0 }, { name: "Risk", weight: 2 }],
    [{ name: "A", scores: { Risk: 9, Cost: 5 } }, { name: "", scores: {} }],
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 100);
});

test("scoreOptions with no drivers scores zero instead of dividing by zero", () => {
  const ranked = scoreOptions([], [{ name: "A" }, { name: "B" }]);
  assert.deepEqual(ranked.map((r) => r.score), [0, 0]);
});

test("the example ADR is valid", () => {
  assert.deepEqual(validate(exampleAdr()), []);
});

test("validate catches the common mistakes", () => {
  const adr = blankAdr();
  const errors = validate(adr);
  assert.ok(errors.includes("Add a title."));
  assert.ok(errors.some((e) => e.startsWith("List at least two options")));

  adr.title = "T";
  adr.context = "C";
  adr.options = [{ name: "X" }, { name: "x" }];
  assert.ok(validate(adr).includes("Option names must be unique."));

  adr.options = [{ name: "X" }, { name: "Y" }];
  adr.chosen = "Z";
  assert.ok(validate(adr).includes("The chosen option must be one of the options."));

  adr.chosen = "X";
  adr.status = "Superseded";
  assert.ok(validate(adr).includes("Say which ADR supersedes this one."));
  adr.supersededBy = "ADR 0009";
  assert.deepEqual(validate(adr), []);
});

test("toMarkdown renders every section of the example", () => {
  const md = toMarkdown(exampleAdr());
  assert.match(md, /^# ADR 0007: Use a managed Postgres service/);
  for (const heading of ["## Context and problem", "## Decision drivers", "## Decision matrix", "## Decision", "## Consequences", "## Links"]) {
    assert.ok(md.includes(heading), `missing ${heading}`);
  }
  assert.match(md, /Chosen option: \*\*Managed Postgres\*\*/);
  assert.match(md, /\| Managed Postgres \| 5 \| 3 \| 5 \| 3 \| 87 \|/);
  assert.ok(!md.includes("\n\n\n"));
  assert.ok(md.endsWith("\n"));
});

test("toMarkdown flags when the choice disagrees with the matrix", () => {
  const adr = exampleAdr();
  adr.chosen = "Keep self-managed VM";
  assert.match(toMarkdown(adr), /the matrix ranks \*\*Managed Postgres\*\* highest/);
});

test("toMarkdown handles a blank ADR without throwing", () => {
  const md = toMarkdown(blankAdr());
  assert.match(md, /# ADR 0001: Untitled/);
  assert.match(md, /_No option chosen yet._/);
  assert.ok(!md.includes("## Decision matrix"));
});
