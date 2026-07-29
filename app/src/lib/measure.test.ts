import { describe, it, expect } from "vitest";
import {
  emptyRoom,
  emptyServicePoint,
  parseMeasure,
  roomSummary,
  roomHasData,
  serviceCounts,
  servicePosition,
  isPlaceable,
} from "./measure";

describe("emptyRoom", () => {
  it("starts with a name, one wall and blank services", () => {
    const r = emptyRoom("r1", "Butler's pantry");
    expect(r.id).toBe("r1");
    expect(r.name).toBe("Butler's pantry");
    expect(r.walls).toHaveLength(1);
    expect(r.services).toEqual({ power: "", water: "", gas: "" });
    expect(roomHasData(r)).toBe(false);
  });
});

describe("parseMeasure", () => {
  it("round-trips valid data and coerces numeric strings to mm", () => {
    const raw = JSON.stringify({
      rooms: [
        {
          id: "r1", name: "Kitchen", ceilingMm: "2400",
          walls: [{ label: "A", mm: 3600 }, { label: "B", mm: "2100" }],
          openings: [{ label: "Window", mm: 900 }],
          services: { power: "GPO x4 on wall A", water: "", gas: "cooktop" },
          appliances: "Oven\nDishwasher",
          notes: "Slab floor",
          photoIds: ["doc1", 5, "doc2"],
        },
      ],
    });
    const { rooms } = parseMeasure(raw);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].ceilingMm).toBe(2400);
    expect(rooms[0].walls[1].mm).toBe(2100);
    expect(rooms[0].services.gas).toBe("cooktop");
    expect(rooms[0].photoIds).toEqual(["doc1", "doc2"]);
    expect(roomHasData(rooms[0])).toBe(true);
  });

  it("drops junk and defaults missing fields", () => {
    const raw = JSON.stringify({ rooms: [{ foo: 1 }, "nope", null] });
    const { rooms } = parseMeasure(raw);
    expect(rooms).toHaveLength(1); // only the object survives, normalised
    expect(rooms[0].name).toBe("Room 1");
    expect(rooms[0].ceilingMm).toBe(null);
    expect(rooms[0].walls).toEqual([]);
  });

  it("returns an empty structure for null / malformed input", () => {
    expect(parseMeasure(null)).toEqual({ rooms: [] });
    expect(parseMeasure("not json")).toEqual({ rooms: [] });
    expect(parseMeasure("{}")).toEqual({ rooms: [] });
  });
});

describe("roomSummary", () => {
  it("summarises what's captured", () => {
    const room = { ...emptyRoom("r1"), ceilingMm: 2400, walls: [{ label: "A", mm: 3600 }], openings: [{ label: "W", mm: 900 }], photoIds: ["p1"] };
    expect(roomSummary(room)).toBe("1 wall · ceiling 2400mm · 1 opening · 1 photo");
  });

  it("calls out power and water by name and folds the rest together", () => {
    const room = {
      ...emptyRoom("r1"),
      servicePoints: [
        emptyServicePoint("a", "power"),
        emptyServicePoint("b", "power"),
        emptyServicePoint("c", "water"),
        emptyServicePoint("d", "waste"),
        emptyServicePoint("e", "gas"),
      ],
    };
    expect(roomSummary(room)).toBe("2 power · 1 water · 2 other services");
  });

  it("reads empty when nothing is captured", () => {
    expect(roomSummary(emptyRoom("r1"))).toBe("Nothing captured yet");
  });
});

describe("service points", () => {
  it("starts a power point at bench height as a double", () => {
    const p = emptyServicePoint("sp1", "power");
    expect(p).toMatchObject({ kind: "power", heightMm: 1100, qty: 2, existing: true });
  });

  it("guesses nothing for the other services", () => {
    expect(emptyServicePoint("sp1", "water")).toMatchObject({ heightMm: null, qty: 1 });
  });

  it("normalises a stored point and keeps an unknown kind as power", () => {
    const raw = JSON.stringify({
      rooms: [
        {
          id: "r1",
          servicePoints: [
            { kind: "power", label: "Fridge", wall: " Wall A ", offsetMm: "2400", heightMm: 1750, qty: "1", existing: false },
            { kind: "sorcery", label: "Mystery" },
            { kind: "water", qty: 0 },
            "junk",
          ],
        },
      ],
    });
    const points = parseMeasure(raw).rooms[0].servicePoints;
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ wall: "Wall A", offsetMm: 2400, qty: 1, existing: false });
    expect(points[1].kind).toBe("power"); // kept, not dropped — a position is a fact
    expect(points[2].qty).toBe(1); // a quantity of zero makes no sense
  });

  it("reads an unmarked point as already on site", () => {
    const raw = JSON.stringify({ rooms: [{ id: "r1", servicePoints: [{ kind: "power" }] }] });
    expect(parseMeasure(raw).rooms[0].servicePoints[0].existing).toBe(true);
  });

  it("gives a point an id when the stored row has none", () => {
    const raw = JSON.stringify({ rooms: [{ id: "r1" }, { id: "r2", servicePoints: [{ kind: "gas" }] }] });
    expect(parseMeasure(raw).rooms[1].servicePoints[0].id).toBe("r2-sp-1");
  });

  it("defaults servicePoints to empty for a room saved before they existed", () => {
    const raw = JSON.stringify({ rooms: [{ id: "r1", walls: [{ label: "A", mm: 3600 }] }] });
    expect(parseMeasure(raw).rooms[0].servicePoints).toEqual([]);
  });

  it("counts by kind", () => {
    const room = { ...emptyRoom("r1"), servicePoints: [emptyServicePoint("a", "power"), emptyServicePoint("b", "power")] };
    expect(serviceCounts(room)).toEqual({ power: 2, water: 0, waste: 0, gas: 0, data: 0 });
  });

  it("describes a position, and says nothing when there isn't one", () => {
    const placed = { ...emptyServicePoint("a", "power"), wall: "Wall A", offsetMm: 2400 };
    expect(servicePosition(placed)).toBe("Wall A, 2400 from start, 1100 high");
    expect(isPlaceable(placed)).toBe(true);

    const floating = emptyServicePoint("b", "water");
    expect(servicePosition(floating)).toBe("");
    expect(isPlaceable(floating)).toBe(false);
  });
});
