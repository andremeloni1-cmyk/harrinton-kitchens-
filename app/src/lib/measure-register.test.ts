import { describe, it, expect } from "vitest";
import { searchRegister, registerTotals, orphanedPhotos, roomsWithRefs, type RegisterEntry } from "./measure-register";
import { emptyRoom, emptyServicePoint, type Room } from "./measure";

function room(over: Partial<Room> = {}): Room {
  return { ...emptyRoom("r1", "Kitchen"), walls: [], ...over };
}

function entry(over: Partial<RegisterEntry> = {}): RegisterEntry {
  return {
    ref: "CM-1042",
    jobId: "j1",
    jobReference: "JOB-1042",
    title: "Kitchen renovation",
    clientName: "Wilson",
    address: "12 Bourke St, Wollongong",
    status: "complete",
    measuredByName: "Dave",
    measuredAt: "2026-03-02T00:00:00.000Z",
    completedAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    data: { rooms: [room()] },
    photoIds: [],
    ...over,
  };
}

describe("searchRegister", () => {
  const entries = [
    entry(),
    entry({ ref: "CM-1043", jobId: "j2", jobReference: "JOB-1043", clientName: "Nguyen", address: "4 Keira St" }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchRegister(entries, "  ")).toHaveLength(2);
  });

  it("jumps to a measure by its reference", () => {
    const found = searchRegister(entries, "CM-1043");
    expect(found).toHaveLength(1);
    expect(found[0].entry.ref).toBe("CM-1043");
    expect(found[0].roomIndex).toBeNull();
  });

  it("points at the room when the reference names one", () => {
    const two = entry({ data: { rooms: [room(), room({ id: "r2", name: "Pantry" })] } });
    expect(searchRegister([two], "cm-1042-r2")[0].roomIndex).toBe(1);
  });

  it("still finds the measure when the referenced room has since been deleted", () => {
    const found = searchRegister([entry()], "CM-1042-R7");
    expect(found).toHaveLength(1);
    expect(found[0].roomIndex).toBeNull();
  });

  it("matches a reference exactly, so a partial one doesn't return the wrong job", () => {
    expect(searchRegister(entries, "CM-104")).toEqual([]);
  });

  it("searches the address, client and room names loosely", () => {
    expect(searchRegister(entries, "bourke")[0].entry.ref).toBe("CM-1042");
    expect(searchRegister(entries, "nguyen")[0].entry.ref).toBe("CM-1043");
    const pantry = entry({ ref: "CM-9", jobId: "j3", data: { rooms: [room({ name: "Butler's pantry" })] } });
    expect(searchRegister([...entries, pantry], "butler")[0].entry.ref).toBe("CM-9");
  });

  it("requires every word, so a second term narrows the result", () => {
    expect(searchRegister(entries, "wilson bourke")).toHaveLength(1);
    expect(searchRegister(entries, "wilson keira")).toEqual([]);
  });

  it("finds a job by its own reference too", () => {
    expect(searchRegister(entries, "JOB-1043")[0].entry.ref).toBe("CM-1043");
  });
});

describe("registerTotals", () => {
  it("counts dimensions, services and photos across every room", () => {
    const totals = registerTotals(
      entry({
        data: {
          rooms: [
            room({
              walls: [
                { label: "A", mm: 3600 },
                { label: "B", mm: null }, // unmeasured walls don't count
              ],
              openings: [{ label: "Window", mm: 1200 }],
              servicePoints: [
                emptyServicePoint("a", "power"),
                { ...emptyServicePoint("b", "power"), existing: false },
                emptyServicePoint("c", "water"),
              ],
              photoIds: ["p1", "p2"],
            }),
            room({ id: "r2", walls: [{ label: "A", mm: 1800 }], servicePoints: [emptyServicePoint("d", "gas")] }),
          ],
        },
      })
    );
    expect(totals).toMatchObject({
      rooms: 2,
      walls: 2,
      openings: 1,
      servicesTotal: 4,
      photos: 2,
      toBeProvided: 1,
    });
    expect(totals.services).toEqual({ power: 2, water: 1, waste: 0, gas: 1, data: 0 });
  });

  it("reads zeroes for an empty measure", () => {
    expect(registerTotals(entry({ data: { rooms: [] } }))).toMatchObject({ rooms: 0, walls: 0, servicesTotal: 0 });
  });
});

describe("orphanedPhotos", () => {
  it("finds photos on the job that no room claims", () => {
    const e = entry({ data: { rooms: [room({ photoIds: ["p1"] })] }, photoIds: ["p1", "p2"] });
    expect(orphanedPhotos(e)).toEqual(["p2"]);
  });

  it("finds none when every photo is claimed", () => {
    expect(orphanedPhotos(entry({ data: { rooms: [room({ photoIds: ["p1"] })] }, photoIds: ["p1"] }))).toEqual([]);
  });
});

describe("roomsWithRefs", () => {
  it("numbers the rooms off the measure's reference", () => {
    const e = entry({ data: { rooms: [room(), room({ id: "r2", name: "Pantry" })] } });
    expect(roomsWithRefs(e).map((r) => r.ref)).toEqual(["CM-1042-R1", "CM-1042-R2"]);
  });
});
