import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    key: "accepted",
    subject: "Your kitchen installation is booked in — {{jobTitle}}",
    body:
      "Hi {{clientName}},\n\n" +
      "Great news — your kitchen installation \"{{jobTitle}}\" is booked in for {{startDate}} at {{startTime}}.\n\n" +
      "Address: {{address}}\n" +
      "Reference: {{reference}}\n\n" +
      "Your installer will call the day before to confirm access and parking. If you need to change anything, just reply to this email.\n\n" +
      "Kind regards,\n{{ownerName}}",
  },
  {
    key: "moved",
    subject: "Your kitchen installation has been rescheduled — {{jobTitle}}",
    body:
      "Hi {{clientName}},\n\n" +
      "Just letting you know we've moved your installation \"{{jobTitle}}\" to {{startDate}} at {{startTime}}.\n\n" +
      "Address: {{address}}\n" +
      "Reference: {{reference}}\n\n" +
      "Apologies for any inconvenience. Reply to this email if that doesn't suit and we'll find another slot.\n\n" +
      "Kind regards,\n{{ownerName}}",
  },
  {
    key: "cancelled",
    subject: "Your kitchen installation has been cancelled — {{jobTitle}}",
    body:
      "Hi {{clientName}},\n\n" +
      "We're sorry to let you know that your installation \"{{jobTitle}}\" (ref {{reference}}) has been cancelled.\n\n" +
      "If you'd like to rebook, just reply to this email and we'll sort out a new date.\n\n" +
      "Kind regards,\n{{ownerName}}",
  },
  {
    key: "report",
    subject: "Maintenance report for your kitchen — {{reference}}",
    body:
      "Hi {{clientName}},\n\n" +
      "Please find attached the maintenance report for \"{{jobTitle}}\" (ref {{reference}}).\n\n" +
      "Thank you for choosing Harrington Kitchens — please don't hesitate to get in touch with any questions.\n\n" +
      "Kind regards,\n{{ownerName}}",
  },
];

// Kitchen install rate card (ex GST) for the estimate / quote builder.
const PRICE_ITEMS = [
  { name: "Base cabinet install", unit: "each", price: 95, category: "Cabinetry" },
  { name: "Wall cabinet install", unit: "each", price: 85, category: "Cabinetry" },
  { name: "Tall / pantry cabinet install", unit: "each", price: 120, category: "Cabinetry" },
  { name: "Laminate benchtop install", unit: "metre", price: 60, category: "Benchtops" },
  { name: "Stone benchtop install", unit: "metre", price: 140, category: "Benchtops" },
  { name: "Splashback install", unit: "metre", price: 90, category: "Finishing" },
  { name: "Appliance fit (oven / cooktop / dishwasher)", unit: "each", price: 110, category: "Appliances" },
  { name: "Handle fitting", unit: "each", price: 8, category: "Finishing" },
  { name: "Kickboards & fillers", unit: "metre", price: 25, category: "Finishing" },
  { name: "Maintenance / warranty visit", unit: "hour", price: 95, category: "Service" },
];

const todos = (items: string[], doneCount = 0) =>
  JSON.stringify(items.map((label, i) => ({ label, done: i < doneCount })));

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL || "demo@harringtonkitchens.com.au";

  await prisma.account.upsert({
    where: { email: ownerEmail },
    update: { name: "Harrington Kitchens" },
    create: { email: ownerEmail, name: "Harrington Kitchens" },
  });

  for (const t of DEFAULT_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {}, // don't clobber edits on re-seed
      create: t,
    });
  }

  // Demo data — only if the database is empty, so it's safe to run anywhere.
  const jobCount = await prisma.job.count();
  if (jobCount > 0) {
    console.log("Seed complete (demo data skipped — database already has jobs).");
    return;
  }

  const now = new Date();
  // Install crews work weekdays — nudge any weekend date to the next Monday
  // (backwards for past dates) so the demo schedule looks right on any day.
  const at = (dayOffset: number, hour: number, min = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    const dir = dayOffset < 0 ? -1 : 1;
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + dir);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  // ---- The install team ----
  const dave = await prisma.installer.create({
    data: {
      name: "Dave Morrison",
      role: "Lead installer",
      phone: "0412 345 678",
      email: "dave@harringtonkitchens.com.au",
      color: "#0d9488",
      notes: "15 years on the tools. Runs the Hampton / shaker installs.",
    },
  });
  const sofia = await prisma.installer.create({
    data: {
      name: "Sofia Nguyen",
      role: "Installer · stone specialist",
      phone: "0423 456 789",
      email: "sofia@harringtonkitchens.com.au",
      color: "#b45309",
      notes: "Handles stone benchtops and splashbacks.",
    },
  });
  const liam = await prisma.installer.create({
    data: {
      name: "Liam Carter",
      role: "Installer",
      phone: "0434 567 890",
      email: "liam@harringtonkitchens.com.au",
      color: "#0369a1",
      notes: "Covers the builder / project work.",
    },
  });
  await prisma.installer.create({
    data: {
      name: "Marcus Webb",
      role: "Apprentice",
      phone: "0445 678 901",
      email: "marcus@harringtonkitchens.com.au",
      color: "#7c3aed",
      notes: "3rd year. Usually paired with Dave.",
    },
  });

  // ---- Builder companies we install for (lead sources) ----
  const bellbrook = await prisma.leadSource.create({
    data: { name: "Bellbrook Homes", displayName: "Bellbrook Homes", email: "bellbrookhomes.com.au" },
  });
  const sterling = await prisma.leadSource.create({
    data: { name: "Sterling Property Group", displayName: "Sterling Property Group", email: "sterlingproperty.com.au" },
  });

  // ---- Homeowner clients (each gets a portal) ----
  const mkClient = (name: string, email: string, phone: string, address: string) =>
    prisma.client.create({ data: { name, email, phone, address } });

  const mitchell = await mkClient("Sarah & Tom Mitchell", "sarah.mitchell@example.com", "0400 111 222", "14 Acacia Drive, Harrington Park NSW");
  const patel = await mkClient("Priya Patel", "priya.patel@example.com", "0400 333 444", "8 Fairway Close, Camden NSW");
  const holloway = await mkClient("James & Lucy Holloway", "j.holloway@example.com", "0400 555 666", "22 Wisteria Avenue, Oran Park NSW");
  const doyle = await mkClient("Megan Doyle", "megan.doyle@example.com", "0400 777 888", "3 Banksia Street, Narellan Vale NSW");
  const chen = await mkClient("Robert Chen", "robert.chen@example.com", "0400 999 000", "41 Stonequarry Road, Picton NSW");
  const fletcher = await mkClient("Emma Fletcher", "emma.fletcher@example.com", "0401 222 333", "5 Seaspray Court, Gerringong NSW");

  // ---- Price list ----
  for (const p of PRICE_ITEMS) await prisma.priceItem.create({ data: p });

  // ---- Jobs across the lifecycle ----
  const mitchellJob = await prisma.job.create({
    data: {
      reference: "JOB-1001",
      title: "Mitchell — Hampton shaker kitchen",
      description:
        "Full kitchen install: white shaker profile, 40mm Caesarstone island, brushed brass handles, " +
        "900mm freestanding oven, integrated dishwasher, walk-in pantry shelving.",
      status: "scheduled",
      priority: "high",
      clientId: mitchell.id,
      clientName: "Sarah Mitchell",
      clientEmail: "sarah.mitchell@example.com",
      clientPhone: "0400 111 222",
      address: "14 Acacia Drive, Harrington Park NSW",
      installerId: dave.id,
      quoteAmount: 28400,
      durationMins: 3 * 8 * 60, // three days on site
      scheduledStart: at(1, 6, 30),
      scheduledEnd: at(3, 15, 0),
      todos: todos([
        "Protect floors & set up work area",
        "Set out and level base cabinets",
        "Install island frame & panels",
        "Fit wall cabinets & pantry shelving",
        "Template check for stone install",
        "Fit doors, drawers & handles",
        "Silicone & final clean",
      ]),
      estimateItems: JSON.stringify([
        { description: "Base cabinet install", quantity: 14, unitAmount: 95 },
        { description: "Wall cabinet install", quantity: 10, unitAmount: 85 },
        { description: "Tall / pantry cabinet install", quantity: 3, unitAmount: 120 },
        { description: "Stone benchtop install", quantity: 7.2, unitAmount: 140 },
        { description: "Appliance fit (oven / cooktop / dishwasher)", quantity: 3, unitAmount: 110 },
        { description: "Handle fitting", quantity: 38, unitAmount: 8 },
      ]),
    },
  });

  const patelJob = await prisma.job.create({
    data: {
      reference: "JOB-1002",
      title: "Patel — Matte black & timber kitchen",
      description:
        "Two-tone kitchen: matte black lowers, timber-look uppers, 20mm stone benchtop, undermount sink, " +
        "induction cooktop. Day 2 of 2 on site.",
      status: "in_progress",
      priority: "normal",
      clientId: patel.id,
      clientName: "Priya Patel",
      clientEmail: "priya.patel@example.com",
      clientPhone: "0400 333 444",
      address: "8 Fairway Close, Camden NSW",
      installerId: sofia.id,
      quoteAmount: 19750,
      durationMins: 2 * 8 * 60,
      scheduledStart: at(-1, 6, 30),
      scheduledEnd: at(0, 15, 0),
      todos: todos(
        [
          "Set out and level base cabinets",
          "Fit wall cabinets",
          "Install stone benchtop",
          "Fit splashback",
          "Connect sink & appliances check",
          "Doors, drawers & handles",
          "Silicone & final clean",
        ],
        4
      ),
    },
  });

  const bellbrookJob = await prisma.job.create({
    data: {
      reference: "JOB-1003",
      title: "Lot 214 Emerald Hills — kitchen & laundry install",
      description: "Builder install for Bellbrook Homes: standard Emerald Hills spec kitchen plus laundry run.",
      status: "scheduled",
      priority: "normal",
      companyId: bellbrook.id,
      clientName: "Site super: Mick Doran",
      clientPhone: "0410 222 333",
      address: "Lot 214 Emerald Hills Blvd, Leppington NSW",
      installerId: liam.id,
      quoteAmount: 12900,
      durationMins: 2 * 8 * 60,
      scheduledStart: at(3, 6, 30),
      scheduledEnd: at(4, 15, 0),
    },
  });

  await prisma.job.create({
    data: {
      reference: "JOB-1004",
      title: "Holloway — Island bench & butler's pantry",
      description: "Stage 2: oak-veneer island with waterfall stone ends, butler's pantry fit-out behind existing kitchen.",
      status: "accepted",
      priority: "normal",
      clientId: holloway.id,
      clientName: "James Holloway",
      clientEmail: "j.holloway@example.com",
      clientPhone: "0400 555 666",
      address: "22 Wisteria Avenue, Oran Park NSW",
      quoteAmount: 9800,
      durationMins: 8 * 60,
    },
  });

  await prisma.job.create({
    data: {
      reference: "JOB-1005",
      title: "Doyle — Kitchen renovation",
      description: "Rip out existing kitchen, install new L-shape with corner pantry. Client staying in the house — dust control.",
      status: "scheduled",
      priority: "normal",
      clientId: doyle.id,
      clientName: "Megan Doyle",
      clientEmail: "megan.doyle@example.com",
      clientPhone: "0400 777 888",
      address: "3 Banksia Street, Narellan Vale NSW",
      installerId: dave.id,
      quoteAmount: 16200,
      durationMins: 2 * 8 * 60,
      scheduledStart: at(7, 6, 30),
      scheduledEnd: at(8, 15, 0),
    },
  });

  await prisma.job.create({
    data: {
      reference: "JOB-1006",
      title: "Lot 118 Willowdale — kitchen install",
      description: "Builder install for Sterling Property Group: display-home spec, stone island, pendant cutouts.",
      status: "scheduled",
      priority: "low",
      companyId: sterling.id,
      clientName: "Site super: Anna Kovac",
      clientPhone: "0411 444 555",
      address: "Lot 118 Willowdale Drive, Denham Court NSW",
      installerId: sofia.id,
      quoteAmount: 11400,
      durationMins: 2 * 8 * 60,
      scheduledStart: at(10, 6, 30),
      scheduledEnd: at(11, 15, 0),
    },
  });

  // A maintenance request that arrived via the client portal — sits in the
  // dashboard inbox as a job to confirm.
  const chenRequest = await prisma.job.create({
    data: {
      reference: "JOB-1007",
      title: "Maintenance visit — Robert Chen",
      description:
        "Re: Chen — Farmhouse kitchen (JOB-0987)\n\n" +
        "The pantry door has dropped slightly and catches on the frame when closing. " +
        "Also one drawer runner feels stiff.",
      status: "lead",
      priority: "normal",
      clientId: chen.id,
      clientName: "Robert Chen",
      clientEmail: "robert.chen@example.com",
      clientPhone: "0400 999 000",
      address: "41 Stonequarry Road, Picton NSW",
      leadSource: "client-portal",
      notes: "Requested via the client portal.",
      maintenanceTasks: todos([
        "Re-check & adjust door alignment",
        "Re-check & adjust drawer runners",
        "Tighten handles & hinges",
        "Inspect & top up silicone / sealing",
        "Confirm client satisfaction",
      ]),
    },
  });

  // ---- Completed jobs with maintenance reports ----
  const fletcherJob = await prisma.job.create({
    data: {
      reference: "JOB-0998",
      title: "Fletcher — Coastal kitchen & laundry",
      description: "Coastal-style kitchen with shaker doors, engineered stone tops, plus matching laundry run.",
      status: "completed",
      priority: "normal",
      clientId: fletcher.id,
      clientName: "Emma Fletcher",
      clientEmail: "emma.fletcher@example.com",
      clientPhone: "0401 222 333",
      address: "5 Seaspray Court, Gerringong NSW",
      installerId: dave.id,
      quoteAmount: 23600,
      durationMins: 3 * 8 * 60,
      scheduledStart: at(-6, 6, 30),
      scheduledEnd: at(-4, 15, 0),
      completedAt: at(-4, 14, 30),
      todos: todos(
        ["Set out and level base cabinets", "Fit wall cabinets", "Install stone benchtops", "Fit laundry run", "Doors, drawers & handles", "Silicone & final clean"],
        6
      ),
    },
  });

  await prisma.maintenanceReport.create({
    data: {
      jobId: fletcherJob.id,
      installerId: dave.id,
      status: "sent",
      sentAt: at(-4, 15, 30),
      data: JSON.stringify({
        scope: "Kitchen & laundry installation",
        workCarried:
          "Installed full kitchen (14 base, 9 wall, 2 tall cabinets), engineered stone benchtops, splashback and " +
          "appliance fit. Matching laundry run with tub cabinet. All doors and drawers aligned, siliconed and site cleaned.",
        engineer: "Dave Morrison",
        visitDate: at(-4, 0).toISOString().slice(0, 10),
        condition: "Good",
        findings: "Minor wall bow behind fridge cavity packed and scribed. No outstanding defects.",
        recommendations: "Return-trip maintenance in 3 months to re-check door alignment once cabinetry settles.",
        rooms: [
          {
            name: "Kitchen",
            items: [
              { label: "Cabinets installed & secured", done: true },
              { label: "Benchtop fitted", done: true },
              { label: "Splashback installed", done: true },
              { label: "Sink & tapware connected", done: true },
              { label: "Appliances fitted & tested", done: true },
              { label: "Doors & drawers aligned", done: true },
              { label: "Handles fitted", done: true },
              { label: "Silicone & sealing complete", done: true },
              { label: "Site cleaned & rubbish removed", done: true },
            ],
          },
          {
            name: "Laundry",
            items: [
              { label: "Cabinets installed & secured", done: true },
              { label: "Benchtop fitted", done: true },
              { label: "Tub & tapware connected", done: true },
              { label: "Silicone & sealing complete", done: true },
            ],
          },
        ],
        signOffName: "Emma Fletcher",
        signOffDate: at(-4, 0).toISOString().slice(0, 10),
      }),
    },
  });

  const obrienJob = await prisma.job.create({
    data: {
      reference: "JOB-0991",
      title: "O'Brien — Two-pac gloss kitchen",
      description: "High-gloss two-pac kitchen with handleless finger-pull profile and mirrored splashback.",
      status: "completed",
      priority: "normal",
      clientName: "Daniel O'Brien",
      clientEmail: "d.obrien@example.com",
      address: "17 Kurrajong Road, Mount Annan NSW",
      installerId: liam.id,
      quoteAmount: 21100,
      durationMins: 2 * 8 * 60,
      scheduledStart: at(-13, 6, 30),
      scheduledEnd: at(-12, 15, 0),
      completedAt: at(-12, 14, 0),
    },
  });

  await prisma.maintenanceReport.create({
    data: {
      jobId: obrienJob.id,
      installerId: liam.id,
      status: "draft",
      data: JSON.stringify({
        scope: "Kitchen installation",
        workCarried: "Installed two-pac kitchen with handleless profile. Splashback installer booked separately.",
        engineer: "Liam Carter",
        rooms: [
          {
            name: "Kitchen",
            items: [
              { label: "Cabinets installed & secured", done: true },
              { label: "Benchtop fitted", done: true },
              { label: "Doors & drawers aligned", done: true },
              { label: "Silicone & sealing complete", done: false },
              { label: "Site cleaned & rubbish removed", done: true },
            ],
          },
        ],
        outstandingWorks: "Silicone to splashback junction once mirror splashback is installed (third party).",
      }),
    },
  });

  // ---- A little activity history so the feeds aren't empty ----
  const log = (jobId: string, type: string, message: string, minsAgo: number) =>
    prisma.activity.create({
      data: { jobId, type, message, createdAt: new Date(now.getTime() - minsAgo * 60_000) },
    });

  await log(mitchellJob.id, "status_change", "Status changed to Scheduled", 60 * 26);
  await log(mitchellJob.id, "calendar", "Calendar event created for the install dates (demo mode)", 60 * 26);
  await log(mitchellJob.id, "email", "Booking confirmation email queued to Sarah Mitchell (demo mode)", 60 * 25);
  await log(patelJob.id, "status_change", "Status changed to In progress — Sofia on site", 60 * 8);
  await log(bellbrookJob.id, "note", "PO received from Bellbrook Homes — plans filed", 60 * 50);
  await log(fletcherJob.id, "report", "Maintenance report sent to Emma Fletcher", 60 * 96);
  await log(chenRequest.id, "note", "Maintenance visit requested by Robert Chen via the client portal.", 60 * 3);

  console.log("Seeded Harrington Kitchens demo data: 4 installers, 6 clients, 9 jobs, 2 reports.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
