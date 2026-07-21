import { describe, it, expect } from "vitest";
import { emptyRoom, parseMeasure, roomSummary, roomHasData } from "./measure";

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

  it("reads empty when nothing is captured", () => {
    expect(roomSummary(emptyRoom("r1"))).toBe("Nothing captured yet");
  });
});
