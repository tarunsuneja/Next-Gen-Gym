import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(
      (await readFile("supabase/migrations/" + file, "utf8")).replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  }
  const owner = "10000000-0000-0000-0000-000000000001",
    staff = "10000000-0000-0000-0000-000000000002",
    outsider = "10000000-0000-0000-0000-000000000003";
  await db.query(
    "insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)",
    [
      owner,
      "owner@test.local",
      staff,
      "staff@test.local",
      outsider,
      "outside@test.local",
    ],
  );
  const g = (
    await db.query("insert into gyms(name) values('Test Gym') returning id")
  ).rows[0].id;
  await db.query(
    "insert into staff_profiles(user_id,gym_id,role) values($1,$2,'owner'),($3,$2,'reception')",
    [owner, g, staff],
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const action = async (type, payload, requestId = crypto.randomUUID()) =>
    db.query("select gym_action($1,$2::jsonb,$3::uuid)", [
      type,
      JSON.stringify(payload),
      requestId,
    ]);
  await action("member", { name: "Member One", phone: "9876543210" });
  await assert.rejects(
    () => action("member", { name: "Duplicate", phone: "+91 98765 43210" }),
    /already exists/,
  );
  await assert.rejects(
    () => action("member", { name: "Invalid", phone: "abc9876543219" }),
    /valid phone/,
  );
  await assert.rejects(
    () =>
      action("member", {
        name: "Invalid",
        phone: "9876543219",
        email: "broken",
      }),
    /valid email/,
  );
  await action("member", {
    name: "Member Two",
    phone: "9876543211",
    gender: "Female",
    address: "42 MG Road, Bengaluru",
    height: "165.5",
    weight: "58",
  });
  await assert.rejects(
    () =>
      action("member", {
        name: "Member Three",
        phone: "9876543212",
        gender: "Other",
      }),
    /Gender must be Male or Female/,
  );
  await assert.rejects(
    () =>
      action("member", {
        name: "Member Three",
        phone: "9876543212",
        height: "400",
      }),
    /Height must be between 50 and 300/,
  );
  await assert.rejects(
    () =>
      action("member", {
        name: "Member Three",
        phone: "9876543212",
        weight: "8",
      }),
    /Weight must be between 10 and 500/,
  );
  await action("plan", { name: "Monthly", months: 1, price: 150000 });
  const read = async () =>
    (await db.query("select get_gym_data() as data")).rows[0].data;
  let d = await read();
  const memberTwo = d.members.find((m) => m.name === "Member Two");
  assert.equal(memberTwo.gender, "Female");
  assert.equal(memberTwo.address, "42 MG Road, Bengaluru");
  assert.equal(memberTwo.height, "165.5");
  assert.equal(memberTwo.weight, "58");
  assert.equal(d.members.find((m) => m.name === "Member One").gender, "");
  await action("member", {
    id: memberTwo.id,
    name: "Member Two",
    phone: "9876543211",
    gender: "Male",
    address: "7 Brigade Road",
    height: "170",
    weight: "70.5",
  });
  d = await read();
  const edited = d.members.find((m) => m.id === memberTwo.id);
  assert.equal(edited.gender, "Male");
  assert.equal(edited.address, "7 Brigade Road");
  assert.equal(edited.height, "170");
  assert.equal(edited.weight, "70.5");
  await action("membership", {
    memberId: d.members[0].id,
    planId: d.plans[0].id,
    start: "2026-01-31",
    amount: 150000,
  });
  d = await read();
  assert.equal(d.memberships[0].end, "2026-02-27");
  await assert.rejects(
    () =>
      action("membership", {
        memberId: d.members[0].id,
        planId: d.plans[0].id,
        start: "2026-02-01",
        amount: 150000,
      }),
    /overlap/,
  );
  const request = crypto.randomUUID(),
    pay = { membershipId: d.memberships[0].id, amount: 50000, method: "Cash" };
  await action("payment", pay, request);
  await action("payment", pay, request);
  d = await read();
  assert.equal(d.payments.length, 1);
  assert.equal(d.payments[0].receipt, "GD-000001");
  assert.equal(d.payments[0].requestId, request);
  await assert.rejects(
    () => action("payment", { ...pay, amount: 100001 }),
    /pending balance/,
  );
  await action("settings", {
    name: "Renamed Gym",
    phone: "123",
    address: "New address",
  });
  d = await read();
  assert.equal(d.payments[0].gymName, "Test Gym");
  await action("plan", {
    id: d.plans[0].id,
    name: "Updated monthly",
    months: 2,
    price: 200000,
  });
  d = await read();
  assert.equal(d.plans.length, 1);
  assert.equal(d.plans[0].price, 200000);
  assert.equal(d.plans[0].months, 2);
  assert.equal(d.memberships[0].amount, 150000);
  assert.equal(d.memberships[0].planName, "Monthly");
  await assert.rejects(
    () =>
      action("plan", {
        id: crypto.randomUUID(),
        name: "Missing",
        months: 1,
        price: 1,
      }),
    /Plan not found/,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () =>
      action("plan", {
        id: d.plans[0].id,
        name: "Staff change",
        months: 1,
        price: 1,
      }),
    /Owner/,
  );
  await assert.rejects(
    () => action("void", { id: d.payments[0].id, reason: "Correction" }),
    /Owner/,
  );
  await assert.rejects(
    () =>
      action("attendance", {
        memberId: d.members[0].id,
        override: "Expired override",
      }),
    /Owner override/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("void", { id: d.payments[0].id, reason: "Correction" });
  await action("payment", { ...pay, amount: 150000 });
  await action("attendance", {
    memberId: d.members[0].id,
    override: "Owner approved visit",
  });
  await assert.rejects(
    () =>
      action("attendance", {
        memberId: d.members[0].id,
        override: "Owner approved visit",
      }),
    /unique/,
  );
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("member", {
    name: "Lifecycle Member",
    phone: "9876543220",
    whatsappConsent: true,
  });
  d = await read();
  const lifecycleMember = d.members.find((m) => m.name === "Lifecycle Member");
  assert.equal(lifecycleMember.whatsappConsent, true);
  const day = (
    await db.query(
      "select (now() at time zone 'Asia/Kolkata')::date::text as day",
    )
  ).rows[0].day;
  await action("membership", {
    memberId: lifecycleMember.id,
    planId: d.plans[0].id,
    start: day,
    amount: 200000,
    dueDate: day,
  });
  d = await read();
  let period = d.memberships.find((s) => s.memberId === lifecycleMember.id);
  assert.equal(period.dueDate, day);
  const initialEnd = period.end;
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () =>
      action("freeze", {
        id: period.id,
        start: day,
        end: day,
        reason: "Travel hold",
      }),
    /Owner/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("freeze", {
    id: period.id,
    start: day,
    end: day,
    reason: "Travel hold",
  });
  d = await read();
  period = d.memberships.find((s) => s.id === period.id);
  assert.equal(period.freezeStart, day);
  assert.notEqual(period.end, initialEnd);
  await assert.rejects(
    () =>
      action("freeze", {
        id: period.id,
        start: day,
        end: day,
        reason: "Travel hold",
      }),
    /existing freeze/,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () => action("attendance", { memberId: lifecycleMember.id }),
    /Owner override/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("resume", { id: period.id, reason: "Returned early" });
  d = await read();
  period = d.memberships.find((s) => s.id === period.id);
  assert.equal(period.end, initialEnd);
  assert.equal(period.freezeStart, null);
  await action("dueDate", { id: period.id, dueDate: "2026-01-01" });
  await action("reminder", {
    memberId: lifecycleMember.id,
    kind: "Phone call",
    note: "Will visit tomorrow",
    nextDate: day,
  });
  d = await read();
  assert.equal(d.reminders.at(-1).note, "Will visit tomorrow");
  await action("cancel", { id: period.id, reason: "Member relocating" });
  d = await read();
  period = d.memberships.find((s) => s.id === period.id);
  assert.equal(period.cancelled, true);
  assert.equal(period.amount, 200000);
  await assert.rejects(
    () =>
      action("freeze", {
        id: period.id,
        start: day,
        end: day,
        reason: "Travel hold",
      }),
    /Available membership/,
  );
  await action("membership", {
    memberId: lifecycleMember.id,
    planId: d.plans[0].id,
    start: day,
    amount: 200000,
  });
  const familyRequest = crypto.randomUUID(),
    familyPayload = {
      name: "Family member",
      phone: "+91 9876543220",
      sharedPhone: true,
    };
  await action("member", familyPayload, familyRequest);
  await action("member", familyPayload, familyRequest);
  d = await read();
  const family = d.members.find((m) => m.name === "Family member");
  assert.equal(d.members.filter((m) => m.name === "Family member").length, 1);
  assert.equal(family.phone, "9876543220");
  await action("member", {
    id: family.id,
    name: "Updated family",
    phone: family.phone,
  });
  await assert.rejects(
    () =>
      action("member", {
        id: family.id,
        name: "Changed family",
        phone: "9876543210",
      }),
    /already exists/,
  );
  await assert.rejects(
    () => action("whatsappConfig", { enabled: true }),
    /phone number ID/,
  );
  await action("whatsappConfig", {
    phoneNumberId: "123456789012345",
    wabaId: "987654321",
    displayName: "Test Gym",
    senderPhone: "919800000000",
    enabled: false,
    dailySendCap: 50,
    quietStart: "21:00",
    quietEnd: "08:00",
  });
  d = await read();
  assert.equal(d.whatsapp.config.phoneNumberId, "123456789012345");
  assert.equal(d.whatsapp.config.enabled, false);
  assert.equal(d.whatsapp.config.dailySendCap, 50);
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () =>
      action("whatsappTemplate", {
        name: "x",
        body: "y",
        category: "utility",
      }),
    /Owner permission/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("whatsappSeed", {});
  d = await read();
  assert.equal(d.whatsapp.templates.length, 5);
  assert.equal(d.whatsapp.rules.length, 5);
  await assert.rejects(
    () =>
      action("whatsappTemplate", {
        name: "Bad Name",
        body: "Hello",
        category: "utility",
      }),
    /lowercase/,
  );
  await assert.rejects(
    () =>
      action("whatsappTemplate", {
        name: "no_body",
        body: "",
        category: "utility",
      }),
    /body is required/,
  );
  await action("whatsappTemplate", {
    name: "custom_checkin",
    category: "utility",
    language: "en",
    body: "Hi {{member_name}}",
    variables: ["member_name"],
  });
  d = await read();
  let custom = d.whatsapp.templates.find((t) => t.name === "custom_checkin");
  assert.ok(custom);
  await action("whatsappTemplate", {
    id: custom.id,
    name: "custom_checkin",
    category: "utility",
    language: "en",
    body: "Hello {{member_name}}",
    variables: ["member_name"],
    isActive: true,
  });
  d = await read();
  custom = d.whatsapp.templates.find((t) => t.id === custom.id);
  assert.equal(custom.body, "Hello {{member_name}}");
  await assert.rejects(
    () =>
      action("reminderRule", {
        name: "Ghost",
        offsetDays: 2,
        templateName: "does_not_exist",
        audience: "expiring",
      }),
    /existing template/,
  );
  await action("reminderRule", {
    name: "Custom 5 day",
    offsetDays: -5,
    templateName: "custom_checkin",
    audience: "expiring",
  });
  d = await read();
  const customRule = d.whatsapp.rules.find((r) => r.name === "Custom 5 day");
  assert.ok(customRule);
  await assert.rejects(
    () => action("whatsappTemplateDelete", { id: custom.id }),
    /reassign rules/,
  );
  await action("whatsappTemplate", {
    id: custom.id,
    name: "renamed_checkin",
    category: "utility",
    language: "en",
    body: "{{gym_name}} greets {{member_name}} from {{gym_name}}",
    variables: [],
  });
  d = await read();
  assert.equal(
    d.whatsapp.rules.find((r) => r.id === customRule.id).templateName,
    "renamed_checkin",
  );
  assert.deepEqual(
    d.whatsapp.templates.find((t) => t.id === custom.id).variables,
    ["gym_name", "member_name", "gym_name"],
  );
  await assert.rejects(
    () =>
      action("whatsappTemplate", {
        id: custom.id,
        name: "renewal_reminder",
        category: "utility",
        body: "Hello",
      }),
    /already exists/,
  );
  await action("reminderRuleDelete", { id: customRule.id });
  await action("whatsappTemplateDelete", { id: custom.id });
  await assert.rejects(
    () => action("reminderRuleDelete", { id: customRule.id }),
    /not found/,
  );
  d = await read();
  assert.equal(
    d.whatsapp.rules.some((r) => r.name === "Custom 5 day"),
    false,
  );
  assert.equal(
    d.whatsapp.templates.some((t) => t.name === "custom_checkin"),
    false,
  );
  await action("whatsappConfig", {
    phoneNumberId: "123456789012345",
    wabaId: "987654321",
    displayName: "Test Gym",
    senderPhone: "919800000000",
    enabled: true,
    dailySendCap: 50,
    quietStart: "21:00",
    quietEnd: "08:00",
  });
  await action("member", {
    name: "Reminder Member",
    phone: "9876543300",
    whatsappConsent: true,
  });
  d = await read();
  const reminderMember = d.members.find((m) => m.name === "Reminder Member");
  const endDay = (await db.query("select ($1::date + 3)::text as d", [day]))
    .rows[0].d;
  await db.query(
    "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values($1,$2,'Monthly',$3::date,$4::date,150000,$4::date)",
    [g, reminderMember.id, day, endDay],
  );
  const due = (
    await db.query("select wa_due_messages($1::date,$2) as m", [day, 200])
  ).rows[0].m;
  const entry = due.find(
    (x) =>
      x.member_id === reminderMember.id &&
      x.template_name === "renewal_reminder",
  );
  assert.ok(entry, "expiring membership should be queued");
  assert.equal(entry.phone, "9876543300");
  assert.equal(entry.vars.member_name, "Reminder Member");
  assert.equal(entry.vars.days_left, "3");
  const prepared = (
    await db.query("select wa_prepare($1,$2,$3) as p", [
      g,
      reminderMember.id,
      "renewal_reminder",
    ])
  ).rows[0].p;
  assert.equal(prepared.phone_number_id, "123456789012345");
  assert.equal(prepared.category, "utility");
  await db.query("select wa_record($1,$2,'out',$3,$4,$5,$6,'sent','')", [
    g,
    reminderMember.id,
    "renewal_reminder",
    "wamid.TEST1",
    entry.phone,
    "rendered",
  ]);
  const dueAgain = (
    await db.query("select wa_due_messages($1::date,$2) as m", [day, 200])
  ).rows[0].m;
  assert.equal(
    dueAgain.some(
      (x) =>
        x.member_id === reminderMember.id &&
        x.template_name === "renewal_reminder",
    ),
    false,
    "already-sent reminders should not repeat",
  );
  await db.query("select wa_set_status($1,$2,$3,$4)", [
    "123456789012345",
    "wamid.TEST1",
    "delivered",
    "",
  ]);
  await db.query("select wa_record_inbound($1,$2,$3,$4)", [
    "123456789012345",
    "919876543300",
    "I will renew today",
    "wamid.IN1",
  ]);
  await db.query("select wa_record_inbound($1,$2,$3,$4)", [
    "123456789012345",
    "919876543300",
    "I will renew today",
    "wamid.IN1",
  ]);
  await db.query("select wa_set_status($1,$2,$3,$4)", [
    "123456789012345",
    "wamid.TEST1",
    "sent",
    "",
  ]);
  d = await read();
  const outboundLog = d.whatsapp.messages.find(
    (m) => m.waMessageId === "wamid.TEST1",
  );
  assert.equal(outboundLog.status, "delivered");
  assert.equal(
    d.whatsapp.messages.filter((m) => m.waMessageId === "wamid.IN1").length,
    1,
  );
  const inboundLog = d.whatsapp.messages.find(
    (m) => m.waMessageId === "wamid.IN1",
  );
  assert.equal(inboundLog.direction, "in");
  assert.equal(inboundLog.memberId, reminderMember.id);
  const messagePrivilege = await db.query(
    "select has_table_privilege('authenticated','public.message_logs','INSERT') as allowed",
  );
  assert.equal(messagePrivilege.rows[0].allowed, false);
  const newStaff = "10000000-0000-0000-0000-000000000004";
  await db.query("insert into auth.users(id,email) values($1,$2)", [
    newStaff,
    "newstaff@test.local",
  ]);
  d = await read();
  assert.equal(d.staff.length, 2);
  assert.equal(d.staff.find((s) => s.id === owner).self, true);
  await assert.rejects(
    () => action("staffAdd", { email: "ghost@test.local", role: "reception" }),
    /Supabase Authentication/,
  );
  await assert.rejects(
    () => action("staffAdd", { email: "newstaff@test.local", role: "manager" }),
    /valid staff role/,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () =>
      action("staffAdd", { email: "newstaff@test.local", role: "reception" }),
    /Owner permission/,
  );
  d = await read();
  assert.equal(d.staff.length, 0);
  assert.equal(d.audit.length, 0);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("staffAdd", { email: "NewStaff@Test.Local", role: "reception" });
  d = await read();
  const addedStaff = d.staff.find((s) => s.email === "newstaff@test.local");
  assert.ok(addedStaff);
  await assert.rejects(
    () =>
      action("staffAdd", { email: "newstaff@test.local", role: "reception" }),
    /already a staff member/,
  );
  await action("staffUpdate", {
    id: addedStaff.id,
    role: "reception",
    enabled: false,
  });
  d = await read();
  assert.equal(d.staff.find((s) => s.id === addedStaff.id).enabled, false);
  await assert.rejects(
    () =>
      action("staffUpdate", { id: owner, role: "reception", enabled: true }),
    /your own owner access/,
  );
  await assert.rejects(
    () => action("staffUpdate", { id: owner, role: "owner", enabled: false }),
    /your own owner access/,
  );
  await assert.rejects(
    () => action("staffRemove", { id: owner }),
    /your own staff access/,
  );
  await action("staffRemove", { id: addedStaff.id });
  d = await read();
  assert.equal(
    d.staff.some((s) => s.id === addedStaff.id),
    false,
  );
  await action("plan", { name: "Temp Plan", months: 2, price: 300000 });
  d = await read();
  const tempPlan = d.plans.find((p) => p.name === "Temp Plan");
  assert.ok(tempPlan);
  await action("planDelete", { id: tempPlan.id });
  d = await read();
  assert.equal(
    d.plans.some((p) => p.id === tempPlan.id),
    false,
  );
  await assert.rejects(
    () => action("planDelete", { id: tempPlan.id }),
    /not found/,
  );
  await action("member", { name: "Expire Me", phone: "9876543400" });
  d = await read();
  const expireMember = d.members.find((m) => m.name === "Expire Me");
  await action("membership", {
    memberId: expireMember.id,
    planId: d.plans[0].id,
    start: day,
    amount: 200000,
  });
  d = await read();
  const expireMembership = d.memberships.find(
    (s) => s.memberId === expireMember.id,
  );
  const expireTo = (await db.query("select ($1::date + 5)::text as d", [day]))
    .rows[0].d;
  await assert.rejects(
    () =>
      action("membershipExpire", {
        id: expireMembership.id,
        endDate: expireTo,
        reason: "no",
      }),
    /at least five/,
  );
  await action("membershipExpire", {
    id: expireMembership.id,
    endDate: expireTo,
    reason: "Left the city",
  });
  d = await read();
  assert.equal(
    d.memberships.find((s) => s.id === expireMembership.id).end,
    expireTo,
  );
  const beyond = (await db.query("select ($1::date + 400)::text as d", [day]))
    .rows[0].d;
  await assert.rejects(
    () =>
      action("membershipExpire", {
        id: expireMembership.id,
        endDate: beyond,
        reason: "Extend please",
      }),
    /within the membership period/,
  );
  await action("member", { name: "Delete Me", phone: "9876543500" });
  d = await read();
  const deleteMember = d.members.find((m) => m.name === "Delete Me");
  await action("memberDelete", { id: deleteMember.id });
  d = await read();
  assert.equal(
    d.members.some((m) => m.id === deleteMember.id),
    false,
  );
  await action("member", { name: "Paid Member", phone: "9876543501" });
  d = await read();
  const paidMember = d.members.find((m) => m.name === "Paid Member");
  await action("membership", {
    memberId: paidMember.id,
    planId: d.plans[0].id,
    start: day,
    amount: 200000,
  });
  d = await read();
  const paidMembership = d.memberships.find(
    (s) => s.memberId === paidMember.id,
  );
  await action("payment", {
    membershipId: paidMembership.id,
    amount: 200000,
    method: "Cash",
  });
  await assert.rejects(
    () => action("memberDelete", { id: paidMember.id }),
    /payment records/,
  );
  d = await read();
  assert.ok(d.audit.length > 0);
  assert.ok(d.audit.some((a) => a.action === "staffAdd"));
  assert.equal(d.audit[0].actor, "owner@test.local");
  assert.equal(typeof d.audit[0].payload, "object");
  const checkin = d.attendance[0];
  await db.query("select set_config('test.user',$1,false)", [staff]);
  const checkoutRequest=crypto.randomUUID();
  await action("checkout",{id:checkin.id},checkoutRequest);
  await action("checkout",{id:checkin.id},checkoutRequest);
  await assert.rejects(()=>action("checkout",{id:checkin.id}),/already checked out/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  d=await read();assert(d.attendance.find(a=>a.id===checkin.id).outAt);
  assert(d.audit.some(a=>a.action==='checkout'));

  await action("freeze", {
    id: paidMembership.id,
    start: day,
    end: day,
    reason: "One day hold",
  });
  await assert.rejects(
    () =>
      action("membershipExpire", {
        id: paidMembership.id,
        endDate: day,
        reason: "Early expiry request",
      }),
    /Resume the scheduled/,
  );
  await action("resume", { id: paidMembership.id, reason: "Hold cancelled" });
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(
    () =>
      action("attendanceRemove", { id: checkin.id, reason: "Wrong check-in" }),
    /Owner/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const correctionRequest = crypto.randomUUID(),
    correction = { id: checkin.id, reason: "Wrong check-in" };
  await action("attendanceRemove", correction, correctionRequest);
  await action("attendanceRemove", correction, correctionRequest);
  d = await read();
  assert(!d.attendance.some((a) => a.id === checkin.id));
  assert(
    d.audit.some(
      (a) =>
        a.action === "attendanceRemove" &&
        a.payload.removedAttendance.id === checkin.id,
    ),
  );
  const contact = d.reminders[0];
  await action("reminder", {
    id: contact.id,
    memberId: contact.memberId,
    kind: contact.kind,
    note: "Updated follow-up",
    nextDate: "",
  });
  d = await read();
  assert.equal(d.reminders.find((r) => r.id === contact.id).at, contact.at);
  assert.equal(
    d.reminders.find((r) => r.id === contact.id).note,
    "Updated follow-up",
  );
  assert(
    d.audit.some(
      (a) =>
        a.action === "reminder" && a.payload.previousContact?.id === contact.id,
    ),
  );
  const editPayload = {id: paidMembership.id, planName: "Updated membership", start: paidMembership.start, end: paidMembership.end, amount: paidMembership.amount, dueDate: day, reason: "Correct membership details"};
  await action("membershipEdit", editPayload);
  d = await read();
  assert.equal(d.memberships.find(m => m.id === paidMembership.id).planName, "Updated membership");
  assert(d.audit.some(a => a.action === "membershipEdit" && a.payload.previousMembership.id === paidMembership.id));
  await assert.rejects(() => action("membershipEdit", {...editPayload, amount: 0}), /less than payments/);
  await assert.rejects(() => action("membershipEdit", {...editPayload, end: "2000-01-01"}), /valid membership period/);
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(() => action("membershipEdit", editPayload), /Owner/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const birthdayMember = d.members.find(m => m.id === paidMembership.memberId);
  await action("member", {...birthdayMember,dob:"1995-10-15",archived:true});
  d=await read();
  assert.equal(d.members.find(m=>m.id===birthdayMember.id).dob,"1995-10-15");
  assert.equal(d.members.find(m=>m.id===birthdayMember.id).leftOn,day);
  await action("member", {...birthdayMember,dob:"1995-10-15",archived:false});
  d=await read();assert.equal(d.members.find(m=>m.id===birthdayMember.id).leftOn,null);
  await assert.rejects(()=>action("member",{...birthdayMember,dob:"2999-01-01"}),/future/);
  await action("membershipEdit",{...editPayload,baseAmount:editPayload.amount+10000,discountType:"fixed",discountValue:100});
  d=await read();assert.equal(d.memberships.find(m=>m.id===paidMembership.id).discount,10000);
  await assert.rejects(()=>action("membershipEdit",{...editPayload,baseAmount:editPayload.amount,discountType:"percent",discountValue:101}),/100 percent/);
  await assert.rejects(()=>action("membershipEdit",{...editPayload,baseAmount:editPayload.amount,discountType:"fixed",discountValue:100}),/discount total/);
  await action("export", { kind: "collections" });
  d = await read();
  assert(d.audit.some((a) => a.action === "export" && a.payload.kind === "collections"));
  await assert.rejects(() => action("export", {}), /Export kind is required/);
  await action("member", { name: "Receipt Grower", phone: "9000000001" });
  d = await read();
  const grower = d.members.find((m) => m.name === "Receipt Grower");
  await action("membership", { memberId: grower.id, planId: d.plans[0].id, start: "2030-01-01", amount: 100000 });
  d = await read();
  const growerMembership = d.memberships.find((s) => s.memberId === grower.id);
  await db.query("update gyms set receipt_seq=999999 where id=$1", [g]);
  await action("payment", { membershipId: growerMembership.id, amount: 100000, method: "Cash" });
  d = await read();
  assert.equal(d.payments.find((p) => p.membershipId === growerMembership.id).receipt, "GD-1000000");
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(read, /not been assigned/);
  await assert.rejects(
    () => action("settings", { name: "Attack" }),
    /No active gym/,
  );
  const privileges = await db.query(
    "select has_table_privilege('authenticated','public.payments','INSERT') as allowed",
  );
  assert.equal(privileges.rows[0].allowed, false);
  console.log(
    "PASS: migration, member profile fields with validation, month-end renewal, overlap rejection, idempotent payments, overpayment rejection, receipt snapshots, owner-only void/override, attendance deduplication, WhatsApp config/templates/rules with service RPCs, staff admin, plan/member deletion and membership expiry, owner-only audit trail, audited CSV exports, seven-digit receipt growth, unassigned-account isolation and denied direct writes.",
  );
} finally {
  await db.close();
}
