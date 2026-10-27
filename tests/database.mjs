import { checkFullPaymentPolicy } from "./full-payment-policy.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && f < "017")
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
    /Admin/,
  );
  await assert.rejects(
    () => action("void", { id: d.payments[0].id, reason: "Correction" }),
    /Admin/,
  );
  await assert.rejects(
    () =>
      action("attendance", {
        memberId: d.members[0].id,
        override: "Expired override",
      }),
    /Admin override/,
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
    /Admin/,
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
    /Admin override/,
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
    /Admin permission/,
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
    /Admin permission/,
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
    /your own admin access/,
  );
  await assert.rejects(
    () => action("staffUpdate", { id: owner, role: "owner", enabled: false }),
    /your own admin access/,
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
  const checkoutRequest = crypto.randomUUID();
  await action("checkout", { id: checkin.id }, checkoutRequest);
  await action("checkout", { id: checkin.id }, checkoutRequest);
  await assert.rejects(
    () => action("checkout", { id: checkin.id }),
    /already checked out/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  d = await read();
  assert(d.attendance.find((a) => a.id === checkin.id).outAt);
  assert(d.audit.some((a) => a.action === "checkout"));

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
    /Admin/,
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
  const editPayload = {
    id: paidMembership.id,
    planName: "Updated membership",
    start: paidMembership.start,
    end: paidMembership.end,
    amount: paidMembership.amount,
    dueDate: day,
    reason: "Correct membership details",
  };
  await action("membershipEdit", editPayload);
  d = await read();
  assert.equal(
    d.memberships.find((m) => m.id === paidMembership.id).planName,
    "Updated membership",
  );
  assert(
    d.audit.some(
      (a) =>
        a.action === "membershipEdit" &&
        a.payload.previousMembership.id === paidMembership.id,
    ),
  );
  await assert.rejects(
    () => action("membershipEdit", { ...editPayload, amount: 0 }),
    /less than payments/,
  );
  await assert.rejects(
    () => action("membershipEdit", { ...editPayload, end: "2000-01-01" }),
    /valid membership period/,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(() => action("membershipEdit", editPayload), /Admin/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const birthdayMember = d.members.find(
    (m) => m.id === paidMembership.memberId,
  );
  await action("member", {
    ...birthdayMember,
    dob: "1995-10-15",
    archived: true,
  });
  d = await read();
  assert.equal(
    d.members.find((m) => m.id === birthdayMember.id).dob,
    "1995-10-15",
  );
  assert.equal(d.members.find((m) => m.id === birthdayMember.id).leftOn, day);
  await action("member", {
    ...birthdayMember,
    dob: "1995-10-15",
    archived: false,
  });
  d = await read();
  assert.equal(d.members.find((m) => m.id === birthdayMember.id).leftOn, null);
  await assert.rejects(
    () => action("member", { ...birthdayMember, dob: "2999-01-01" }),
    /future/,
  );
  await action("membershipEdit", {
    ...editPayload,
    baseAmount: editPayload.amount + 10000,
    discountType: "fixed",
    discountValue: 100,
  });
  d = await read();
  assert.equal(
    d.memberships.find((m) => m.id === paidMembership.id).discount,
    10000,
  );
  await assert.rejects(
    () =>
      action("membershipEdit", {
        ...editPayload,
        baseAmount: editPayload.amount,
        discountType: "percent",
        discountValue: 101,
      }),
    /100 percent/,
  );
  await assert.rejects(
    () =>
      action("membershipEdit", {
        ...editPayload,
        baseAmount: editPayload.amount,
        discountType: "fixed",
        discountValue: 100,
      }),
    /discount total/,
  );
  await action("export", { kind: "collections" });
  d = await read();
  assert(
    d.audit.some(
      (a) => a.action === "export" && a.payload.kind === "collections",
    ),
  );
  await assert.rejects(() => action("export", {}), /Export kind is required/);
  await action("member", { name: "Receipt Grower", phone: "9000000001" });
  d = await read();
  const grower = d.members.find((m) => m.name === "Receipt Grower");
  await action("membership", {
    memberId: grower.id,
    planId: d.plans[0].id,
    start: "2030-01-01",
    amount: 100000,
  });
  d = await read();
  const growerMembership = d.memberships.find((s) => s.memberId === grower.id);
  await db.query("update gyms set receipt_seq=999999 where id=$1", [g]);
  await action("payment", {
    membershipId: growerMembership.id,
    amount: 100000,
    method: "Cash",
  });
  d = await read();
  assert.equal(
    d.payments.find((p) => p.membershipId === growerMembership.id).receipt,
    "GD-1000000",
  );
  // Regression: a paid renewal must not hide a previous unpaid fee reminder.
  await action("member", {
    name: "Arrears regression",
    phone: "9876500091",
    whatsappConsent: true,
  });
  d = await read();
  const arrearsMember = d.members.find((m) => m.name === "Arrears regression");
  const oldArrears = (
    await db.query(
      "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values($1,$2,'Previous plan',$3::date-30,$3::date-1,150025,$3::date-1) returning id",
      [g, arrearsMember.id, day],
    )
  ).rows[0].id;
  const newPeriod = (
    await db.query(
      "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values($1,$2,'Renewed plan',$3::date,$3::date+30,200000,$3::date) returning id",
      [g, arrearsMember.id, day],
    )
  ).rows[0].id;
  await action("payment", {
    membershipId: newPeriod,
    amount: 200000,
    method: "Cash",
  });
  const dueQueue = async () =>
    (await db.query("select wa_due_messages($1::date,200) as q", [day])).rows[0]
      .q;
  const reminderEntry = () =>
    dueQueue().then((q) =>
      q.find(
        (x) =>
          x.member_id === arrearsMember.id &&
          x.template_name === "fee_due_reminder",
      ),
    );
  assert(await reminderEntry());
  const arrearsPrepared = (
    await db.query(
      "select wa_prepare($1,$2,'fee_due_reminder',$3::date) as p",
      [g, arrearsMember.id, day],
    )
  ).rows[0].p;
  assert.equal(arrearsPrepared.vars.plan_name, "Previous plan");
  assert.equal(arrearsPrepared.vars.outstanding, "1500.25");
  assert.equal(arrearsPrepared.vars.amount, "1500.25");
  await db.query(
    "select wa_record($1,$2,'out','fee_due_reminder','','9876500091','Test retry','failed','test error')",
    [g, arrearsMember.id],
  );
  assert(await reminderEntry(), "failed sends stay eligible");
  for (let i = 0; i < 2; i++) {
    await action("member", {
      name: "Cap regression " + i,
      phone: "987650008" + i,
      whatsappConsent: true,
    });
    d = await read();
    const mid = d.members.find((m) => m.name === "Cap regression " + i).id;
    await db.query(
      "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values($1,$2,'Cap test',$3::date-30,$3::date+30,10000,$3::date-1)",
      [g, mid, day],
    );
  }
  await db.query(
    "update whatsapp_config set daily_send_cap=(select count(*)+1 from message_logs where gym_id=$1 and direction='out' and (created_at at time zone 'Asia/Kolkata')::date=$2::date) where gym_id=$1",
    [g, day],
  );
  assert.equal(
    (await dueQueue()).filter((x) => x.gym_id === g).length,
    1,
    "queue cannot exceed the remaining daily send allowance",
  );
  await db.query(
    "update whatsapp_config set daily_send_cap=1000 where gym_id=$1",
    [g],
  );
  await db.query(
    "select wa_record($1,$2,'out','fee_due_reminder','wamid.regression.sent','9876500091','Test sent','sent','')",
    [g, arrearsMember.id],
  );
  assert.equal(
    await reminderEntry(),
    undefined,
    "successful sends are not repeated",
  );
  await action("payment", {
    membershipId: oldArrears,
    amount: 150025,
    method: "Cash",
  });
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(read, /not been assigned/);
  await assert.rejects(
    () => action("settings", { name: "Attack" }),
    /No active gym/,
  );
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await action("plan", { name: "Enrollment test", months: 1, price: 150000 });
  const enrollmentPlan = (await read()).plans.find(
    (p) => p.name === "Enrollment test",
  );
  const enrollment = {
    planId: enrollmentPlan.id,
    start: "2026-10-19",
    end: "2026-11-18",
    dueDate: "2026-10-19",
    amount: 135000,
    baseAmount: 150000,
    discountType: "percent",
    discountValue: 10,
  };
  const enrollmentRequest = crypto.randomUUID();
  const registration = {
    name: "Enrollment member",
    phone: "9888877771",
    enrollment,
  };
  await action("member", registration, enrollmentRequest);
  await action("member", registration, enrollmentRequest);
  const afterEnrollment = await read();
  const enrolled = afterEnrollment.members.find(
    (m) => m.name === "Enrollment member",
  );
  assert.equal(
    afterEnrollment.members.filter((m) => m.name === "Enrollment member")
      .length,
    1,
  );
  const periods = afterEnrollment.memberships.filter(
    (m) => m.memberId === enrolled.id,
  );
  assert.equal(periods.length, 1);
  assert.equal(periods[0].amount, 135000);
  await assert.rejects(
    () =>
      action("member", {
        name: "Rollback member",
        phone: "9888877772",
        enrollment: { ...enrollment, amount: 1 },
      }),
    /discount total/,
  );
  assert(
    !(await read()).members.some((m) => m.name === "Rollback member"),
    "Invalid enrollment must roll back member creation",
  );
  await assert.rejects(
    () => action("member", { ...registration, id: enrolled.id }),
    /only supported/,
  );
  // Verify legacy records before applying the stricter checkout policy, then exercise it.
  await checkFullPaymentPolicy({ db, action, read, owner, staff });
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const snapshotBefore = await read();
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && f > "017_full_payment_checkout.sql")
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  const scoped = (
    await db.query(
      "select get_gym_sections(array['members','payments']) as data",
    )
  ).rows[0].data;
  assert.equal(scoped.members.length, snapshotBefore.members.length);
  assert(!("attendance" in scoped));
  assert.deepEqual(scoped.payments, snapshotBefore.payments);
  // Registration dates and payment dates are independent; deferred fees stay unpaid.
  const dates = (
    await db.query(
      "select (now() at time zone 'Asia/Kolkata')::date::text as today, ((now() at time zone 'Asia/Kolkata')::date + 3)::text as later",
    )
  ).rows[0];
  const deferredPlan = (await read()).plans.find(
    (p) => p.id === enrollmentPlan.id,
  );
  const registrationFee = {
    planId: deferredPlan.id,
    start: dates.today,
    amount: 150000,
    baseAmount: 150000,
    discountType: "fixed",
    discountValue: 0,
    dueDate: dates.later,
  };
  for (const [suffix, start] of [
    ["same-day", dates.today],
    ["future-start", dates.later],
  ]) {
    await action("member", {
      name: `Registration ${suffix}`,
      phone: suffix === "same-day" ? "9876000101" : "9876000102",
      enrollment: {
        ...registrationFee,
        start,
        payment: {
          amount: 150000,
          method: "Cash",
          reference: "",
          requestId: crypto.randomUUID(),
        },
      },
    });
    const paidData = await read();
    const paidMember = paidData.members.find(
      (m) => m.name === `Registration ${suffix}`,
    );
    assert.equal(
      paidData.memberships.find((s) => s.memberId === paidMember.id).start,
      start,
    );
    assert.equal(
      paidData.payments.filter((p) => p.memberId === paidMember.id).length,
      1,
    );
  }
  const deferredRequest = crypto.randomUUID();
  const deferredRegistration = {
    name: "Deferred registration",
    phone: "9876000103",
    enrollment: { ...registrationFee, deferPayment: true },
  };
  await action("member", deferredRegistration, deferredRequest);
  await action("member", deferredRegistration, deferredRequest);
  let deferredData = await read();
  const deferredMember = deferredData.members.find(
    (m) => m.name === deferredRegistration.name,
  );
  const deferredPeriod = deferredData.memberships.find(
    (s) => s.memberId === deferredMember.id,
  );
  assert.equal(deferredPeriod.start, dates.today);
  assert.equal(deferredPeriod.dueDate, dates.later);
  assert.equal(
    deferredData.members.filter((m) => m.id === deferredMember.id).length,
    1,
  );
  assert.equal(
    deferredData.payments.filter((p) => p.memberId === deferredMember.id)
      .length,
    0,
  );
  await assert.rejects(
    () =>
      action("payment", {
        membershipId: deferredPeriod.id,
        amount: 100,
        method: "Cash",
        reference: "",
      }),
    /full|remaining|balance/i,
  );
  const periodsBeforeBlockedRenewal = deferredData.memberships.length;
  const paymentsBeforeBlockedRenewal = deferredData.payments.length;
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(
      () =>
        action("membership", {
          ...registrationFee,
          memberId: deferredMember.id,
          start: "2099-01-01",
          payment: {
            amount: registrationFee.amount,
            method: "Cash",
            reference: "Blocked renewal",
            requestId: crypto.randomUUID(),
          },
        }),
      /pending membership fee before renewing/,
    );
  }
  assert.equal((await read()).memberships.length, periodsBeforeBlockedRenewal);
  assert.equal((await read()).payments.length, paymentsBeforeBlockedRenewal);
  const settlementId = crypto.randomUUID();
  const settlement = {
    membershipId: deferredPeriod.id,
    amount: 150000,
    method: "UPI",
    reference: "",
  };
  await action("payment", settlement, settlementId);
  await action("payment", settlement, settlementId);
  await assert.rejects(
    () => action("payment", settlement, crypto.randomUUID()),
    /full pending balance/,
  );
  deferredData = await read();
  assert.equal(
    deferredData.payments.filter((p) => p.memberId === deferredMember.id)
      .length,
    1,
  );
  assert.equal(
    deferredData.memberships.find((s) => s.id === deferredPeriod.id).end,
    deferredPeriod.end,
  );
  await assert.rejects(
    () =>
      action("membership", {
        ...registrationFee,
        memberId: deferredMember.id,
        start: "2099-01-01",
        payment: {
          amount: registrationFee.amount,
          method: "Cash",
          reference: "Early extension blocked",
          requestId: crypto.randomUUID(),
        },
      }),
    /within seven days/,
  );
  await db.exec("begin");
  await db.query(
    "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount,cancelled,cancel_reason) select gym_id,member_id,plan_name,'2098-01-01'::date,'2098-01-31'::date,amount,true,'Accidental future renewal cancelled' from memberships where id=$1",
    [deferredPeriod.id],
  );
  await db.query(
    "update memberships set end_date=(now() at time zone 'Asia/Kolkata')::date+3 where id=$1",
    [deferredPeriod.id],
  );
  await action("membership", {
    ...registrationFee,
    memberId: deferredMember.id,
    start: "2099-01-01",
    payment: {
      amount: registrationFee.amount,
      method: "Cash",
      reference: "Renewal after settling dues",
      requestId: crypto.randomUUID(),
    },
  });
  assert.equal(
    (await read()).memberships.length,
    periodsBeforeBlockedRenewal + 2,
  );
  await db.exec("rollback");
  await assert.rejects(
    () =>
      action("member", {
        name: "Invalid deferred",
        phone: "9876000104",
        enrollment: {
          ...registrationFee,
          deferPayment: true,
          dueDate: "2000-01-01",
        },
      }),
    /due date/i,
  );
  await assert.rejects(
    () =>
      action("member", {
        name: "Invalid mixed payment",
        phone: "9876000105",
        enrollment: {
          ...registrationFee,
          deferPayment: true,
          payment: { amount: 1 },
        },
      }),
    /must not include/i,
  );
  assert(
    !(await read()).members.some(
      (m) =>
        m.name.startsWith("Invalid deferred") ||
        m.name === "Invalid mixed payment",
    ),
  );
  await action("member", {
    name: "Joining date test",
    phone: "9876000111",
    joined: "2000-01-01",
  });
  let joiningMember = (await read()).members.find(
    (m) => m.name === "Joining date test",
  );
  assert.equal(joiningMember.joined, "2000-01-01");
  await action("member", { ...joiningMember, joined: "2001-02-03" });
  joiningMember = (await read()).members.find((m) => m.id === joiningMember.id);
  assert.equal(joiningMember.joined, "2001-02-03");
  const withoutJoiningDate = { ...joiningMember };
  delete withoutJoiningDate.joined;
  await action("member", withoutJoiningDate);
  assert.equal(
    (await read()).members.find((m) => m.id === joiningMember.id).joined,
    "2001-02-03",
  );
  for (const joined of [dates.later, "", "2026-02-30"]) {
    await assert.rejects(() =>
      action("member", {
        name: "Invalid joining",
        phone: "9876000112",
        joined,
      }),
    );
  }
  assert(!(await read()).members.some((m) => m.name === "Invalid joining"));
  // Developer privileges are a separate server-controlled grant, never a staff role.
  const developerRead = async () =>
    (await db.query("select developer_workspace() as snapshot")).rows[0]
      .snapshot;
  assert.equal(
    (await db.query("select is_developer() as allowed")).rows[0].allowed,
    false,
  );
  await assert.rejects(developerRead, /Developer access/);
  const gymForDeveloper = (await db.query("select my_gym() as id")).rows[0].id;
  await db.query(
    "insert into developer_accounts(user_id,gym_id) values($1,$2)",
    [owner, gymForDeveloper],
  );
  assert.equal(
    (await db.query("select is_developer() as allowed")).rows[0].allowed,
    true,
  );
  const developerSnapshot = await developerRead();
  const correctionId = crypto.randomUUID();
  const correctionPayload = {
    ...joiningMember,
    notes: "Developer correction fixture",
  };
  const correct = (
    payload,
    revision,
    request = correctionId,
    actionType = "member",
  ) =>
    db.query("select developer_correct($1,$2::jsonb,$3,$4,$5::uuid)", [
      actionType,
      JSON.stringify(payload),
      "Correct test member notes",
      revision,
      request,
    ]);
  await correct(correctionPayload, developerSnapshot.revision);
  await correct(correctionPayload, developerSnapshot.revision);
  assert.equal(
    (await read()).members.find((m) => m.id === joiningMember.id).notes,
    "Developer correction fixture",
  );
  const correctionAudit = (
    await db.query("select * from developer_corrections where request_id=$1", [
      correctionId,
    ])
  ).rows[0];
  assert.equal(correctionAudit.actor, owner);
  assert.equal(correctionAudit.before_record.notes, joiningMember.notes);
  assert.equal(
    correctionAudit.after_record.notes,
    "Developer correction fixture",
  );
  await assert.rejects(
    () =>
      correct(
        { ...correctionPayload, notes: "Stale overwrite" },
        developerSnapshot.revision,
        crypto.randomUUID(),
      ),
    /changed/,
  );
  await assert.rejects(
    () =>
      correct(
        { ...correctionPayload, notes: "Changed request" },
        developerSnapshot.revision,
      ),
    /already been used/,
  );
  const freshDeveloper = await developerRead();
  await assert.rejects(
    () =>
      correct(
        { id: deferredMember.id },
        freshDeveloper.revision,
        crypto.randomUUID(),
        "memberDelete",
      ),
    /payment records/,
  );
  assert.equal(
    (await db.query("select count(*)::int as n from developer_corrections"))
      .rows[0].n,
    1,
  );
  const paymentForDeletion = (await read()).payments.find(
    (p) => p.memberId === deferredMember.id && !p.voided,
  );
  const deleteSnapshot = await developerRead();
  await assert.rejects(
    () =>
      correct(
        { id: paymentForDeletion.id, confirmReceipt: "WRONG" },
        deleteSnapshot.revision,
        crypto.randomUUID(),
        "paymentDelete",
      ),
    /exact receipt/,
  );
  const receiptSequence = (
    await db.query("select receipt_seq::text as seq from gyms where id=$1", [
      gymForDeveloper,
    ])
  ).rows[0].seq;
  await db.exec("begin");
  const deletionId = crypto.randomUUID();
  const deletePayload = {
    id: paymentForDeletion.id,
    confirmReceipt: paymentForDeletion.receipt,
  };
  await correct(
    deletePayload,
    deleteSnapshot.revision,
    deletionId,
    "paymentDelete",
  );
  await correct(
    deletePayload,
    deleteSnapshot.revision,
    deletionId,
    "paymentDelete",
  );
  assert(!(await read()).payments.some((p) => p.id === paymentForDeletion.id));
  const restoredDue = (
    await db.query(
      "select m.amount-coalesce(sum(p.amount) filter (where not p.voided),0) as due from memberships m left join payments p on p.membership_id=m.id where m.id=$1 group by m.id",
      [deferredPeriod.id],
    )
  ).rows[0].due;
  assert.equal(Number(restoredDue), deferredPeriod.amount);
  const deletedAudit = (
    await db.query("select * from developer_corrections where request_id=$1", [
      deletionId,
    ])
  ).rows[0];
  assert.equal(deletedAudit.before_record.receipt, paymentForDeletion.receipt);
  assert.equal(deletedAudit.after_record, null);
  assert.equal(
    (
      await db.query("select receipt_seq::text as seq from gyms where id=$1", [
        gymForDeveloper,
      ])
    ).rows[0].seq,
    receiptSequence,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from audit_logs where action='paymentDelete' and payload->>'id'=$1",
        [paymentForDeletion.id],
      )
    ).rows[0].n,
    1,
  );
  const postDeleteSnapshot = await developerRead();
  await assert.rejects(
    () =>
      correct(
        deletePayload,
        postDeleteSnapshot.revision,
        crypto.randomUUID(),
        "paymentDelete",
      ),
    /not found/,
  );
  await db.exec("rollback");
  assert.equal(
    (
      await db.query(
        "select has_table_privilege('authenticated','public.developer_accounts','INSERT') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(developerRead, /Developer access/);
  await assert.rejects(
    () =>
      correct(
        {
          id: paymentForDeletion.id,
          confirmReceipt: paymentForDeletion.receipt,
        },
        deleteSnapshot.revision,
        crypto.randomUUID(),
        "paymentDelete",
      ),
    /Developer access/,
  );
  await assert.rejects(
    () =>
      correct(correctionPayload, freshDeveloper.revision, crypto.randomUUID()),
    /Developer access/,
  );
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(developerRead, /Developer access/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  await db.query(
    "update developer_accounts set enabled=false where user_id=$1",
    [owner],
  );
  await assert.rejects(developerRead, /Developer access/);
  const req = crypto.randomUUID(),
    memberPayload = {
      name: "Compact Audit",
      phone: "9898998877",
      photo: "data:image/jpeg;base64,YWJj",
    };
  await action("member", memberPayload, req);
  await action("member", memberPayload, req);
  await assert.rejects(
    () =>
      action(
        "member",
        { ...memberPayload, photo: "data:image/jpeg;base64,YWJk" },
        req,
      ),
    /already used/,
  );
  const stored = (
    await db.query(
      "select payload,payload_hash from action_requests where id=$1",
      [req],
    )
  ).rows[0];
  assert.equal(stored.payload.photo, "[photo recorded]");
  assert(stored.payload_hash);
  assert.equal(
    (await read()).members.find((m) => m.name === "Compact Audit").photo,
    memberPayload.photo,
  );

  const target = (await read()).members[0];
  const dispatchKey = "scheduled:test:" + target.id;
  const claim = () =>
    db.query("select wa_claim_dispatch($1,$2,$3,$4) as claimed", [
      dispatchKey,
      g,
      target.id,
      "fee_due_reminder",
    ]);
  assert.equal((await claim()).rows[0].claimed, true);
  assert.equal((await claim()).rows[0].claimed, false);
  await db.query(
    "select wa_finish_dispatch($1,$2,$3,$4,$5,$6,'unknown','contract-provider','timeout')",
    [dispatchKey, g, target.id, "fee_due_reminder", target.phone, "test"],
  );
  assert.equal(
    (await claim()).rows[0].claimed,
    false,
    "Unknown outcomes cannot be resent automatically",
  );
  const phoneNumber = (
    await db.query(
      "select phone_number_id from whatsapp_config where gym_id=$1",
      [g],
    )
  ).rows[0].phone_number_id;
  await db.query(
    "select wa_set_status($1,'contract-provider','delivered','')",
    [phoneNumber],
  );
  await db.query(
    "select wa_set_status($1,'contract-provider','delivered','')",
    [phoneNumber],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::integer as n from message_logs where wa_message_id='contract-provider' and gym_id=$1",
        [g],
      )
    ).rows[0].n,
    1,
    "Webhook reconciliation is idempotent",
  );
  const fixturePhoto = "data:image/jpeg;base64,YWJj";
  assert.equal(
    (await db.query("select photo_object_key($1) as key", [fixturePhoto]))
      .rows[0].key,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  await action("member", {
    ...target,
    photo: "storage:member-photos/" + g + "/" + "a".repeat(64) + ".jpg",
  });
  await assert.rejects(
    () =>
      action("member", {
        ...target,
        photo:
          "storage:member-photos/00000000-0000-0000-0000-000000000000/" +
          "a".repeat(64) +
          ".jpg",
      }),
    /Invalid profile photo/,
  );

  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.wa_claim_dispatch(text,uuid,uuid,text)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  // Abandoned provider calls become visible ambiguous outcomes, never retryable failures.
  const abandonedKey = "abandoned:test:" + target.id;
  await db.query("select wa_claim_dispatch($1,$2,$3,$4)", [
    abandonedKey,
    g,
    target.id,
    "fee_due_reminder",
  ]);
  await db.query(
    "update message_dispatches set updated_at=now()-interval '16 minutes' where dispatch_key=$1",
    [abandonedKey],
  );
  const health = (await db.query("select wa_dispatch_health() as health"))
    .rows[0].health;
  assert.equal(health.recovered, 1);
  assert(health.unknown >= 1);
  assert.equal(
    (
      await db.query("select wa_claim_dispatch($1,$2,$3,$4) as claimed", [
        abandonedKey,
        g,
        target.id,
        "fee_due_reminder",
      ])
    ).rows[0].claimed,
    false,
  );
  assert.equal(
    (await db.query("select wa_dispatch_health() as health")).rows[0].health
      .recovered,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.wa_dispatch_health()','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert(
    (await db.query("select wa_due_messages($1::date,5) as jobs", [day]))
      .rows[0].jobs.length <= 5,
  );
  // A busy tenant cannot fill an entire round before another tenant's first job.
  await db.exec("begin");
  await db.exec("update whatsapp_config set enabled=false");
  const queueGyms = [crypto.randomUUID(), crypto.randomUUID()];
  for (const queueGym of queueGyms) {
    await db.query("insert into gyms(id,name) values($1,'Queue fixture')", [
      queueGym,
    ]);
    await db.query(
      "insert into whatsapp_config(gym_id,enabled,phone_number_id,daily_send_cap) values($1,true,'queue-test',200)",
      [queueGym],
    );
    await db.query(
      "insert into whatsapp_templates(gym_id,name,body) values($1,'queue_test','Reminder')",
      [queueGym],
    );
    await db.query(
      "insert into reminder_rules(gym_id,name,offset_days,template_name,audience) values($1,'Queue',0,'queue_test','expiring')",
      [queueGym],
    );
    for (let i = 0; i < 4; i++) {
      const queueMember = crypto.randomUUID();
      await db.query(
        "insert into members(id,gym_id,name,phone,whatsapp_consent) values($1,$2,'Queue member',$3,true)",
        [queueMember, queueGym, "987650000" + i],
      );
      await db.query(
        "insert into memberships(gym_id,member_id,plan_name,start_date,end_date,amount) values($1,$2,'Queue plan',$3::date,$3::date,0)",
        [queueGym, queueMember, day],
      );
    }
  }
  const queued = (
    await db.query("select wa_due_messages($1::date,2) as jobs", [day])
  ).rows[0].jobs;
  assert.equal(queued.length, 2);
  assert.equal(new Set(queued.map((job) => job.gym_id)).size, 2);
  const firstJob = queued[0];
  const firstKey = `scheduled:${day}:${firstJob.gym_id}:${firstJob.member_id}:${firstJob.template_name}`;
  await db.query("select wa_claim_dispatch($1,$2,$3,$4)", [
    firstKey,
    firstJob.gym_id,
    firstJob.member_id,
    firstJob.template_name,
  ]);
  const afterClaim = (
    await db.query("select wa_due_messages($1::date,2) as jobs", [day])
  ).rows[0].jobs;
  assert(!afterClaim.some((job) => job.member_id === firstJob.member_id));
  assert.equal(
    afterClaim.length,
    2,
    "Already claimed jobs must not consume a later run's global limit",
  );
  await db.exec("rollback");
  // Receipt exports read all pages from one unchanged tenant revision.
  const exportPage = async (
    cursor = null,
    revision = null,
    limit = 3,
    search = "",
  ) =>
    (
      await db.query("select get_payment_export_page($1,$2,$3,$4,$5) as page", [
        limit,
        cursor?.at ?? null,
        cursor?.id ?? null,
        revision,
        search,
      ])
    ).rows[0].page;
  const exportIds = new Set();
  const exportRows = [];
  let exportCursor = null,
    exportRevision = null;
  do {
    const page = await exportPage(exportCursor, exportRevision);
    exportRevision = page.revision;
    assert(page.rows.length <= 3);
    for (const row of page.rows) {
      assert(!exportIds.has(row.id));
      exportIds.add(row.id);
      exportRows.push(row.cells);
    }
    exportCursor = page.nextCursor;
    if (!page.hasMore) break;
  } while (exportCursor);
  // Names are live member names, while immutable receipt snapshots remain unchanged.
  const exportSnapshot = await read();
  assert.equal(exportIds.size, exportSnapshot.payments.length);
  for (let i = 0; i < exportRows.length; i++) {
    const payment = exportSnapshot.payments[i];
    assert.deepEqual(exportRows[i], [
      payment.receipt,
      exportSnapshot.members.find((m) => m.id === payment.memberId).name,
      payment.at,
      payment.method,
      payment.amount / 100,
      payment.voided ? "Voided" : "Valid",
    ]);
  }
  const sampleReceipt = exportSnapshot.payments[0].receipt;
  const matching = await exportPage(
    null,
    null,
    500,
    sampleReceipt.toLowerCase(),
  );
  assert.deepEqual(
    matching.rows.map((row) => row.cells[0]),
    exportSnapshot.payments
      .filter((p) =>
        (
          exportSnapshot.members.find((m) => m.id === p.memberId).name +
          " " +
          p.receipt
        )
          .toLowerCase()
          .includes(sampleReceipt.toLowerCase()),
      )
      .map((p) => p.receipt),
  );
  const indiaDay = (at) =>
    new Date(Date.parse(at) + 19800000).toISOString().slice(0, 10);
  const exportDay = indiaDay(exportSnapshot.payments[0].at);
  const dated = (
    await db.query(
      "select get_payment_export_page(p_limit=>500,p_from=>$1::date,p_to=>$1::date,p_exclude_voided=>true) as page",
      [exportDay],
    )
  ).rows[0].page;
  assert.deepEqual(
    dated.rows.map((row) => row.id),
    exportSnapshot.payments
      .filter((p) => !p.voided && indiaDay(p.at) === exportDay)
      .map((p) => p.id),
  );
  await assert.rejects(() => exportPage(null, null, 501), /page size/);
  const firstExport = await exportPage();
  assert(firstExport.hasMore);
  await db.exec("begin");
  await db.query("update members set name=name||' revised' where id=$1", [
    target.id,
  ]);
  await assert.rejects(
    () => exportPage(firstExport.nextCursor, firstExport.revision),
    /changed during export/,
  );
  await db.exec("rollback");
  await assert.rejects(
    () => exportPage(firstExport.nextCursor),
    /revision is required/,
  );
  await db.exec("begin");
  const reassignedGym = crypto.randomUUID();
  await db.query(
    "insert into gyms(id,name,data_revision) values($1,'Reassigned gym',$2::bigint)",
    [reassignedGym, firstExport.revision.split(":")[1]],
  );
  await db.query("update staff_profiles set gym_id=$1 where user_id=$2", [
    reassignedGym,
    owner,
  ]);
  await assert.rejects(
    () => exportPage(firstExport.nextCursor, firstExport.revision),
    /changed during export/,
  );
  await db.exec("rollback");
  await db.query("select set_config('test.user',$1,false)", [staff]);
  assert((await exportPage()).rows.length <= 3);
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(() => exportPage(), /access/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  // Server histories are bounded, cursor-stable and tenant/role scoped.
  const history = async (kind, cursor = null, limit = 3) =>
    (
      await db.query("select get_history_page($1,$2,$3,$4) as page", [
        kind,
        limit,
        cursor?.at ?? null,
        cursor?.id ?? null,
      ])
    ).rows[0].page;
  const seen = new Set();
  let next = null;
  do {
    const page = await history("payments", next);
    assert(page.rows.length <= 3);
    for (const p of page.rows) {
      assert(!seen.has(p.id), "Keyset pagination must not repeat records");
      seen.add(p.id);
    }
    next = page.nextCursor;
    if (!page.hasMore) break;
  } while (next);
  assert.equal(
    seen.size,
    (await read()).payments.length,
    "Every matching receipt can be reached",
  );
  assert((await history("audit")).rows.length <= 3);
  await assert.rejects(() => history("payments", null, 101), /Page size/);
  await db.query("select set_config('test.user',$1,false)", [staff]);
  await assert.rejects(() => history("audit"), /Admin permission/);
  assert((await history("payments")).rows.length <= 3);
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(() => history("payments"), /access/);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  // Historical volume affects summaries, never the number of raw startup rows.
  await db.exec("begin");
  const historyMember = crypto.randomUUID(),
    historyPeriod = crypto.randomUUID();
  await db.query(
    "insert into members(id,gym_id,name,phone,joined) values($1,$2,'Historical member','9876500500',$3::date-700)",
    [historyMember, g, day],
  );
  await db.query(
    "insert into memberships(id,gym_id,member_id,plan_name,start_date,end_date,amount,due_date) values($1,$2,$3,'Historical plan',$4::date-700,$4::date+30,2000000,$4::date-700)",
    [historyPeriod, g, historyMember, day],
  );
  const compactRead = async () =>
    (await db.query("select get_gym_dashboard() as data")).rows[0].data;
  const beforeCompact = await compactRead();
  const beforeFull = await read();
  await db.query(
    "insert into payments(gym_id,membership_id,member_id,amount,method,paid_at,receipt,gym_name,gym_phone,gym_address,member_name) select $1,$2,$3,1000,'Cash',($4::date-400)::timestamp at time zone 'Asia/Kolkata'+n*interval '1 second','ARCHIVE-'||n,'Test Gym','','','Historical member' from generate_series(1,1000) n",
    [g, historyPeriod, historyMember, day],
  );
  await db.query(
    "insert into attendance(gym_id,member_id,day,checked_at) select $1,$2,$3::date-700+n,($3::date-700+n)::timestamp at time zone 'Asia/Kolkata' from generate_series(1,600) n",
    [g, historyMember, day],
  );
  const compact = await compactRead(),
    complete = await read();
  assert(compact.payments.length <= 5);
  assert.equal(
    compact.dashboard.paid[historyPeriod],
    1000000,
    "Ancient receipts still settle lifetime dues",
  );
  assert(compact.attendance.length <= complete.members.length * 2);
  assert.equal(compact.reminders.length, 0);
  assert(compact.dashboard.paymentDays.length <= 63);
  assert(compact.dashboard.visitDays.length <= 63);
  assert(compact.dashboard.hours.length <= 24);
  assert(
    JSON.stringify(compact).length - JSON.stringify(beforeCompact).length <
      1024,
    "1600 old history records must not cause linear bootstrap growth",
  );
  assert(
    JSON.stringify(complete).length - JSON.stringify(beforeFull).length >
      100000,
  );
  const india = (at) =>
    new Date(Date.parse(at) + 19800000).toISOString().slice(0, 10);
  for (const membership of complete.memberships)
    assert.equal(
      compact.dashboard.paid[membership.id] ?? 0,
      complete.payments
        .filter((p) => !p.voided && p.membershipId === membership.id)
        .reduce((sum, p) => sum + p.amount, 0),
    );
  for (const row of compact.dashboard.paymentDays) {
    const payments = complete.payments.filter(
      (p) => !p.voided && india(p.at) === row.day,
    );
    assert.equal(
      row.amount,
      payments.reduce((sum, p) => sum + p.amount, 0),
    );
    assert.equal(row.count, payments.length);
  }
  const visitIds = new Set();
  let visitCursor = null;
  do {
    const page = (
      await db.query("select get_attendance_page(100,$1,$2) as page", [
        visitCursor?.at ?? null,
        visitCursor?.id ?? null,
      ])
    ).rows[0].page;
    assert(page.rows.length <= 100);
    for (const row of page.rows) {
      assert(!visitIds.has(row.id));
      visitIds.add(row.id);
    }
    visitCursor = page.nextCursor;
    if (!page.hasMore) break;
  } while (visitCursor);
  assert.equal(
    visitIds.size,
    complete.attendance.length,
    "Every historical visit is reachable through bounded pages",
  );
  const matched = (
    await db.query(
      "select get_attendance_page(p_query=>'Historical member') as page",
    )
  ).rows[0].page;
  assert(matched.rows.every((row) => row.memberId === historyMember));
  const inside = (
    await db.query("select get_attendance_page(p_inside=>true) as page")
  ).rows[0].page;
  assert(inside.rows.every((row) => !row.outAt && row.day === day));
  await assert.rejects(
    () => db.query("select get_attendance_page(101)"),
    /Page size/,
  );
  await db.exec("rollback");
  await db.exec("begin");
  for (const row of compact.dashboard.visitDays)
    assert.equal(
      row.count,
      complete.attendance.filter((a) => a.day === row.day).length,
    );
  await db.exec("rollback");
  await db.query("select set_config('test.user',$1,false)", [outsider]);
  await assert.rejects(compactRead, /access/);
  await assert.rejects(
    () => db.query("select get_attendance_page()"),
    /access/,
  );
  await db.query("select set_config('test.user',$1,false)", [staff]);
  assert.equal((await compactRead()).staff.length, 0);
  await db.query("select set_config('test.user',$1,false)", [owner]);
  const privileges = await db.query(
    "select has_table_privilege('authenticated','public.payments','INSERT') as allowed",
  );
  assert.equal(privileges.rows[0].allowed, false);
  console.log(
    "PASS: migration, member profile fields with validation, month-end renewal, overlap rejection, idempotent payments, overpayment rejection, receipt snapshots, admin-only void/override, attendance deduplication, WhatsApp config/templates/rules with service RPCs, staff admin, plan/member deletion and membership expiry, admin-only audit trail, audited CSV exports, seven-digit receipt growth, unassigned-account isolation and denied direct writes.",
  );
} finally {
  await db.close();
}
