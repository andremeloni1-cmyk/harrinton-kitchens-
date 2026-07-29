import { describe, it, expect } from "vitest";
import { importMeasurements, importSummary, parseMm, splitDelimited } from "./measure-import";

describe("parseMm", () => {
  it("reads a bare number as millimetres", () => {
    expect(parseMm("3600")).toBe(3600);
    expect(parseMm(" 900 mm ")).toBe(900);
  });

  it("converts metres and centimetres", () => {
    expect(parseMm("3.6m")).toBe(3600);
    expect(parseMm("2.45")).toBe(2450); // a decimal with no unit is metres
    expect(parseMm("90cm")).toBe(900);
  });

  it("strips thousands separators", () => {
    expect(parseMm("3,600")).toBe(3600);
  });

  it("refuses anything that isn't a measurement", () => {
    expect(parseMm("wall A")).toBeNull();
    expect(parseMm("")).toBeNull();
    expect(parseMm("-500")).toBeNull();
  });
});

describe("splitDelimited", () => {
  it("keeps a quoted field containing the delimiter in one piece", () => {
    expect(splitDelimited('Kitchen,power,"GPO, double",,Wall A', ",")).toEqual([
      "Kitchen",
      "power",
      "GPO, double",
      "",
      "Wall A",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitDelimited('a,"say ""hi"""', ",")).toEqual(["a", 'say "hi"']);
  });
});

describe("importMeasurements — freeform", () => {
  const paste = [
    "Kitchen",
    "ceiling 2400",
    "wall A 3600",
    "wall B 2450",
    "window 1200 @ wall A 800",
    "power double GPO x2 @ wall A 2400 h1100",
    "water sink mixer @ wall B 900",
    "",
    "Butler's pantry",
    "wall A 1800",
  ].join("\n");

  it("reads rooms, walls, openings and service points", () => {
    const { rooms, warnings, format } = importMeasurements(paste);
    expect(format).toBe("freeform");
    expect(warnings).toEqual([]);
    expect(rooms.map((r) => r.name)).toEqual(["Kitchen", "Butler's pantry"]);

    const kitchen = rooms[0];
    expect(kitchen.ceilingMm).toBe(2400);
    expect(kitchen.walls).toEqual([
      { label: "Wall A", mm: 3600 },
      { label: "Wall B", mm: 2450 },
    ]);
    expect(kitchen.openings).toEqual([{ label: "Window", mm: 1200, wall: "Wall A", offsetMm: 800 }]);
    expect(rooms[1].walls).toEqual([{ label: "Wall A", mm: 1800 }]);
  });

  it("pins a power point to its wall, offset, height and quantity", () => {
    const kitchen = importMeasurements(paste).rooms[0];
    const power = kitchen.servicePoints.find((p) => p.kind === "power")!;
    expect(power).toMatchObject({
      kind: "power",
      label: "double GPO",
      wall: "Wall A",
      offsetMm: 2400,
      heightMm: 1100,
      qty: 2,
      existing: true,
    });
  });

  it("leaves height and quantity unset when the paste didn't say", () => {
    const kitchen = importMeasurements(["Kitchen", "power GPO @ wall A 2400"].join("\n")).rooms[0];
    // The hand-entry form prefills 1100mm and a double outlet; an import must
    // not, or it records a height nobody measured.
    expect(kitchen.servicePoints[0]).toMatchObject({ heightMm: null, qty: 1, offsetMm: 2400 });
  });

  it("records water separately from power", () => {
    const kitchen = importMeasurements(paste).rooms[0];
    const water = kitchen.servicePoints.find((p) => p.kind === "water")!;
    expect(water).toMatchObject({ kind: "water", label: "sink mixer", wall: "Wall B", offsetMm: 900 });
  });

  it("accepts the synonyms a site sheet actually uses", () => {
    const { rooms, warnings } = importMeasurements(
      ["Kitchen", "GPO fridge @ wall C 2400", "drain: sink waste", "doorway 820"].join("\n")
    );
    expect(warnings).toEqual([]);
    const kinds = rooms[0].servicePoints.map((p) => p.kind);
    expect(kinds).toEqual(["power", "waste"]);
    expect(rooms[0].openings[0]).toMatchObject({ label: "Doorway", mm: 820 });
  });

  it("tolerates colons, bullets and numbering from a notes app", () => {
    const { rooms, warnings } = importMeasurements(
      ["Kitchen", "- wall A: 3600", "2) wall B: 2450", "• ceiling: 2700"].join("\n")
    );
    expect(warnings).toEqual([]);
    expect(rooms[0].walls).toEqual([
      { label: "Wall A", mm: 3600 },
      { label: "Wall B", mm: 2450 },
    ]);
    expect(rooms[0].ceilingMm).toBe(2700);
  });

  it("names the default room when the paste has no heading", () => {
    const { rooms } = importMeasurements("wall A 3600", { defaultRoom: "Laundry" });
    expect(rooms[0].name).toBe("Laundry");
  });

  it("warns on a line it couldn't read rather than dropping it", () => {
    const { rooms, warnings } = importMeasurements(["Kitchen", "wall A 3600", "wall B about a metre"].join("\n"));
    expect(rooms[0].walls).toHaveLength(1);
    expect(warnings).toEqual([{ line: 3, text: "wall B about a metre", reason: "no length on the line" }]);
  });

  it("returns no rooms for prose, so a stray paste can't wipe a measure", () => {
    const { rooms, warnings } = importMeasurements("Ring the client back about the splashback colour tomorrow.");
    expect(rooms).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("returns empty for an empty paste", () => {
    expect(importMeasurements("   \n  ")).toEqual({ rooms: [], warnings: [], format: "empty" });
  });
});

describe("importMeasurements — delimited", () => {
  const csv = [
    "room,type,label,mm,wall,offset,height,qty,existing",
    "Kitchen,wall,Wall A,3600",
    "Kitchen,wall,Wall B,2450",
    "Kitchen,ceiling,,2400",
    "Kitchen,opening,Window,1200,Wall A,800",
    "Kitchen,power,Fridge GPO,,Wall A,2400,1750,1,existing",
    "Kitchen,power,Island GPO,,Wall B,1200,900,4,new",
    "Kitchen,water,Sink,,Wall B,900,,1",
  ].join("\n");

  it("reads a spreadsheet paste with a header row", () => {
    const { rooms, warnings, format } = importMeasurements(csv);
    expect(format).toBe("delimited");
    expect(warnings).toEqual([]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].walls).toHaveLength(2);
    expect(rooms[0].ceilingMm).toBe(2400);
    expect(rooms[0].openings[0]).toMatchObject({ wall: "Wall A", offsetMm: 800 });
  });

  it("distinguishes an existing power point from one still to be run", () => {
    const points = importMeasurements(csv).rooms[0].servicePoints;
    expect(points.map((p) => [p.label, p.existing, p.qty])).toEqual([
      ["Fridge GPO", true, 1],
      ["Island GPO", false, 4],
      ["Sink", true, 1],
    ]);
  });

  it("reads a tab-separated paste and aliased column names", () => {
    const tsv = ["area\tkind\tname\tlength", "Kitchen\twall\tWall A\t3600"].join("\n");
    const { rooms, format } = importMeasurements(tsv);
    expect(format).toBe("delimited");
    expect(rooms[0].walls).toEqual([{ label: "Wall A", mm: 3600 }]);
  });

  it("warns per row and keeps the rest of the sheet", () => {
    const { rooms, warnings } = importMeasurements(
      ["room,type,label,mm", "Kitchen,wall,Wall A,3600", "Kitchen,sorcery,Wall B,2450"].join("\n")
    );
    expect(rooms[0].walls).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ line: 3, reason: 'unknown type "sorcery"' });
  });

  it("treats a comma'd freeform paste as freeform, not as a spreadsheet", () => {
    const { format, rooms } = importMeasurements(["Kitchen", "wall A, 3600"].join("\n"));
    expect(format).toBe("freeform");
    expect(rooms[0].walls).toEqual([{ label: "Wall A", mm: 3600 }]);
  });
});

describe("importSummary", () => {
  it("counts what was read", () => {
    const result = importMeasurements(
      ["Kitchen", "wall A 3600", "window 900 @ wall A 400", "power GPO @ wall A 2400"].join("\n")
    );
    expect(importSummary(result)).toBe("1 room · 1 wall · 1 opening · 1 service point");
  });

  it("says so when nothing was readable", () => {
    expect(importSummary(importMeasurements("just some prose here"))).toBe("Nothing readable in that paste");
  });
});
