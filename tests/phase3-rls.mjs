/**
 * Phase 3 RLS / upload RPC tests.
 *
 * Requires the local Supabase stack with all migrations applied. Run after
 * `npx supabase db reset`. Covers the uploads table grants, safe views,
 * quotas, blocklist, linking backstop and cleanup RPC. The HTTP route itself
 * (magic bytes, streaming limits, EXIF stripping, origin checks) is covered
 * by tests/phase3-http.mjs.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbContainer =
  process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_animated-octo-sniffle";

if (!anonKey || !serviceRoleKey) {
  console.error(
    "Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (values from `npx supabase start`).",
  );
  process.exit(2);
}

const marker = `phase3-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = "Test-password-123!";
const adminClient = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds = [];
let savedAuthTrigger = null;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function runSql(sql) {
  const output = execFileSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  );

  return output.trim();
}

function expectError(result, label) {
  assert(result.error, `${label}: expected an error`);
  pass(label);
  return result.error;
}

function expectOk(result, label) {
  assert.ifError(result.error);
  pass(label);
  return result.data;
}

function relaxAuthTrigger() {
  savedAuthTrigger = runSql(
    "select pg_get_functiondef('public.handle_new_user()'::regprocedure);",
  );

  if (!savedAuthTrigger) {
    throw new Error("Could not read the live handle_new_user() definition");
  }

  runSql(`
    create or replace function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $$
    begin
      return new;
    end;
    $$;
  `);
}

function restoreAuthTrigger() {
  if (!savedAuthTrigger) {
    throw new Error("The live handle_new_user() definition was not saved");
  }

  runSql(savedAuthTrigger);
}

async function createUser(key, role, isBanned = false) {
  const email = `${key}-${marker}@example.test`;
  const username = `${key}${marker.replace(/[^a-z0-9]/g, "").slice(-10)}`;

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kaluwo_invite: true },
    user_metadata: { username },
  });

  assert.ifError(error);
  const id = data.user.id;
  createdUserIds.push(id);

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id,
    username,
    role,
    is_banned: isBanned,
    banned_until: null,
    onboarding_completed: true,
  });
  assert.ifError(profileError);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInError);

  return { id, email, username, client };
}

async function createThread(user, title, board = "general") {
  const { data, error } = await user.client.rpc("create_thread", {
    p_board_id: board,
    p_title: title,
    p_content: `<p>${title}</p>`,
  });
  assert.ifError(error);
  return data[0];
}

function fakeHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function insertUpload({ uploaderId, url, providerFileId, size, mime, status = "active", createdAt = null, removalReason = null }) {
  const row = {
    uploader_id: uploaderId,
    provider: "catbox",
    provider_file_id: providerFileId ?? `${randomUUID()}.png`,
    url,
    mime_type: mime,
    size_bytes: size,
    raw_sha256: fakeHash(`raw:${url}`),
    sha256: fakeHash(`stripped:${url}`),
    status,
    removal_reason: status === "removed" ? removalReason ?? "Phase 3 test removal" : null,
    removed_at: status === "removed" ? new Date().toISOString() : null,
  };

  const { data, error } = await adminClient.from("uploads").insert(row).select("id").single();
  assert.ifError(error);

  if (createdAt) {
    runSql(
      `update public.uploads set created_at = '${createdAt}' where id = '${data.id}';`,
    );
  }

  return { ...row, id: data.id };
}

async function main() {
  relaxAuthTrigger();

  let memberA;
  let memberB;
  let senior;
  let newbie;
  let moderator;
  let moderator2;
  let admin;
  let banned;

  try {
    memberA = await createUser("p3membera", "member");
    memberB = await createUser("p3memberb", "member");
    senior = await createUser("p3senior", "senior_member");
    newbie = await createUser("p3newbie", "new_member");
    moderator = await createUser("p3mod", "moderator");
    moderator2 = await createUser("p3mod2", "moderator");
    admin = await createUser("p3admin", "admin");
    banned = await createUser("p3banned", "member", true);
  } finally {
    restoreAuthTrigger();
  }

  pass("created Phase 3 test users (including senior_member)");

  // -------------------------------------------------------------------------
  // uploads table: no direct API access; views expose the right columns
  // -------------------------------------------------------------------------
  const uploadA = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}a.png`,
    size: 1234,
    mime: "image/png",
  });

  // Unlinked uploads are not visible through the base table RLS.
  const { data: unlinkedSelect, error: unlinkedSelectError } = await memberA.client
    .from("uploads")
    .select("id, url, mime_type, size_bytes, status")
    .eq("id", uploadA.id);
  assert.ifError(unlinkedSelectError);
  assert.equal(unlinkedSelect.length, 0);
  pass("unlinked uploads are not visible through the base table RLS");

  // Now link it and verify it becomes visible.
  const threadLinkA = await createThread(memberA, `Phase3 link thread ${marker}`);
  const threadLinkB = await createThread(memberB, `Phase3 link thread B ${marker}`);
  expectOk(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [uploadA.id],
    }),
    "owner links their upload to their post",
  );

  const { data: linkedSelect, error: linkedSelectError } = await memberA.client
    .from("uploads")
    .select("id, url, mime_type, size_bytes, status")
    .eq("id", uploadA.id);
  assert.ifError(linkedSelectError);
  assert.equal(linkedSelect.length, 1);
  pass("linked uploads are visible through the base table RLS");

  expectError(
    await memberA.client.from("uploads").insert({
      uploader_id: memberA.id,
      provider: "catbox",
      url: "https://files.catbox.moe/testhack.png",
      mime_type: "image/png",
      size_bytes: 10,
      raw_sha256: fakeHash("hack-raw"),
      sha256: fakeHash("hack-stripped"),
    }),
    "member cannot insert into the uploads base table",
  );
  expectError(
    await memberA.client.from("uploads").delete().eq("id", uploadA.id),
    "member cannot delete from the uploads base table",
  );

  // Create a second upload that stays unlinked for the public_uploads test.
  const unlinkedUpload = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}unlinked.png`,
    size: 100,
    mime: "image/png",
  });

  // Unlinked uploads are not enumerable through the public view.
  const { data: unlinkedPublic, error: unlinkedPublicError } = await anonClient
    .from("public_uploads")
    .select("id")
    .eq("id", unlinkedUpload.id);
  assert.ifError(unlinkedPublicError);
  assert.equal(
    unlinkedPublic.length,
    0,
    "an unlinked upload must not be visible through public_uploads",
  );
  pass("public_uploads hides uploads that are not attached to a post");

  const { data: staffViewAsMember, error: staffViewMemberError } =
    await memberA.client.rpc("staff_uploads");
  // Non-staff users are denied at the Postgres level; the function's
  // internal check would return an empty set, but the GRANT to
  // authenticated means they can call it and get an empty result.
  // Treat a permission error as "no access" for this test.
  if (staffViewMemberError) {
    assert.match(staffViewMemberError.message, /permission denied/);
    pass("staff_uploads() denies non-staff with permission error");
  } else {
    assert.equal(staffViewAsMember.length, 0);
    pass("staff_uploads() returns no rows to non-staff");
  }

  const { data: staffViewAsStaff, error: staffViewStaffError } =
    await moderator.client.rpc("staff_uploads");
  assert.ifError(staffViewStaffError);
  assert(staffViewAsStaff.some((row) => row.id === uploadA.id));
  pass("staff_uploads() returns rows to staff");

  // -------------------------------------------------------------------------
  // link_uploads_to_post: ownership, status, cap, signature cases
  // -------------------------------------------------------------------------
  const link1 = expectOk(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [uploadA.id],
    }),
    "owner links their upload to their post",
  );
  assert.equal(link1[0].linked, 1);

  // Now that it is attached, anon can read the safe columns only.
  const { data: publicRows, error: publicError } = await anonClient
    .from("public_uploads")
    .select("id, url, mime_type, size_bytes, status")
    .eq("id", uploadA.id);
  assert.ifError(publicError);
  assert.equal(publicRows.length, 1);
  assert.equal(publicRows[0].url, uploadA.url);
  assert(!Object.prototype.hasOwnProperty.call(publicRows[0], "uploader_id"));
  assert(!Object.prototype.hasOwnProperty.call(publicRows[0], "raw_sha256"));
  assert(!Object.prototype.hasOwnProperty.call(publicRows[0], "sha256"));
  assert(!Object.prototype.hasOwnProperty.call(publicRows[0], "provider_file_id"));
  pass("public_uploads exposes only the safe columns, including to anon");

  expectError(
    await memberB.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [uploadA.id],
    }),
    "a member cannot attach another member's upload to their post",
  );
  expectError(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkB.post_id,
      p_upload_ids: [uploadA.id],
    }),
    "a member cannot attach their upload to another member's post",
  );

  // A removed upload cannot be linked.
  const uploadRemoved = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}removed.png`,
    size: 10,
    mime: "image/png",
    status: "removed",
    removalReason: "Phase 3 removed upload",
  });

  expectError(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [uploadRemoved.id],
    }),
    "a removed upload cannot be linked",
  );

  // More than 8 attachments is rejected.
  const manyIds = [];

  for (let index = 0; index < 9; index += 1) {
    const row = await insertUpload({
      uploaderId: memberA.id,
      url: `https://files.catbox.moe/${marker}bulk${index}.png`,
      size: 10,
      mime: "image/png",
    });
    manyIds.push(row.id);
  }

  expectError(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: manyIds,
    }),
    "more than 8 attachments are rejected",
  );

  // Backstop trigger blocks cross-owner links even with elevated privileges.
  const directLink = await adminClient
    .from("post_uploads")
    .insert({ post_id: threadLinkB.post_id, upload_id: uploadA.id });
  assert(directLink.error);
  pass("backstop trigger rejects cross-owner attachment even as service role");

  // Linking the same upload twice is idempotent.
  const linkAgain = expectOk(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [uploadA.id],
    }),
    "re-linking is idempotent",
  );
  assert.equal(linkAgain[0].linked, 1);

  // Members can read the links to render attachments.
  const { data: links, error: linksError } = await memberB.client
    .from("post_uploads")
    .select("post_id, upload_id")
    .eq("post_id", threadLinkA.post_id);
  assert.ifError(linksError);
  assert(links.some((row) => row.upload_id === uploadA.id));
  pass("anyone can read post upload links");

  // -------------------------------------------------------------------------
  // consume_upload_quota: daily counts/bytes and role tiers (service role)
  // -------------------------------------------------------------------------
  const newbieId = newbie.id;
  runSql(
    `delete from kaluwo_private.upload_quotas where user_id = '${newbieId}';`,
  );
  const smallBytes = 1024;
  const { error: quotaOkError } = await adminClient.rpc(
    "consume_upload_quota",
    { p_user_id: newbieId, p_bytes: smallBytes },
  );
  assert.ifError(quotaOkError);
  const quotaCount = runSql(
    `select count::text || '/' || bytes::text from kaluwo_private.upload_quotas where user_id = '${newbieId}' and day = current_date;`,
  );
  assert.equal(quotaCount, "1/1024");
  pass("service role can consume upload quota and it is tracked");

  // Push the new_member to the daily byte cap and expect a rate-limit error.
  runSql(
    `update kaluwo_private.upload_quotas set bytes = 25 * 1024 * 1024 where user_id = '${newbieId}' and day = current_date;`,
  );
  const { error: quotaExhaustedError } = await adminClient.rpc(
    "consume_upload_quota",
    { p_user_id: newbieId, p_bytes: 1 },
  );
  assert(quotaExhaustedError);
  assert.equal(quotaExhaustedError.hint, "kaluwo_rate_limited");
  pass("daily byte quota is enforced for new members");

  // Member tier is higher than the new_member cap.
  runSql(
    `delete from kaluwo_private.upload_quotas where user_id = '${memberA.id}';`,
  );
  runSql(
    `update kaluwo_private.upload_quotas set bytes = 25 * 1024 * 1024 where user_id = '${newbieId}' and day = current_date;`,
  );
  const { error: memberQuotaError } = await adminClient.rpc(
    "consume_upload_quota",
    { p_user_id: memberA.id, p_bytes: 25 * 1024 * 1024 },
  );
  assert.ifError(memberQuotaError);
  pass("member tier has a larger byte quota than new_member");

  // senior_member is the member tier, not staff.
  runSql(
    `delete from kaluwo_private.upload_quotas where user_id = '${senior.id}';`,
  );
  const seniorQuotaCheck = runSql(
    `select role from public.profiles where id = '${senior.id}';`,
  );
  assert.equal(seniorQuotaCheck, "senior_member");
  const { error: seniorStaffError } = await senior.client.rpc(
    "moderate_warn_user",
    { p_target_id: memberB.id, p_reason: "senior member must not moderate" },
  );
  assert(seniorStaffError);
  const seniorThread = await createThread(senior, `Phase3 senior thread ${marker}`);
  assert(seniorThread.thread_id > 0);
  pass("senior_member is member tier, not staff");

  expectError(
    await adminClient.rpc("consume_upload_quota", {
      p_user_id: banned.id,
      p_bytes: 1024,
    }),
    "effective banned members cannot consume upload quota",
  );
  expectError(
    await memberA.client.rpc("consume_upload_quota", {
      p_user_id: memberA.id,
      p_bytes: 1024,
    }),
    "consume_upload_quota is service-role only",
  );
  expectError(
    await anonClient.rpc("consume_upload_quota", {
      p_user_id: memberA.id,
      p_bytes: 1024,
    }),
    "anonymous caller cannot consume upload quota",
  );

  // -------------------------------------------------------------------------
  // Hash blocklist (staff block, admin unblock) + mod_log
  // -------------------------------------------------------------------------
  const blockHash = fakeHash("phase3-known-bad");
  const blockResult = expectOk(
    await moderator.client.rpc("moderate_block_upload_hash", {
      p_sha256: blockHash,
      p_reason: "Phase 3 known-bad file",
    }),
    "moderator blocks a hash",
  )[0];
  assert.equal(blockResult.changed, true);

  const blockAgain = expectOk(
    await moderator.client.rpc("moderate_block_upload_hash", {
      p_sha256: blockHash,
      p_reason: "Phase 3 known-bad file",
    }),
    "re-blocking an already blocked hash",
  )[0];
  assert.equal(blockAgain.changed, false);

  expectError(
    await memberA.client.rpc("moderate_block_upload_hash", {
      p_sha256: fakeHash("member-attempt"),
      p_reason: "Member cannot block hashes",
    }),
    "members cannot block hashes",
  );
  expectError(
    await moderator.client.rpc("moderate_unblock_upload_hash", {
      p_sha256: blockHash,
      p_reason: "Moderator cannot unblock hashes",
    }),
    "only an admin can unblock a hash",
  );

  const { data: blockLog } = await moderator.client
    .from("mod_log")
    .select("action, target_type")
    .eq("target_id", blockHash)
    .eq("action", "upload.block_hash")
    .limit(1)
    .single();
  assert.equal(blockLog.action, "upload.block_hash");
  pass("hash block is written to the mod log");

  expectOk(
    await admin.client.rpc("moderate_unblock_upload_hash", {
      p_sha256: blockHash,
      p_reason: "Phase 3 unblock for test cleanup",
    }),
    "admin unblocks a hash",
  );

  // -------------------------------------------------------------------------
  // Staff removal: hides from members, restore works, hierarchy, mod_log
  // -------------------------------------------------------------------------
  const removalUpload = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}gone.png`,
    size: 500,
    mime: "image/png",
  });

  // Attach it first: the public view only lists uploads on a visible post.
  expectOk(
    await memberA.client.rpc("link_uploads_to_post", {
      p_post_id: threadLinkA.post_id,
      p_upload_ids: [removalUpload.id],
    }),
    "owner attaches the upload used for the removal test",
  );

  expectError(
    await memberA.client.rpc("moderate_remove_upload", {
      p_upload_id: removalUpload.id,
      p_reason: "Member cannot remove uploads",
    }),
    "members cannot remove uploads",
  );

  expectOk(
    await moderator.client.rpc("moderate_remove_upload", {
      p_upload_id: removalUpload.id,
      p_reason: "Phase 3 removal for members",
    }),
    "moderator removes a member's upload",
  );

  const { data: publicAfterRemoval } = await anonClient
    .from("public_uploads")
    .select("status, url")
    .eq("id", removalUpload.id)
    .maybeSingle();
  assert.equal(
    publicAfterRemoval,
    null,
    "members must not see removed uploads at all",
  );

  const { data: staffUrlAfterRemoval } = await moderator.client
    .from("public_uploads")
    .select("status, url")
    .eq("id", removalUpload.id)
    .single();
  assert.equal(
    staffUrlAfterRemoval.url,
    removalUpload.url,
    "staff keep the URL so the placeholder can map the removal",
  );
  pass("removed uploads hide the URL from members but not from staff");

  const { data: staffAfterRemovalRows, error: staffAfterRemovalError } =
    await moderator.client.rpc("staff_uploads");
  assert.ifError(staffAfterRemovalError);
  const staffAfterRemoval = staffAfterRemovalRows?.find(
    (r) => r.id === removalUpload.id,
  );
  assert(staffAfterRemoval);
  assert.equal(staffAfterRemoval.status, "removed");
  assert.equal(staffAfterRemoval.removal_reason, "Phase 3 removal for members");
  assert.equal(staffAfterRemoval.removed_by_username, moderator.username);
  pass("removed upload is hidden from members and visible to staff with reason");

  const restore = expectOk(
    await moderator.client.rpc("moderate_restore_upload", {
      p_upload_id: removalUpload.id,
      p_reason: "Phase 3 restore",
    }),
    "moderator restores the upload",
  )[0];
  assert.equal(restore.changed, true);

  const restoreAgain = expectOk(
    await moderator.client.rpc("moderate_restore_upload", {
      p_upload_id: removalUpload.id,
      p_reason: "Phase 3 restore",
    }),
    "restoring an active upload",
  )[0];
  assert.equal(restoreAgain.changed, false);

  // A moderator cannot remove an upload owned by another moderator.
  const mod2Upload = await insertUpload({
    uploaderId: moderator2.id,
    url: `https://files.catbox.moe/${marker}modown.png`,
    size: 100,
    mime: "image/png",
  });

  expectError(
    await moderator.client.rpc("moderate_remove_upload", {
      p_upload_id: mod2Upload.id,
      p_reason: "Moderator acting on moderator",
    }),
    "moderator cannot remove another moderator's upload",
  );

  // Admin can.
  expectOk(
    await admin.client.rpc("moderate_remove_upload", {
      p_upload_id: mod2Upload.id,
      p_reason: "Admin acting on moderator",
    }),
    "admin can remove a moderator's upload",
  );

  const { data: removalLog } = await moderator.client
    .from("mod_log")
    .select("action, actor_username")
    .eq("target_id", removalUpload.id)
    .eq("action", "upload.remove")
    .limit(1)
    .single();
  assert.equal(removalLog.actor_username, moderator.username);
  pass("upload removal is written to the mod log");

  // -------------------------------------------------------------------------
  // Report an upload (member reports staff / member uploads and vice versa)
  // -------------------------------------------------------------------------
  const reportTarget = await insertUpload({
    uploaderId: memberB.id,
    url: `https://files.catbox.moe/${marker}report.png`,
    size: 100,
    mime: "image/png",
  });

  const uploadReport = await memberA.client.from("reports").insert({
    reporter_id: memberA.id,
    target_type: "upload",
    post_id: null,
    target_user_id: null,
    target_upload_id: reportTarget.id,
    reason: "Phase 3 report on an upload",
    status: "open",
  }).select("id").single();
  assert.ifError(uploadReport.error);

  const duplicateUploadReport = await memberA.client.from("reports").insert({
    reporter_id: memberA.id,
    target_type: "upload",
    post_id: null,
    target_user_id: null,
    target_upload_id: reportTarget.id,
    reason: "Duplicate upload report",
    status: "open",
  });
  assert(duplicateUploadReport.error);
  assert.equal(duplicateUploadReport.error.code, "23505");
  pass("one open report per reporter per upload is enforced");

  expectOk(
    await moderator.client.rpc("staff_resolve_report", {
      p_report_id: uploadReport.data.id,
      p_status: "resolved",
      p_note: "Phase 3 upload report resolved",
    }),
    "moderator resolves a report about a member's upload",
  );

  // A report about a moderator's upload cannot be resolved by that moderator
  // and can be resolved by an admin.
  const ownUpload = await insertUpload({
    uploaderId: moderator.id,
    url: `https://files.catbox.moe/${marker}own.png`,
    size: 100,
    mime: "image/png",
  });

  const ownReport = await memberA.client.from("reports").insert({
    reporter_id: memberA.id,
    target_type: "upload",
    post_id: null,
    target_user_id: null,
    target_upload_id: ownUpload.id,
    reason: "Report on a moderator's upload",
    status: "open",
  }).select("id").single();
  assert.ifError(ownReport.error);

  expectError(
    await moderator.client.rpc("staff_resolve_report", {
      p_report_id: ownReport.data.id,
      p_status: "dismissed",
      p_note: "Moderator cannot resolve a report about their own upload",
    }),
    "staff cannot resolve a report about their own upload",
  );

  expectOk(
    await admin.client.rpc("staff_resolve_report", {
      p_report_id: ownReport.data.id,
      p_status: "dismissed",
      p_note: "Admin dismisses the moderator-upload report",
    }),
    "admin can resolve a report about a moderator's upload",
  );

  const { data: reporterResolution } = await memberA.client
    .from("report_resolutions")
    .select("report_id");
  assert.equal(reporterResolution.length, 0);
  pass("reporters cannot read upload report resolutions");

  // -------------------------------------------------------------------------
  // Anonymous callers rejected for every Phase 3 staff RPC
  // -------------------------------------------------------------------------
  const phase3Calls = [
    { name: "link_uploads_to_post", args: { p_post_id: 1, p_upload_ids: [uploadA.id] } },
    { name: "moderate_remove_upload", args: { p_upload_id: uploadA.id, p_reason: "anonymous" } },
    { name: "moderate_restore_upload", args: { p_upload_id: uploadA.id, p_reason: "anonymous" } },
    { name: "moderate_block_upload_hash", args: { p_sha256: fakeHash("x"), p_reason: "anonymous" } },
    { name: "moderate_unblock_upload_hash", args: { p_sha256: fakeHash("x"), p_reason: "anonymous" } },
    { name: "expire_unlinked_uploads", args: {} },
  ];

  for (const call of phase3Calls) {
    expectError(
      await anonClient.rpc(call.name, call.args),
      `${call.name} rejects anonymous callers`,
    );
  }

  // -------------------------------------------------------------------------
  // Expire unlinked uploads (24h, system actor, mod-logged)
  // -------------------------------------------------------------------------
  const staleUpload = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}stale.png`,
    size: 100,
    mime: "image/png",
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  });

  const freshUpload = await insertUpload({
    uploaderId: memberA.id,
    url: `https://files.catbox.moe/${marker}fresh.png`,
    size: 100,
    mime: "image/png",
  });

  const expiredRows = expectOk(
    await adminClient.rpc("expire_unlinked_uploads"),
    "service role expires unlinked uploads",
  );
  assert(Array.isArray(expiredRows));
  assert(expiredRows.length >= 1);
  assert(expiredRows.some((row) => row.id === staleUpload.id));

  const { data: staleRows } = await moderator.client.rpc("staff_uploads");
  const staleAfter = staleRows?.find((r) => r.id === staleUpload.id);
  assert(staleAfter);
  assert.equal(staleAfter.status, "removed");

  const { data: freshRows } = await moderator.client.rpc("staff_uploads");
  const freshAfter = freshRows?.find((r) => r.id === freshUpload.id);
  assert(freshAfter);
  assert.equal(freshAfter.status, "active");

  const { data: systemLog } = await moderator.client
    .from("mod_log")
    .select("actor_username, reason")
    .eq("target_id", staleUpload.id)
    .eq("action", "upload.remove")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  assert.equal(systemLog.actor_username, "system");
  pass("unlinked stale upload is expired by the system and logged");

  expectError(
    await memberA.client.rpc("expire_unlinked_uploads"),
    "members cannot expire unlinked uploads",
  );

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  await adminClient
    .from("upload_hash_blocks")
    .delete()
    .eq("sha256", blockHash);
  await adminClient.from("threads").delete().like("title", `%${marker}%`);
  await adminClient
    .from("mod_log")
    .delete()
    .like("target_label", `%${marker}%`);

  for (const id of createdUserIds) {
    await adminClient.auth.admin.deleteUser(id);
  }

  pass("cleanup complete");
}

main().catch(async (error) => {
  console.error("FAIL ", error);
  try {
    await adminClient.from("threads").delete().like("title", `%${marker}%`);

    for (const id of createdUserIds) {
      await adminClient.auth.admin.deleteUser(id);
    }
  } catch {
    // Best effort cleanup.
  }

  process.exitCode = 1;
});
