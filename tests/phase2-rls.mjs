/**
 * Phase 2 RLS / moderation RPC tests.
 *
 * Requires the local Supabase stack with all migrations applied. Run after
 * `npx supabase db reset` and once the Realtime/PostgREST services are warm.
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

const marker = `phase2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

async function comment(user, threadId, content) {
  const { data, error } = await user.client
    .from("posts")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      content: `<p>${content}</p>`,
      is_opening: false,
    })
    .select("id")
    .single();
  assert.ifError(error);
  return data.id;
}

async function modLogCount(targetId, action) {
  const { data } = await adminClient
    .from("mod_log")
    .select("id")
    .eq("target_id", String(targetId))
    .eq("action", action);
  return data?.length ?? 0;
}

async function main() {
  relaxAuthTrigger();

  let memberA;
  let memberB;
  let outsider;
  let moderator;
  let moderator2;
  let admin;
  let admin2;

  try {
    memberA = await createUser("membera", "member");
    memberB = await createUser("memberb", "member");
    outsider = await createUser("outsider", "member");
    moderator = await createUser("moderator", "moderator");
    moderator2 = await createUser("moderator2", "moderator");
    admin = await createUser("admin", "admin");
    admin2 = await createUser("admin2", "admin");
  } finally {
    restoreAuthTrigger();
  }

  pass("created Phase 2 staff and member users");

  // -------------------------------------------------------------------------
  // Privilege escalation through direct PostgREST writes
  // -------------------------------------------------------------------------
  expectError(
    await memberA.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", memberA.id)
      .select(),
    "member cannot change their own role",
  );
  expectError(
    await memberA.client
      .from("profiles")
      .update({ is_banned: true })
      .eq("id", memberA.id)
      .select(),
    "member cannot change their own ban flag",
  );
  expectError(
    await memberA.client
      .from("profiles")
      .update({ banned_until: new Date().toISOString() })
      .eq("id", memberA.id)
      .select(),
    "member cannot change their own ban expiry",
  );
  const otherProfileUpdate = await memberA.client
    .from("profiles")
    .update({ username: `hacked${marker}` })
    .eq("id", memberB.id)
    .select("id");
  assert(
    otherProfileUpdate.error ||
      (otherProfileUpdate.data ?? []).length === 0,
    "member cannot update another profile",
  );
  pass("member cannot update another profile");
  expectError(
    await moderator.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", memberA.id)
      .select(),
    "moderator cannot change a role directly",
  );
  expectError(
    await admin.client
      .from("profiles")
      .update({ role: "moderator" })
      .eq("id", memberA.id)
      .select(),
    "admin cannot bypass the role RPC with a direct profile update",
  );

  const threadA = await createThread(memberA, `Phase2 thread A ${marker}`);
  const threadB = await createThread(memberB, `Phase2 thread B ${marker}`);

  expectError(
    await moderator.client
      .from("threads")
      .update({ is_locked: true })
      .eq("id", threadA.thread_id),
    "moderator cannot directly update a thread",
  );
  expectError(
    await moderator.client
      .from("posts")
      .update({ is_deleted: true })
      .eq("id", threadA.post_id),
    "moderator cannot directly soft-delete a post",
  );

  expectError(
    await moderator.client.from("mod_log").insert({
      actor_id: moderator.id,
      actor_username: moderator.username,
      action: "thread.lock",
      target_type: "thread",
      target_id: String(threadA.thread_id),
      target_label: "fake",
      reason: "fake",
    }),
    "moderator cannot insert directly into the mod log",
  );
  expectError(
    await admin.client
      .from("mod_log")
      .update({ reason: "changed" })
      .eq("id", 1),
    "admin cannot update the mod log through the API",
  );
  expectError(
    await admin.client.from("mod_log").delete().eq("id", 1),
    "admin cannot delete from the mod log through the API",
  );

  const { data: memberLogRead } = await memberA.client
    .from("mod_log")
    .select("id");
  assert.equal(memberLogRead.length, 0);

  // -------------------------------------------------------------------------
  // Content moderation RPCs, hierarchy and visibility
  // -------------------------------------------------------------------------
  const lock = expectOk(
    await moderator.client.rpc("moderate_set_thread_locked", {
      p_thread_id: threadA.thread_id,
      p_locked: true,
      p_reason: "Test lock for Phase 2",
    }),
    "moderator locks a member thread",
  )[0];
  assert.equal(lock.changed, true);

  const { data: staffLogRead, error: staffLogError } = await moderator.client
    .from("mod_log")
    .select("id")
    .eq("target_id", String(threadA.thread_id))
    .eq("action", "thread.lock")
    .limit(1);
  assert.ifError(staffLogError);
  assert.equal(staffLogRead.length, 1);
  pass("mod log is staff-readable and append-only through the API");

  const lockAgain = expectOk(
    await moderator.client.rpc("moderate_set_thread_locked", {
      p_thread_id: threadA.thread_id,
      p_locked: true,
      p_reason: "Test lock for Phase 2",
    }),
    "locking an already locked thread",
  )[0];
  assert.equal(lockAgain.changed, false);
  assert.equal(
    await modLogCount(threadA.thread_id, "thread.lock"),
    1,
    "idempotent lock writes one mod-log row",
  );

  const pin = expectOk(
    await moderator.client.rpc("moderate_set_thread_pinned", {
      p_thread_id: threadA.thread_id,
      p_pinned: true,
      p_reason: "Test pin for Phase 2",
    }),
    "moderator pins a thread",
  )[0];
  assert.equal(pin.changed, true);

  const { data: pinnedList } = await memberA.client.rpc("list_threads", {
    p_board_id: "general",
    p_sort: "latest",
    p_pinned: true,
  });
  assert(pinnedList.some((row) => row.id === threadA.thread_id));

  const { data: unpinnedList } = await memberA.client.rpc("list_threads", {
    p_board_id: "general",
    p_sort: "latest",
    p_pinned: false,
  });
  assert(!unpinnedList.some((row) => row.id === threadA.thread_id));
  pass("pinned section excludes pinned threads from the main feed");

  // Unpin mid-pagination: the main cursor remains valid because the pinned
  // section is separate from the cursor-paginated main list.
  const { data: beforeUnpinPage } = await memberA.client.rpc("list_threads", {
    p_board_id: "general",
    p_sort: "latest",
    p_pinned: false,
    p_limit: 1,
  });
  assert.equal(beforeUnpinPage.length, 1);

  expectOk(
    await moderator.client.rpc("moderate_set_thread_pinned", {
      p_thread_id: threadA.thread_id,
      p_pinned: false,
      p_reason: "Test unpin during pagination",
    }),
    "moderator unpins a thread mid-pagination",
  );

  const { data: afterUnpinPage } = await memberA.client.rpc("list_threads", {
    p_board_id: "general",
    p_sort: "latest",
    p_pinned: false,
    p_limit: 1,
    p_before_at: beforeUnpinPage[0].last_post_at,
    p_before_id: beforeUnpinPage[0].id,
  });
  assert.equal(afterUnpinPage.length, 1);
  assert.notEqual(afterUnpinPage[0].id, beforeUnpinPage[0].id);
  pass("unpin mid-pagination does not break the main cursor");

  const move = expectOk(
    await moderator.client.rpc("moderate_move_thread", {
      p_thread_id: threadA.thread_id,
      p_board_id: "technology",
      p_reason: "Move to technology for Phase 2",
    }),
    "moderator moves a thread",
  )[0];
  assert.equal(move.changed, true);

  const { data: moveLog } = await moderator.client
    .from("mod_log")
    .select("previous_value, new_value")
    .eq("target_id", String(threadA.thread_id))
    .eq("action", "thread.move")
    .order("id", { ascending: false })
    .limit(1)
    .single();
  assert.equal(moveLog.previous_value.board_id, "general");
  assert.equal(moveLog.new_value.board_id, "technology");
  pass("move_thread records the old and new board in the mod log");

  const deleteThread = expectOk(
    await moderator.client.rpc("moderate_set_thread_deleted", {
      p_thread_id: threadA.thread_id,
      p_deleted: true,
      p_reason: "Delete for Phase 2 visibility test",
    }),
    "moderator deletes a thread",
  )[0];
  assert.equal(deleteThread.changed, true);

  const { data: memberDeletedThread } = await memberA.client
    .from("threads")
    .select("id")
    .eq("id", threadA.thread_id);
  assert.equal(memberDeletedThread.length, 0);

  const { data: staffDeletedThread } = await moderator.client
    .from("threads")
    .select("id, is_deleted, deleted_reason, deleted_by")
    .eq("id", threadA.thread_id)
    .single();
  assert.equal(staffDeletedThread.is_deleted, true);
  assert.equal(staffDeletedThread.deleted_reason, "Delete for Phase 2 visibility test");
  assert.equal(staffDeletedThread.deleted_by, moderator.id);
  pass("deleted threads are hidden from members and visible to staff");

  expectOk(
    await moderator.client.rpc("moderate_set_thread_deleted", {
      p_thread_id: threadA.thread_id,
      p_deleted: false,
      p_reason: "Restore for Phase 2 visibility test",
    }),
    "moderator restores a thread",
  );

  const { data: restoredThread } = await moderator.client
    .from("threads")
    .select("is_deleted, deleted_reason, deleted_by, deleted_at")
    .eq("id", threadA.thread_id)
    .single();
  assert.equal(restoredThread.is_deleted, false);
  assert.equal(restoredThread.deleted_reason, null);
  assert.equal(restoredThread.deleted_by, null);
  assert.equal(restoredThread.deleted_at, null);

  expectOk(
    await moderator.client.rpc("moderate_set_thread_locked", {
      p_thread_id: threadA.thread_id,
      p_locked: false,
      p_reason: "Unlock for Phase 2 comment test",
    }),
    "moderator unlocks a thread",
  );

  const commentId = await comment(memberB, threadA.thread_id, `Phase2 comment ${marker}`);
  expectOk(
    await moderator.client.rpc("moderate_set_post_deleted", {
      p_post_id: commentId,
      p_deleted: true,
      p_reason: "Delete comment for Phase 2 visibility test",
    }),
    "moderator deletes a comment",
  );

  const { data: memberDeletedComment } = await memberB.client
    .from("posts")
    .select("id")
    .eq("id", commentId);
  assert.equal(memberDeletedComment.length, 0);

  const { data: staffDeletedComment } = await moderator.client
    .from("posts")
    .select("id, is_deleted, deleted_reason, deleted_by")
    .eq("id", commentId)
    .single();
  assert.equal(staffDeletedComment.is_deleted, true);
  assert.equal(staffDeletedComment.deleted_reason, "Delete comment for Phase 2 visibility test");
  assert.equal(staffDeletedComment.deleted_by, moderator.id);

  expectOk(
    await moderator.client.rpc("moderate_set_post_deleted", {
      p_post_id: commentId,
      p_deleted: false,
      p_reason: "Restore comment for Phase 2 visibility test",
    }),
    "moderator restores a comment",
  );

  const { data: restoredComment } = await moderator.client
    .from("posts")
    .select("is_deleted, deleted_reason, deleted_by, deleted_at")
    .eq("id", commentId)
    .single();
  assert.equal(restoredComment.is_deleted, false);
  assert.equal(restoredComment.deleted_reason, null);
  assert.equal(restoredComment.deleted_by, null);
  assert.equal(restoredComment.deleted_at, null);
  pass("deleted comments are hidden from members and visible to staff");

  const moderatorThread = await createThread(moderator2, `Phase2 moderator thread ${marker}`);
  expectError(
    await moderator.client.rpc("moderate_set_thread_locked", {
      p_thread_id: moderatorThread.thread_id,
      p_locked: true,
      p_reason: "Moderator acting on another moderator",
    }),
    "moderator cannot act on another moderator's thread",
  );

  expectOk(
    await admin.client.rpc("moderate_set_thread_locked", {
      p_thread_id: moderatorThread.thread_id,
      p_locked: true,
      p_reason: "Admin acting on a moderator thread",
    }),
    "admin can act on a moderator's thread",
  );
  pass("moderator/admin hierarchy is enforced");

  // -------------------------------------------------------------------------
  // Reason validation and anonymous access for all write RPCs
  // -------------------------------------------------------------------------
  const writeRpcCalls = [
    {
      name: "moderate_set_post_deleted",
      client: moderator.client,
      args: { p_post_id: commentId, p_deleted: true },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_set_thread_deleted",
      client: moderator.client,
      args: { p_thread_id: threadB.thread_id, p_deleted: true },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_set_thread_locked",
      client: moderator.client,
      args: { p_thread_id: threadB.thread_id, p_locked: true },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_set_thread_pinned",
      client: moderator.client,
      args: { p_thread_id: threadB.thread_id, p_pinned: true },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_move_thread",
      client: moderator.client,
      args: { p_thread_id: threadB.thread_id, p_board_id: "general" },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_ban_user",
      client: moderator.client,
      args: { p_target_id: memberB.id },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_unban_user",
      client: moderator.client,
      args: { p_target_id: memberB.id },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "moderate_warn_user",
      client: moderator.client,
      args: { p_target_id: memberB.id },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "admin_set_role",
      client: admin.client,
      args: { p_target_id: memberB.id, p_role: "member" },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "staff_resolve_report",
      client: moderator.client,
      args: { p_report_id: 1, p_status: "resolved" },
      reasonKey: "p_note",
      max: 2000,
    },
    {
      name: "admin_create_invite_codes",
      client: admin.client,
      args: { p_count: 1 },
      reasonKey: "p_reason",
      max: 1000,
    },
    {
      name: "admin_revoke_invite_code",
      client: admin.client,
      args: { p_code_hash: "a".repeat(64) },
      reasonKey: "p_reason",
      max: 1000,
    },
  ];

  for (const call of writeRpcCalls) {
    expectError(
      await anonClient.rpc(call.name, {
        ...call.args,
        [call.reasonKey]: "anonymous",
      }),
      `${call.name} rejects anonymous callers`,
    );

    const emptyError = expectError(
      await call.client.rpc(call.name, {
        ...call.args,
        [call.reasonKey]: "",
      }),
      `${call.name} rejects an empty reason`,
    );
    assert.match(emptyError.message, /reason|note/i);

    const oversizedError = expectError(
      await call.client.rpc(call.name, {
        ...call.args,
        [call.reasonKey]: "x".repeat(call.max + 1),
      }),
      `${call.name} rejects an oversized reason`,
    );
    assert.match(oversizedError.message, /reason|note/i);
  }

  // -------------------------------------------------------------------------
  // Ban expiry, ban views, warnings and acknowledgement
  // -------------------------------------------------------------------------
  const banUntil = new Date(Date.now() + 2_500).toISOString();
  expectOk(
    await moderator.client.rpc("moderate_ban_user", {
      p_target_id: memberB.id,
      p_reason: "Short test ban",
      p_until: banUntil,
    }),
    "moderator bans a member with an expiry",
  );

  expectError(
    await memberB.client.from("posts").insert({
      thread_id: threadB.thread_id,
      author_id: memberB.id,
      content: "<p>Banned post attempt</p>",
    }),
    "banned member cannot post before expiry",
  );

  const { error: bannedReactionError } = await memberB.client
    .from("reactions")
    .insert({
      post_id: threadA.post_id,
      user_id: memberB.id,
      kind: "wow",
    });
  assert.ifError(bannedReactionError);
  pass("banned member can still react");

  await new Promise((resolve) => setTimeout(resolve, 3_200));
  expectOk(
    await memberB.client.from("posts").insert({
      thread_id: threadB.thread_id,
      author_id: memberB.id,
      content: "<p>Post after expiry</p>",
    }).select("id").single(),
    "ban expiry is enforced without a cron",
  );

  const { data: myBans, error: myBansError } = await memberB.client.rpc(
    "my_bans",
  );
  assert.ifError(myBansError);
  assert(myBans.some((row) => row.reason === "Short test ban"));
  assert(myBans.every((row) => row.user_id === memberB.id));
  assert(
    myBans.every(
      (row) =>
        !Object.prototype.hasOwnProperty.call(row, "banned_by") &&
        !Object.prototype.hasOwnProperty.call(row, "banned_by_username"),
    ),
  );
  if (myBans[0]) {
    assert.deepEqual(
      Object.keys(myBans[0]).sort(),
      [
        "created_at",
        "expires_at",
        "id",
        "lift_reason",
        "lifted_at",
        "reason",
        "user_id",
      ],
      "my_bans exposes exactly the safe columns",
    );
  }

  // A member never sees another member's ban rows through the function.
  const { data: memberAOwnBans } = await memberA.client.rpc("my_bans");
  assert(
    (memberAOwnBans ?? []).every((row) => row.user_id === memberA.id),
    "member A only sees their own bans",
  );

  // Anonymous callers cannot execute either function.
  expectError(
    await anonClient.rpc("my_bans"),
    "anonymous caller cannot call my_bans",
  );
  expectError(
    await anonClient.rpc("my_warnings"),
    "anonymous caller cannot call my_warnings",
  );

  // The base tables hide every row from members, so the moderator column is
  // unreachable even when requested explicitly.
  const { data: baseBanRows } = await memberB.client
    .from("member_bans")
    .select("moderator_id");
  assert.equal((baseBanRows ?? []).length, 0);
  const { data: baseWarningRows } = await memberA.client
    .from("member_warnings")
    .select("moderator_id");
  assert.equal((baseWarningRows ?? []).length, 0);
  pass("members cannot read the moderator column by any member-visible path");

  const { data: memberBaseBans } = await memberB.client
    .from("member_bans")
    .select("id");
  assert.equal(memberBaseBans.length, 0);

  const { data: staffBans } = await moderator.client
    .from("member_bans")
    .select("reason, banned_by:profiles!member_bans_banned_by_fkey(username)")
    .eq("user_id", memberB.id);
  assert(staffBans.some((row) => row.reason === "Short test ban"));
  pass("staff keep full base-table access to the issuing-moderator column");

  // The removed views are gone from the API schema cache.
  expectError(
    await memberB.client.from("my_bans").select("*"),
    "the my_bans view no longer exists",
  );
  expectError(
    await memberA.client.from("my_warnings").select("*"),
    "the my_warnings view no longer exists",
  );
  pass("views are gone; member moderation data flows through safe RPC functions");

  expectOk(
    await moderator.client.rpc("moderate_unban_user", {
      p_target_id: memberB.id,
      p_reason: "Clear the short test ban",
    }),
    "moderator unbans a member",
  );

  const unbanAgain = expectOk(
    await moderator.client.rpc("moderate_unban_user", {
      p_target_id: memberB.id,
      p_reason: "Clear the short test ban",
    }),
    "unbanning an unbanned member",
  )[0];
  assert.equal(unbanAgain.changed, false);

  expectOk(
    await admin.client.rpc("moderate_warn_user", {
      p_target_id: memberA.id,
      p_reason: "Phase 2 warning test",
    }),
    "admin warns a member",
  );

  const warnAgain = expectOk(
    await admin.client.rpc("moderate_warn_user", {
      p_target_id: memberA.id,
      p_reason: "Phase 2 warning test",
    }),
    "repeating an unacknowledged warning",
  )[0];
  assert.equal(warnAgain.changed, false);

  const { data: myWarnings, error: myWarningsError } = await memberA.client.rpc(
    "my_warnings",
  );
  assert.ifError(myWarningsError);
  assert(myWarnings.some((row) => row.reason === "Phase 2 warning test"));
  assert(myWarnings.every((row) => row.user_id === memberA.id));
  assert(
    myWarnings.every((row) => !Object.prototype.hasOwnProperty.call(row, "moderator_id")),
    "my_warnings never exposes the moderator id",
  );
  if (myWarnings[0]) {
    assert.deepEqual(
      Object.keys(myWarnings[0]).sort(),
      ["acknowledged_at", "created_at", "id", "reason", "user_id"],
      "my_warnings exposes exactly the safe columns",
    );
  }

  // No member sees another member's warnings through the function.
  const { data: memberBWarnings } = await memberB.client.rpc("my_warnings");
  assert((memberBWarnings ?? []).every((row) => row.user_id === memberB.id));

  const { data: memberBaseWarnings } = await memberA.client
    .from("member_warnings")
    .select("id");
  assert.equal(memberBaseWarnings.length, 0);

  const { data: staffWarnings } = await moderator.client
    .from("member_warnings")
    .select(
      "reason, moderator:profiles!member_warnings_moderator_id_fkey(username)",
    )
    .eq("user_id", memberA.id);
  assert(
    staffWarnings.some(
      (row) => row.moderator?.username === admin.username,
    ),
    "staff still see the issuing moderator through the base table",
  );
  pass("staff still see the issuing moderator through the base table");

  const warningId = myWarnings.find((row) => row.reason === "Phase 2 warning test").id;
  const ack = await memberA.client.rpc("acknowledge_warning", {
    p_warning_id: warningId,
  });
  assert.ifError(ack.error);
  assert.equal(ack.data, true);
  const ackAgain = await memberA.client.rpc("acknowledge_warning", {
    p_warning_id: warningId,
  });
  assert.equal(ackAgain.data, false);
  pass("warnings are visible to the member without moderator identity and can be acknowledged");

  // -------------------------------------------------------------------------
  // Reports: dedup, rate limit, privacy, hierarchy and resolution
  // -------------------------------------------------------------------------
  const reportInsert = async (client, payload) =>
    client.from("reports").insert(payload).select("id").single();

  const firstReport = await reportInsert(memberA.client, {
    reporter_id: memberA.id,
    target_type: "post",
    post_id: commentId,
    target_user_id: null,
    reason: "Report for Phase 2",
    status: "open",
  });
  assert.ifError(firstReport.error);

  const duplicate = await reportInsert(memberA.client, {
    reporter_id: memberA.id,
    target_type: "post",
    post_id: commentId,
    target_user_id: null,
    reason: "Duplicate report",
    status: "open",
  });
  assert(duplicate.error);
  assert.equal(duplicate.error.code, "23505");
  pass("one open report per reporter per target is enforced");

  const userReport = await reportInsert(memberA.client, {
    reporter_id: memberA.id,
    target_type: "user",
    post_id: null,
    target_user_id: memberB.id,
    reason: "User report for Phase 2",
    status: "open",
  });
  assert.ifError(userReport.error);

  // Report rate limit: outsider reports 11 distinct comments.
  const reportThread = await createThread(memberA, `Phase2 report thread ${marker}`);
  const reportCommentIds = [];

  for (let index = 0; index < 11; index += 1) {
    const { data, error } = await adminClient
      .from("posts")
      .insert({
        thread_id: reportThread.thread_id,
        author_id: memberB.id,
        content: `<p>Report target ${index}</p>`,
        is_opening: false,
      })
      .select("id")
      .single();
    assert.ifError(error);
    reportCommentIds.push(data.id);
  }

  for (let index = 0; index < 10; index += 1) {
    const result = await reportInsert(outsider.client, {
      reporter_id: outsider.id,
      target_type: "post",
      post_id: reportCommentIds[index],
      target_user_id: null,
      reason: `Spam target ${index}`,
      status: "open",
    });
    assert.ifError(result.error);
  }

  const rateLimitedReport = await reportInsert(outsider.client, {
    reporter_id: outsider.id,
    target_type: "post",
    post_id: reportCommentIds[10],
    target_user_id: null,
    reason: "Eleventh report",
    status: "open",
  });
  assert(rateLimitedReport.error);
  assert.equal(rateLimitedReport.error.hint, "kaluwo_rate_limited");
  pass("report rate limit rejects the 11th report for a member");

  runSql(
    `update kaluwo_private.rate_limit_buckets set window_start = now() - interval '2 days' where user_id = '${outsider.id}' and action = 'report';`,
  );

  const afterRateReset = await reportInsert(outsider.client, {
    reporter_id: outsider.id,
    target_type: "post",
    post_id: reportCommentIds[10],
    target_user_id: null,
    reason: "Eleventh report after reset",
    status: "open",
  });
  assert.ifError(afterRateReset.error);
  pass("report rate-limit window resets");

  const { data: staffReports } = await moderator.client
    .from("reports")
    .select("id, reporter_id, status");
  assert(staffReports.length >= 12);

  const { data: memberReports } = await memberA.client
    .from("reports")
    .select("id, reporter_id");
  assert(memberReports.every((row) => row.reporter_id === memberA.id));

  const { data: outsiderReports } = await memberB.client
    .from("reports")
    .select("id");
  assert.equal(outsiderReports.length, 0);

  const { data: reporterResolutions } = await memberA.client
    .from("report_resolutions")
    .select("report_id");
  assert.equal(reporterResolutions.length, 0);
  pass("reporters see only their reports and never the resolution table");

  const resolved = await moderator.client.rpc("staff_resolve_report", {
    p_report_id: firstReport.data.id,
    p_status: "resolved",
    p_note: "Handled in Phase 2 test",
  });
  assert.ifError(resolved.error);
  assert.equal(resolved.data[0].changed, true);

  const resolvedAgain = await moderator.client.rpc("staff_resolve_report", {
    p_report_id: firstReport.data.id,
    p_status: "resolved",
    p_note: "Handled in Phase 2 test",
  });
  assert.ifError(resolvedAgain.error);
  assert.equal(resolvedAgain.data[0].changed, false);

  const { data: resolutionRows } = await moderator.client
    .from("report_resolutions")
    .select("report_id, resolution_note, mod_log_id")
    .eq("report_id", firstReport.data.id);
  assert.equal(resolutionRows.length, 1);
  assert.equal(resolutionRows[0].resolution_note, "Handled in Phase 2 test");
  pass("report resolution writes a staff-only resolution row and is idempotent");

  const moderatorPost = await createThread(moderator2, `Phase2 reported moderator ${marker}`);
  const moderatorReport = await reportInsert(memberA.client, {
    reporter_id: memberA.id,
    target_type: "post",
    post_id: moderatorPost.post_id,
    target_user_id: null,
    reason: "Report about a moderator",
    status: "open",
  });
  assert.ifError(moderatorReport.error);

  expectError(
    await moderator.client.rpc("staff_resolve_report", {
      p_report_id: moderatorReport.data.id,
      p_status: "resolved",
      p_note: "Moderator should not resolve this",
    }),
    "only an admin can resolve a report about a moderator",
  );

  expectOk(
    await admin.client.rpc("staff_resolve_report", {
      p_report_id: moderatorReport.data.id,
      p_status: "dismissed",
      p_note: "Admin dismissed the moderator report",
    }),
    "admin can resolve a report about a moderator",
  );

  const ownPost = await createThread(admin, `Phase2 self report ${marker}`);
  const selfReport = await reportInsert(admin.client, {
    reporter_id: admin.id,
    target_type: "post",
    post_id: ownPost.post_id,
    target_user_id: null,
    reason: "Self report for Phase 2",
    status: "open",
  });
  assert.ifError(selfReport.error);

  expectError(
    await admin.client.rpc("staff_resolve_report", {
      p_report_id: selfReport.data.id,
      p_status: "resolved",
      p_note: "Self resolution should fail",
    }),
    "staff cannot resolve a report about their own content",
  );
  pass("report hierarchy and self-resolution rules are enforced");

  // -------------------------------------------------------------------------
  // Invite codes: hashing, one-time plaintext, revoke, idempotency
  // -------------------------------------------------------------------------
  const requestId = randomUUID();
  const created = await admin.client.rpc("admin_create_invite_codes", {
    p_count: 2,
    p_reason: "Phase 2 invite batch",
    p_request_id: requestId,
  });
  assert.ifError(created.error);
  assert.equal(created.data.length, 2);
  const firstCode = created.data[0].code;
  const secondCode = created.data[1];
  assert.equal(
    firstCode,
    created.data[0].code,
  );
  assert.equal(
    created.data[0].code_hash,
    createHash("sha256").update(firstCode).digest("hex"),
  );
  pass("invite codes are generated with plaintext returned once and stored as a hash");

  const repeatCreate = await admin.client.rpc("admin_create_invite_codes", {
    p_count: 2,
    p_reason: "Phase 2 invite batch",
    p_request_id: requestId,
  });
  assert.ifError(repeatCreate.error);
  assert.equal(repeatCreate.data.length, 0);
  pass("invite creation is idempotent per request id");

  const listed = await admin.client.rpc("admin_list_invite_codes", {
    p_limit: 200,
  });
  assert.ifError(listed.error);
  assert(listed.data.some((row) => row.code_hash === secondCode.code_hash));
  assert(!Object.prototype.hasOwnProperty.call(listed.data[0], "code"));

  const memberInviteAttempt = await memberA.client.rpc(
    "admin_list_invite_codes",
    { p_limit: 1 },
  );
  assert(memberInviteAttempt.error);
  pass("invite list is admin-only and never returns plaintext");

  const consumed = await adminClient.rpc("consume_invite_code", {
    p_code: firstCode,
  });
  assert.ifError(consumed.error);
  assert.equal(consumed.data, true);

  const consumedAgain = await adminClient.rpc("consume_invite_code", {
    p_code: firstCode,
  });
  assert.equal(consumedAgain.data, false);

  expectOk(
    await admin.client.rpc("admin_revoke_invite_code", {
      p_code_hash: secondCode.code_hash,
      p_reason: "Phase 2 revoke",
    }),
    "admin revokes an unused invite code",
  );

  const revokedConsume = await adminClient.rpc("consume_invite_code", {
    p_code: secondCode.code,
  });
  assert.equal(revokedConsume.data, false);

  const revokeAgain = await admin.client.rpc("admin_revoke_invite_code", {
    p_code_hash: secondCode.code_hash,
    p_reason: "Phase 2 revoke",
  });
  assert.equal(revokeAgain.data[0].changed, false);
  pass("revoked codes cannot be consumed and revocation is idempotent");

  const noPlainColumn = runSql(
    "select count(*) from information_schema.columns where table_schema='public' and table_name='invite_codes' and column_name='code';",
  );
  assert.equal(noPlainColumn, "0");
  pass("invite_codes has no plaintext code column");

  // -------------------------------------------------------------------------
  // Role changes, demotion immediacy and last-admin protection
  // -------------------------------------------------------------------------
  expectOk(
    await admin.client.rpc("admin_set_role", {
      p_target_id: memberA.id,
      p_role: "moderator",
      p_reason: "Promote for Phase 2 demotion test",
    }),
    "admin promotes a member to moderator",
  );

  expectOk(
    await memberA.client.rpc("moderate_set_thread_locked", {
      p_thread_id: threadB.thread_id,
      p_locked: true,
      p_reason: "New moderator lock test",
    }),
    "new moderator can use staff RPCs",
  );

  expectOk(
    await admin.client.rpc("admin_set_role", {
      p_target_id: memberA.id,
      p_role: "member",
      p_reason: "Demote for Phase 2 demotion test",
    }),
    "admin demotes a moderator",
  );

  expectError(
    await memberA.client.rpc("moderate_set_thread_locked", {
      p_thread_id: threadB.thread_id,
      p_locked: false,
      p_reason: "Demoted moderator should fail",
    }),
    "demoted moderator loses access immediately",
  );
  pass("role changes take effect immediately from live database state");

  const otherAdmins = runSql(
    `select count(*) from public.profiles where role = 'admin' and id not in ('${admin.id}', '${admin2.id}');`,
  );
  assert.equal(
    otherAdmins,
    "0",
    "the last-admin race test requires exactly the two test admins",
  );

  // Two admins race to demote each other. The advisory lock plus a post-lock
  // role check leaves exactly one admin.
  const raceResults = await Promise.allSettled([
    admin.client.rpc("admin_set_role", {
      p_target_id: admin2.id,
      p_role: "member",
      p_reason: "Concurrent last-admin race A",
    }),
    admin2.client.rpc("admin_set_role", {
      p_target_id: admin.id,
      p_role: "member",
      p_reason: "Concurrent last-admin race B",
    }),
  ]);

  const raceErrors = raceResults.filter(
    (result) =>
      result.status === "rejected" ||
      (result.status === "fulfilled" && result.value.error),
  );
  assert(raceErrors.length >= 1, "at least one concurrent demotion must fail");

  const adminCount = runSql(
    `select count(*) from public.profiles where role = 'admin' and id in ('${admin.id}', '${admin2.id}');`,
  );
  assert.equal(adminCount, "1");
  pass("concurrent admin demotions cannot leave zero admins");

  const { data: remainingAdmin } = await adminClient
    .from("profiles")
    .select("id")
    .in("id", [admin.id, admin2.id])
    .eq("role", "admin")
    .single();
  if (remainingAdmin) {
    const remainingClient = remainingAdmin.id === admin.id ? admin.client : admin2.client;
    expectError(
      await remainingClient.rpc("admin_set_role", {
        p_target_id: remainingAdmin.id,
        p_role: "member",
        p_reason: "Last admin self-demotion",
      }),
      "the last admin cannot demote themselves",
    );
  }

  // -------------------------------------------------------------------------
  // Comment pagination beyond the first page and per-page reactions
  // -------------------------------------------------------------------------
  const paginationThread = await createThread(
    memberA,
    `Phase2 pagination thread ${marker}`,
  );

  const { data: bulkComments, error: bulkError } = await adminClient
    .from("posts")
    .insert(
      Array.from({ length: 205 }, (_, index) => ({
        thread_id: paginationThread.thread_id,
        author_id: memberB.id,
        content: `<p>Bulk comment ${index + 1}</p>`,
        is_opening: false,
      })),
    )
    .select("id");

  assert.ifError(bulkError);
  assert.equal(bulkComments.length, 205);
  const lastCommentId = Math.max(...bulkComments.map((row) => row.id));

  const collected = [];
  let commentCursor = null;
  let lastPageIds = [];

  for (let page = 0; page < 10; page += 1) {
    const { data, error } = await memberA.client.rpc("list_thread_comments", {
      p_thread_id: paginationThread.thread_id,
      p_after_at: commentCursor?.at,
      p_after_id: commentCursor?.id,
      p_limit: 50,
    });
    assert.ifError(error);

    if (data.length === 0) {
      break;
    }

    collected.push(...data);
    lastPageIds = data.map((row) => row.id);
    const last = data[data.length - 1];
    commentCursor = { at: last.created_at, id: last.id };

    if (data.some((row) => row.id === lastCommentId)) {
      break;
    }
  }

  assert.equal(collected.length, 205);
  assert.equal(new Set(collected.map((row) => row.id)).size, 205);
  assert(collected.some((row) => row.id === lastCommentId));
  pass("comment pagination loads all 205 comments and the last page target");

  const pageComment = lastPageIds[0];
  const { error: pageReactionError } = await memberA.client
    .from("reactions")
    .insert({
      post_id: pageComment,
      user_id: memberA.id,
      kind: "like",
    });
  assert.ifError(pageReactionError);

  const { data: pageSummary, error: summaryError } = await memberA.client.rpc(
    "post_reaction_summary",
    { p_post_ids: lastPageIds },
  );
  assert.ifError(summaryError);
  const pageLike = pageSummary.find(
    (row) => row.post_id === pageComment && row.kind === "like",
  );
  assert.equal(Number(pageLike.total), 1);
  assert.equal(pageLike.mine, true);
  pass("per-page reaction summary is correct for a later page");

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  await adminClient
    .from("invite_codes")
    .delete()
    .eq("created_request_id", requestId);
  await adminClient.from("threads").delete().like("title", `%${marker}%`);

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
