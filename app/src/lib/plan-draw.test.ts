import { describe, it, expect } from "vitest";
import { emptyRoom, emptyServicePoint, type Room, type ServicePoint } from "./measure";
import { planGeometry, renderPlanSvg, planNotes, serviceLine, esc } from "./plan-draw";

function room(over: Partial<Room> = {}): Room {
  return { ...emptyRoom("r1", "Kitchen"), walls: [], ...over };
}

function point(over: Partial<ServicePoint> = {}): ServicePoint {
  return { ...emptyServicePoint("sp1", "power"), ...over };
}

describe("service points on the plan", () => {
  const walls = [
    { label: "Wall A", mm: 4000 },
    { label: "Wall B", mm: 3000 },
  ];

  it("places a point along its wall at the captured offset", () => {
    const geo = planGeometry(
      room({ walls, servicePoints: [point({ wall: "Wall A", offsetMm: 1000, label: "Fridge GPO" })] })
    )!;
    expect(geo.services).toHaveLength(1);
    expect(geo.services[0]).toMatchObject({ kind: "power", code: "P", label: "Fridge GPO", existing: true });
    expect(geo.services[0].at).toEqual({ x: 1000, y: 0 }); // 1000 along the east wall
    expect(geo.unplacedServices).toEqual([]);
  });

  it("matches the wall regardless of how the label was cased", () => {
    const geo = planGeometry(room({ walls, servicePoints: [point({ wall: "wall b", offsetMm: 500 })] }))!;
    expect(geo.services[0].at).toEqual({ x: 4000, y: 500 });
  });

  it("clamps an offset that overruns the wall rather than dropping the point", () => {
    const geo = planGeometry(room({ walls, servicePoints: [point({ wall: "Wall A", offsetMm: 99999 })] }))!;
    expect(geo.services[0].at).toEqual({ x: 4000, y: 0 });
  });

  it("lists a point with no wall or no offset instead of guessing one", () => {
    const geo = planGeometry(
      room({
        walls,
        servicePoints: [
          point({ id: "a", label: "Behind the fridge" }),
          point({ id: "b", wall: "Wall A" }),
          point({ id: "c", wall: "Wall Z", offsetMm: 100 }),
        ],
      })
    )!;
    expect(geo.services).toEqual([]);
    expect(geo.unplacedServices.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("draws an existing point filled and one still to be run hollow", () => {
    const svg = renderPlanSvg(
      room({
        walls,
        servicePoints: [
          point({ id: "a", wall: "Wall A", offsetMm: 1000, label: "Existing GPO" }),
          point({ id: "b", kind: "water", wall: "Wall B", offsetMm: 900, label: "New tap", existing: false }),
        ],
      })
    )!;
    expect(svg).toContain("Existing GPO");
    expect(svg).toContain("New tap");
    expect(svg).toContain('fill="#d97706"'); // the existing power point is solid
    expect(svg).toContain("stroke-dasharray"); // the one to be provided is dashed
  });

  it("escapes a service label into the SVG", () => {
    const svg = renderPlanSvg(
      room({ walls, servicePoints: [point({ wall: "Wall A", offsetMm: 100, label: '<script>"x"' })] })
    )!;
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("serviceLine", () => {
  it("reads as a sentence a tradesman can work from", () => {
    expect(
      serviceLine(point({ label: "Island", wall: "Wall B", offsetMm: 1200, heightMm: 900, qty: 4, existing: false }))
    ).toBe("Power point ×4 — Island · Wall B, 1200 from start, 900 high · to be provided");
  });

  it("says only what was captured", () => {
    expect(serviceLine({ ...emptyServicePoint("sp1", "water"), label: "Sink", heightMm: null })).toBe(
      "Water — Sink"
    );
  });
});

describe("planGeometry", () => {
  it("lays four walls out clockwise into a closed rectangle", () => {
    const geo = planGeometry(
      room({
        walls: [
          { label: "Wall A", mm: 4000 },
          { label: "Wall B", mm: 3000 },
          { label: "Wall C", mm: 4000 },
          { label: "Wall D", mm: 3000 },
        ],
      })
    );
    expect(geo).not.toBeNull();
    expect(geo!.walls).toHaveLength(4);
    expect(geo!.walls[0].start).toEqual({ x: 0, y: 0 });
    expect(geo!.walls[0].end).toEqual({ x: 4000, y: 0 }); // east
    expect(geo!.walls[1].end).toEqual({ x: 4000, y: 3000 }); // south
    expect(geo!.walls[2].end).toEqual({ x: 0, y: 3000 }); // west
    expect(geo!.walls[3].end).toEqual({ x: 0, y: 0 }); // north, back to start
    expect(geo!.closed).toBe(true);
    expect(geo!.bounds).toEqual({ minX: 0, minY: 0, maxX: 4000, maxY: 3000 });
  });

  it("leaves an L of two walls open", () => {
    const geo = planGeometry(room({ walls: [{ label: "A", mm: 3000 }, { label: "B", mm: 2000 }] }));
    expect(geo!.closed).toBe(false);
    expect(geo!.walls).toHaveLength(2);
  });

  it("treats a near-miss as closed relative to the room's own size", () => {
    // 60mm out on a 6m room is a rounding error in a biro sketch.
    const geo = planGeometry(
      room({
        walls: [
          { label: "A", mm: 6000 },
          { label: "B", mm: 3000 },
          { label: "C", mm: 6000 },
          { label: "D", mm: 2940 },
        ],
      })
    );
    expect(geo!.closed).toBe(true);
  });

  it("does not call a genuinely open shape closed", () => {
    const geo = planGeometry(
      room({
        walls: [
          { label: "A", mm: 6000 },
          { label: "B", mm: 3000 },
          { label: "C", mm: 6000 },
          { label: "D", mm: 1500 },
        ],
      })
    );
    expect(geo!.closed).toBe(false);
  });

  it("ignores walls with no measurement and names unlabelled ones", () => {
    const geo = planGeometry(
      room({ walls: [{ label: "", mm: 2000 }, { label: "skip", mm: null }, { label: "", mm: 1000 }] })
    );
    expect(geo!.walls).toHaveLength(2);
    expect(geo!.walls.map((w) => w.label)).toEqual(["Wall A", "Wall B"]);
  });

  it("returns null when nothing has been measured", () => {
    expect(planGeometry(room({ walls: [] }))).toBeNull();
    expect(planGeometry(room({ walls: [{ label: "A", mm: null }] }))).toBeNull();
  });

  it("places an opening along its wall at the given offset", () => {
    const geo = planGeometry(
      room({
        walls: [{ label: "Wall A", mm: 4000 }],
        openings: [{ label: "Window", mm: 1200, wall: "wall a", offsetMm: 1000 }],
      })
    );
    expect(geo!.openings).toHaveLength(1);
    expect(geo!.openings[0].start).toEqual({ x: 1000, y: 0 });
    expect(geo!.openings[0].end).toEqual({ x: 2200, y: 0 });
    expect(geo!.unplaced).toHaveLength(0);
  });

  it("lists rather than guesses when an opening names no wall or an unknown one", () => {
    const geo = planGeometry(
      room({
        walls: [{ label: "Wall A", mm: 4000 }],
        openings: [
          { label: "Door", mm: 820 },
          { label: "Window", mm: 900, wall: "Wall Z", offsetMm: 100 },
          { label: "Servery", mm: 900, wall: "Wall A" }, // no offset
        ],
      })
    );
    expect(geo!.openings).toHaveLength(0);
    expect(geo!.unplaced.map((o) => o.label)).toEqual(["Door", "Window", "Servery"]);
  });

  it("clamps an opening that would overrun the end of its wall", () => {
    const geo = planGeometry(
      room({
        walls: [{ label: "Wall A", mm: 3000 }],
        openings: [{ label: "Window", mm: 1000, wall: "Wall A", offsetMm: 2800 }],
      })
    );
    expect(geo!.openings[0].start).toEqual({ x: 2000, y: 0 });
    expect(geo!.openings[0].end).toEqual({ x: 3000, y: 0 });
  });

  it("rejects an offset beyond the wall entirely rather than clamping it", () => {
    const geo = planGeometry(
      room({
        walls: [{ label: "Wall A", mm: 3000 }],
        openings: [{ label: "Window", mm: 900, wall: "Wall A", offsetMm: 4000 }],
      })
    );
    expect(geo!.openings).toHaveLength(0);
    expect(geo!.unplaced).toHaveLength(1);
  });
});

describe("renderPlanSvg", () => {
  const fourWalls = room({
    name: "Kitchen",
    ceilingMm: 2400,
    walls: [
      { label: "Wall A", mm: 4000 },
      { label: "Wall B", mm: 3000 },
      { label: "Wall C", mm: 4000 },
      { label: "Wall D", mm: 3000 },
    ],
  });

  it("produces an svg carrying every measured dimension", () => {
    const svg = renderPlanSvg(fourWalls)!;
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(">4000<");
    expect(svg).toContain(">3000<");
    expect(svg).toContain("Kitchen · ceiling 2400");
    expect(svg).toContain("All dimensions in mm");
  });

  it("never invents a dimension that wasn't measured", () => {
    const svg = renderPlanSvg(room({ walls: [{ label: "A", mm: 2500 }] }))!;
    const numbers = [...svg.matchAll(/>(\d{3,})</g)].map((m) => m[1]);
    expect(numbers).toEqual(["2500"]);
  });

  it("keeps the drawing inside the canvas whatever the room's proportions", () => {
    const wide = renderPlanSvg(room({ walls: [{ label: "A", mm: 20000 }, { label: "B", mm: 500 }] }), {
      width: 400,
      height: 300,
    })!;
    const coords = [...wide.matchAll(/[xy][12]?="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(400);
  });

  it("says so when the walls don't close", () => {
    const open = renderPlanSvg(room({ walls: [{ label: "A", mm: 3000 }, { label: "B", mm: 2000 }] }))!;
    expect(open).toContain("open plan, walls shown as measured");
    expect(renderPlanSvg(fourWalls)!).not.toContain("open plan");
  });

  it("draws placed openings and labels them", () => {
    const svg = renderPlanSvg(
      room({
        walls: [{ label: "Wall A", mm: 4000 }],
        openings: [{ label: "Window", mm: 1200, wall: "Wall A", offsetMm: 1000 }],
      })
    )!;
    expect(svg).toContain("Window 1200");
    expect(svg).toContain("#ea580c");
  });

  it("returns null when there is nothing to draw", () => {
    expect(renderPlanSvg(room({ walls: [] }))).toBeNull();
  });

  it("escapes room and wall text rather than emitting raw markup", () => {
    const svg = renderPlanSvg(room({ name: 'Kitchen <script>"&', walls: [{ label: "A & B", mm: 1000 }] }))!;
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Kitchen &lt;script&gt;&quot;&amp;");
    expect(svg).toContain("A &amp; B");
  });

  it("can be asked to leave the title off", () => {
    expect(renderPlanSvg(fourWalls, { title: false })!).not.toContain("All dimensions in mm");
  });
});

describe("planNotes", () => {
  it("collects what the drawing can't show", () => {
    const notes = planNotes(
      room({
        walls: [{ label: "Wall A", mm: 3000 }],
        openings: [{ label: "Door", mm: 820 }],
        services: { power: "GPO x4 on Wall A", water: "", gas: "cooktop" },
        appliances: "Oven\nDishwasher",
        notes: "Slab floor",
      })
    );
    const headings = notes.map((n) => n.heading);
    expect(headings).toEqual(["Openings without a position", "Service notes", "Appliances", "Site notes"]);
    expect(notes[0].body).toBe("Door 820mm");
    expect(notes[1].body).toBe("Power: GPO x4 on Wall A\nGas: cooktop");
  });

  it("leaves out sections with nothing in them", () => {
    expect(planNotes(room({ walls: [{ label: "A", mm: 1000 }] }))).toEqual([]);
  });

  it("still lists openings when there are no walls to draw at all", () => {
    const notes = planNotes(room({ walls: [], openings: [{ label: "Door", mm: 820 }] }));
    expect(notes[0].heading).toBe("Openings without a position");
  });
});

describe("esc", () => {
  it("escapes the characters that would break out of an svg attribute or text node", () => {
    expect(esc('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });
});
