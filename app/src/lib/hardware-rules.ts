// Turn a parsed board report into hardware quantities.
//
// A board report lists panels, not hardware — the hinges, runners, drawer sides
// and front clips it implies are never written down anywhere in the file. What
// bridges the two is a rule: "a door panel up to 900mm long takes two of
// HW-1007". This applies those rules and counts the result.
//
// Two things shape the whole design.
//
// **A rule counts panels, not cabinets.** "Two hinges per door" is really "two
// hinges per panel whose code looks like a door", and "one runner set per
// drawer" is the same sentence with a different pattern. That matters more than
// it looks: it means nothing in this file has to know what CADMaster calls a
// drawer. Whoever writes the rule reads their own part codes off their own
// report and types the pattern. A part code this code has never seen is a
// five-second edit, not a release.
//
// **A cabinet that produces nothing is reported, never assumed to need
// nothing.** There will always be a cabinet type nobody has written a rule for
// yet, and on an ordering list a silent zero is indistinguishable from a
// correct zero right up until the delivery arrives short.
//
// Pure: the caller loads rules and stock, this decides what they mean.

import { countPanels, type BoardCabinet, type BoardPanel, type BoardReport } from "./cadmaster";

/**
 * A rule for producing hardware from what the report contains.
 *
 * With `panelCode` set the rule fires once per matching panel *piece* (a line
 * reading "2 @" fires it twice). Without it, the rule fires once per matching
 * cabinet — which is how you say "every cabinet gets four legs".
 */
export type HardwareRule = {
  id: string;
  name: string;
  active: boolean;
  /** Evaluation order. Lower runs first, and first match wins — see deriveHardware. */
  position: number;

  /** Glob matched against the cabinet type. Empty matches every cabinet. */
  cabinetType: string;
  /** Glob matched against the panel code. Empty makes the rule per-cabinet. */
  panelCode: string;

  /** Cabinet size bands, in mm. Null is unbounded. */
  minCabinetWidthMm: number | null;
  maxCabinetWidthMm: number | null;
  minCabinetDepthMm: number | null;
  maxCabinetDepthMm: number | null;
  minCabinetHeightMm: number | null;
  maxCabinetHeightMm: number | null;

  /** Panel size bands, in mm — how "a door over 900mm takes three hinges" is said. */
  minPanelLengthMm: number | null;
  maxPanelLengthMm: number | null;
  minPanelWidthMm: number | null;
  maxPanelWidthMm: number | null;

  /** The stock line this produces, and how many pieces of it. */
  hardwareItemId: string;
  qtyPer: number;
  notes: string;
};

/** Where one slice of a derived quantity came from. */
export type DerivedSource = {
  cabinetIndex: number;
  cabinetType: string;
  ruleId: string;
  ruleName: string;
  /** The panel code that triggered it, for a per-panel rule. */
  panelCode?: string;
  qty: number;
};

/** The total required of one stock line, and every rule firing behind it. */
export type DerivedLine = {
  hardwareItemId: string;
  qty: number;
  sources: DerivedSource[];
};

/** A cabinet the rules had nothing to say about. */
export type UnmatchedCabinet = {
  type: string;
  count: number;
  /** The panel codes inside it, so whoever writes the rule can see what to match. */
  panelCodes: string[];
};

export type DerivationResult = {
  lines: DerivedLine[];
  /** Cabinet types that produced no hardware at all. Shown, never swallowed. */
  unmatched: UnmatchedCabinet[];
  /** Rules that matched nothing — usually a pattern with a typo in it. */
  unusedRuleIds: string[];
};

/**
 * Match a glob against a name, case-insensitively.
 *
 * Only `*` is supported, and deliberately so: whoever maintains these rules is
 * a joiner reading part codes off a printout, not writing regular expressions.
 * "Floor * Door" and "Drw*" cover what the report actually contains, and every
 * other character is matched literally so a type like "Kickboard AZ *" can be
 * matched by typing it out.
 */
export function matchesPattern(pattern: string, value: string): boolean {
  const p = (pattern || "").trim();
  if (!p) return true; // an empty pattern is "anything", not "nothing"
  // Split on the wildcard first, then escape each literal run. Doing it the
  // other way round needs a placeholder for `*`, and every character available
  // as a placeholder is one a real part code might contain.
  const source = `^${p.split("*").map(escapeRegex).join(".*")}$`;
  return new RegExp(source, "i").test((value || "").trim());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a value sits inside an optional band. A missing value fails a set bound. */
function inBand(value: number | null, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  // A rule that names a size cannot be judged against a cabinet whose size the
  // report didn't carry — better to not fire than to fire on an unknown.
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function cabinetMatches(rule: HardwareRule, cabinet: BoardCabinet): boolean {
  return (
    matchesPattern(rule.cabinetType, cabinet.type) &&
    inBand(cabinet.widthMm, rule.minCabinetWidthMm, rule.maxCabinetWidthMm) &&
    inBand(cabinet.depthMm, rule.minCabinetDepthMm, rule.maxCabinetDepthMm) &&
    inBand(cabinet.heightMm, rule.minCabinetHeightMm, rule.maxCabinetHeightMm)
  );
}

function panelMatches(rule: HardwareRule, panel: BoardPanel): boolean {
  return (
    matchesPattern(rule.panelCode, panel.code) &&
    inBand(panel.lengthMm, rule.minPanelLengthMm, rule.maxPanelLengthMm) &&
    inBand(panel.widthMm, rule.minPanelWidthMm, rule.maxPanelWidthMm)
  );
}

/** True when the rule counts panels rather than cabinets. */
export function isPerPanel(rule: HardwareRule): boolean {
  return Boolean((rule.panelCode || "").trim());
}

/**
 * Apply the rules to a report.
 *
 * Rules run in `position` order and **the first match wins per target, per
 * stock line**. That is what lets a hinge schedule be written the way it is
 * spoken — "doors up to 900 take two, up to 1600 take three" — as two
 * overlapping rules, without the short doors collecting five hinges between
 * them. Rules producing *different* stock lines all fire on the same target, so
 * a door can take both hinges and a handle.
 */
export function deriveHardware(report: BoardReport, rules: HardwareRule[]): DerivationResult {
  const active = rules.filter((r) => r.active).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const totals = new Map<string, DerivedLine>();
  const usedRules = new Set<string>();
  const producedFor = new Set<number>(); // cabinet indexes that yielded anything

  const add = (hardwareItemId: string, qty: number, source: DerivedSource) => {
    if (qty <= 0) return;
    const line = totals.get(hardwareItemId) ?? { hardwareItemId, qty: 0, sources: [] };
    line.qty += qty;
    line.sources.push(source);
    totals.set(hardwareItemId, line);
  };

  report.cabinets.forEach((cabinet, cabinetIndex) => {
    // "Claimed" is keyed per target and per stock line, so an earlier hinge rule
    // blocks a later hinge rule on the same door but not a handle rule.
    const claimed = new Set<string>();

    for (const rule of active) {
      if (!cabinetMatches(rule, cabinet)) continue;

      if (!isPerPanel(rule)) {
        const key = `cabinet:${rule.hardwareItemId}`;
        if (claimed.has(key)) continue;
        claimed.add(key);
        usedRules.add(rule.id);
        producedFor.add(cabinetIndex);
        add(rule.hardwareItemId, rule.qtyPer, {
          cabinetIndex: cabinet.index,
          cabinetType: cabinet.type,
          ruleId: rule.id,
          ruleName: rule.name,
          qty: rule.qtyPer,
        });
        continue;
      }

      // Per-panel: each panel line is its own target, so two door lines in one
      // cabinet each get their own hinges.
      cabinet.panels.forEach((panel, panelIndex) => {
        if (!panelMatches(rule, panel)) return;
        const key = `panel:${panelIndex}:${rule.hardwareItemId}`;
        if (claimed.has(key)) return;
        claimed.add(key);
        usedRules.add(rule.id);
        producedFor.add(cabinetIndex);
        // The line's quantity is pieces of that panel, so a "2 @" door line
        // takes hinges for both doors.
        const qty = rule.qtyPer * panel.qty;
        add(rule.hardwareItemId, qty, {
          cabinetIndex: cabinet.index,
          cabinetType: cabinet.type,
          ruleId: rule.id,
          ruleName: rule.name,
          panelCode: panel.code,
          qty,
        });
      });
    }
  });

  // Cabinet types where not one cabinet produced anything. Grouped by type
  // because that is the unit someone writes a rule against.
  const unmatchedByType = new Map<string, UnmatchedCabinet>();
  report.cabinets.forEach((cabinet, i) => {
    if (producedFor.has(i)) return;
    const entry = unmatchedByType.get(cabinet.type) ?? { type: cabinet.type, count: 0, panelCodes: [] };
    entry.count += 1;
    for (const panel of cabinet.panels) {
      if (!entry.panelCodes.includes(panel.code)) entry.panelCodes.push(panel.code);
    }
    unmatchedByType.set(cabinet.type, entry);
  });

  return {
    lines: [...totals.values()].sort((a, b) => b.qty - a.qty || a.hardwareItemId.localeCompare(b.hardwareItemId)),
    unmatched: [...unmatchedByType.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    unusedRuleIds: active.filter((r) => !usedRules.has(r.id)).map((r) => r.id),
  };
}

/**
 * How many panels in the whole report match a pattern.
 *
 * The rules screen uses this to answer "what would this rule actually catch"
 * before it is saved, which is the difference between a rule you trust and a
 * pattern you hope is right.
 */
export function previewPanelMatches(report: BoardReport, panelCode: string): number {
  return report.cabinets.reduce((n, c) => n + countPanels(c, (code) => matchesPattern(panelCode, code)), 0);
}

/** How many cabinets in the report a cabinet-type pattern would catch. */
export function previewCabinetMatches(report: BoardReport, cabinetType: string): number {
  return report.cabinets.filter((c) => matchesPattern(cabinetType, c.type)).length;
}

/** A blank rule, for the "add a rule" button. */
export function emptyRule(id: string): HardwareRule {
  return {
    id,
    name: "",
    active: true,
    position: 0,
    cabinetType: "",
    panelCode: "",
    minCabinetWidthMm: null,
    maxCabinetWidthMm: null,
    minCabinetDepthMm: null,
    maxCabinetDepthMm: null,
    minCabinetHeightMm: null,
    maxCabinetHeightMm: null,
    minPanelLengthMm: null,
    maxPanelLengthMm: null,
    minPanelWidthMm: null,
    maxPanelWidthMm: null,
    hardwareItemId: "",
    qtyPer: 1,
    notes: "",
  };
}

/** A rule in words, for the list — "2 × per DoorLeft panel, 0–900mm long". */
export function describeRule(rule: HardwareRule): string {
  const target = isPerPanel(rule) ? `per ${rule.panelCode} panel` : "per cabinet";
  const parts = [`${rule.qtyPer} × ${target}`];
  if (rule.cabinetType.trim()) parts.push(`in ${rule.cabinetType}`);

  const band = (label: string, min: number | null, max: number | null) => {
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${label} ${min}–${max}mm`;
    if (min != null) return `${label} from ${min}mm`;
    return `${label} to ${max}mm`;
  };
  const bands = [
    band("panel length", rule.minPanelLengthMm, rule.maxPanelLengthMm),
    band("panel width", rule.minPanelWidthMm, rule.maxPanelWidthMm),
    band("cabinet width", rule.minCabinetWidthMm, rule.maxCabinetWidthMm),
    band("cabinet depth", rule.minCabinetDepthMm, rule.maxCabinetDepthMm),
    band("cabinet height", rule.minCabinetHeightMm, rule.maxCabinetHeightMm),
  ].filter(Boolean);
  if (bands.length) parts.push(bands.join(", "));

  return parts.join(" · ");
}
