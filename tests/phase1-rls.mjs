/**
 * Phase 1 RLS / PostgREST integration tests.
 *
 * Requires a running local Supabase stack (`npx supabase start`) with the
 * migrations applied. Run:
 *
 *   node tests/phase1-rls.mjs
 *
 * The script creates throwaway auth users, exercises direct PostgREST writes
 * (bypassing the Next.js server actions), checks notification RLS and Realtime,
 * and deletes its own data afterwards.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

const marker = `phase1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = "Test-password-123!";
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds = [];

// GoTrue inserts the auth user before it writes app_metadata, so the invite
// trigger cannot see kaluwo_invite on the INSERT in this local GoTrue version.
// The test temporarily replaces the trigger, creates users and their profiles,
// then restores the exact definition that was live before the test. That way a
// later migration changing the invite gate is never overwritten by a stale
// copy in this file.
let savedAuthTrigger = null;

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

function pass(label) {
  console.log(`PASS  ${label}`);
}

function expectError(result, label) {
  assert(result.error, `${label}: expected an error`);
  pass(label);
  return result.error;
}

async function createUser(key, role, isBanned = false) {
  const email = `${key}-${marker}@example.test`;
  const username = `${key}${marker.replace(/[^a-z0-9]/g, "").slice(-10)}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kaluwo_invite: true },
    user_metadata: { username },
  });

  assert.ifError(error);
  const id = data.user.id;
  createdUserIds.push(id);

  const { error: profileError } = await admin.from("profiles").upsert({
    id,
    username,
    role,
    is_banned: isBanned,
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

  return {
    id,
    email,
    username,
    client,
  };
}

async function accessToken(client) {
  const { data, error } = await client.auth.getSession();
  assert.ifError(error);
  return data.session.access_token;
}

function runSql(sql) {
  const output = execFileSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", sql],
    { encoding: "utf8" },
  );

  return output.trim();
}

async function main() {
  relaxAuthTrigger();

  let alice;
  let bob;
  let banned;
  let newbie;
  let outsider;
  let moderator;

  try {
    alice = await createUser("alice", "member");
    bob = await createUser("bob", "member");
    banned = await createUser("banned", "member", true);
    newbie = await createUser("newbie", "new_member");
    outsider = await createUser("outsider", "member");
    moderator = await createUser("phase1mod", "moderator");
  } finally {
    restoreAuthTrigger();
  }

  pass("created throwaway users and profiles");

  // -------------------------------------------------------------------------
  // Atomic create_thread
  // -------------------------------------------------------------------------
  const threadTitle = `Alice thread ${marker}`;
  const { data: createdData, error: createdError } = await alice.client.rpc(
    "create_thread",
    {
      p_board_id: "general",
      p_title: threadTitle,
      p_content: "<p>Hello <strong>world</strong></p>",
    },
  );

  assert.ifError(createdError);
  const created = createdData[0];
  assert(created.thread_id > 0);
  assert(created.post_id > 0);

  const { data: openingPosts } = await alice.client
    .from("posts")
    .select("id, is_opening")
    .eq("thread_id", created.thread_id)
    .eq("is_opening", true);

  assert.equal(openingPosts.length, 1);
  pass("create_thread writes exactly one thread and one opening post");

  // -------------------------------------------------------------------------
  // Comments, reactions and own-content RLS
  // -------------------------------------------------------------------------
  const { data: bobComment, error: bobCommentError } = await bob.client
    .from("posts")
    .insert({
      thread_id: created.thread_id,
      author_id: bob.id,
      content: "<p>Bob reply</p>",
      is_opening: false,
    })
    .select("id")
    .single();

  assert.ifError(bobCommentError);
  pass("another member can comment");

  expectError(
    await alice.client.from("reactions").insert({
      post_id: created.post_id,
      user_id: alice.id,
      kind: "like",
    }),
    "a member cannot react to their own opening post",
  );

  const { error: bobReactionError } = await bob.client.from("reactions").insert({
    post_id: created.post_id,
    user_id: bob.id,
    kind: "like",
  });
  assert.ifError(bobReactionError);

  const { error: aliceReactionError } = await alice.client
    .from("reactions")
    .insert({
      post_id: bobComment.id,
      user_id: alice.id,
      kind: "laugh",
    });
  assert.ifError(aliceReactionError);

  const { error: bannedReactionError } = await banned.client
    .from("reactions")
    .insert({
      post_id: created.post_id,
      user_id: banned.id,
      kind: "wow",
    });
  assert.ifError(bannedReactionError);
  pass("members can react to others' content, and banned members can still react");

  const { data: bobSummary, error: bobSummaryError } = await bob.client.rpc(
    "thread_reaction_summary",
    { p_thread_id: created.thread_id },
  );
  assert.ifError(bobSummaryError);

  const bobOpeningLike = bobSummary.find(
    (row) => row.post_id === created.post_id && row.kind === "like",
  );
  assert.equal(Number(bobOpeningLike.total), 1);
  assert.equal(bobOpeningLike.mine, true);

  const bobOpeningWow = bobSummary.find(
    (row) => row.post_id === created.post_id && row.kind === "wow",
  );
  assert.equal(Number(bobOpeningWow.total), 1);
  assert.equal(bobOpeningWow.mine, false);

  const { data: aliceSummary, error: aliceSummaryError } = await alice.client.rpc(
    "thread_reaction_summary",
    { p_thread_id: created.thread_id },
  );
  assert.ifError(aliceSummaryError);

  const aliceCommentLaugh = aliceSummary.find(
    (row) => row.post_id === bobComment.id && row.kind === "laugh",
  );
  assert.equal(Number(aliceCommentLaugh.total), 1);
  assert.equal(aliceCommentLaugh.mine, true);

  const aliceOpeningLike = aliceSummary.find(
    (row) => row.post_id === created.post_id && row.kind === "like",
  );
  assert.equal(aliceOpeningLike.mine, false);
  pass("thread_reaction_summary returns totals and the viewer's own reaction");

  // -------------------------------------------------------------------------
  // Banned members cannot post
  // -------------------------------------------------------------------------
  expectError(
    await banned.client.from("threads").insert({
      board_id: "general",
      author_id: banned.id,
      title: `Banned thread ${marker}`,
    }),
    "a banned member cannot insert a thread",
  );

  expectError(
    await banned.client.from("posts").insert({
      thread_id: created.thread_id,
      author_id: banned.id,
      content: "<p>Banned reply</p>",
    }),
    "a banned member cannot insert a comment",
  );

  // -------------------------------------------------------------------------
  // Directly inserted empty thread is hidden and cannot collect comments
  // -------------------------------------------------------------------------
  const { data: emptyThread, error: emptyThreadError } = await alice.client
    .from("threads")
    .insert({
      board_id: "general",
      author_id: alice.id,
      title: `Empty ${marker}`,
    })
    .select("id")
    .single();

  assert.ifError(emptyThreadError);

  const { data: listedThreads } = await alice.client.rpc("list_threads", {
    p_limit: 50,
    p_sort: "latest",
  });

  assert(
    !listedThreads.some((thread) => thread.id === emptyThread.id),
    "list_threads must hide a thread with no opening post",
  );

  expectError(
    await bob.client.from("posts").insert({
      thread_id: emptyThread.id,
      author_id: bob.id,
      content: "<p>Invisible reply</p>",
    }),
    "comments are rejected in a thread with no opening post",
  );
  pass("directly inserted empty thread is hidden and cannot collect comments");

  // A direct opening post in the author's own empty thread is allowed, and the
  // thread becomes visible once it is complete.
  const { error: fillError } = await alice.client.from("posts").insert({
    thread_id: emptyThread.id,
    author_id: alice.id,
    content: "<p>Opening post added later</p>",
    is_opening: true,
  });
  assert.ifError(fillError);

  const { data: listedAgain } = await alice.client.rpc("list_threads", {
    p_limit: 50,
    p_sort: "latest",
  });
  assert(
    listedAgain.some((thread) => thread.id === emptyThread.id),
    "a completed thread must appear in list_threads",
  );

  const { data: bobThreadData, error: bobThreadError } = await bob.client.rpc(
    "create_thread",
    {
      p_board_id: "general",
      p_title: `Bob thread ${marker}`,
      p_content: "<p>Bob's thread</p>",
    },
  );
  assert.ifError(bobThreadError);

  expectError(
    await alice.client.from("posts").insert({
      thread_id: bobThreadData[0].thread_id,
      author_id: alice.id,
      content: "<p>Intruding opening post</p>",
      is_opening: true,
    }),
    "a member cannot insert an opening post into another member's thread",
  );

  // -------------------------------------------------------------------------
  // create_thread rolls back the thread when the opening post is invalid
  // -------------------------------------------------------------------------
  const atomicTitle = `Atomic fail ${marker}`;
  const { error: atomicError } = await alice.client.rpc("create_thread", {
    p_board_id: "general",
    p_title: atomicTitle,
    p_content: "x".repeat(20_001),
  });

  assert(atomicError, "create_thread must reject an oversized opening post");

  const { data: orphanThreads } = await admin
    .from("threads")
    .select("id")
    .eq("title", atomicTitle);

  assert.equal(orphanThreads.length, 0);
  pass("create_thread rolls back the thread when the opening post fails");

  // -------------------------------------------------------------------------
  // Notification RLS, read state and excerpt clearing
  // -------------------------------------------------------------------------
  const { data: aliceNotification, error: aliceNotificationError } = await admin
    .from("notifications")
    .insert({
      user_id: alice.id,
      actor_id: bob.id,
      actor_username: bob.username,
      kind: "reply",
      thread_id: created.thread_id,
      thread_title: threadTitle,
      post_id: bobComment.id,
      excerpt: "Bob reply",
    })
    .select("id")
    .single();

  assert.ifError(aliceNotificationError);

  const { data: bobNotification, error: bobNotificationError } = await admin
    .from("notifications")
    .insert({
      user_id: bob.id,
      actor_id: alice.id,
      actor_username: alice.username,
      kind: "reply",
      thread_id: created.thread_id,
      thread_title: threadTitle,
      post_id: created.post_id,
      excerpt: "Hello world",
    })
    .select("id")
    .single();

  assert.ifError(bobNotificationError);

  const { data: aliceVisible } = await alice.client
    .from("notifications")
    .select("id, user_id")
    .eq("user_id", alice.id);
  assert.equal(aliceVisible.length, 1);
  assert.equal(aliceVisible[0].user_id, alice.id);

  const { data: bobVisible } = await bob.client
    .from("notifications")
    .select("id, user_id")
    .eq("user_id", bob.id);
  assert.equal(bobVisible.length, 1);
  assert.equal(bobVisible[0].user_id, bob.id);

  const { data: outsiderVisible } = await outsider.client
    .from("notifications")
    .select("id");
  assert.equal(outsiderVisible.length, 0);
  pass("notifications are visible only to their recipient");

  const { data: crossUpdate } = await alice.client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", bobNotification.id)
    .select("id");

  assert.equal(crossUpdate.length, 0);

  const { data: ownUpdate } = await alice.client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", aliceNotification.id)
    .select("id, read_at");

  assert.equal(ownUpdate.length, 1);
  assert(ownUpdate[0].read_at);
  pass("a member can mark only their own notification as read");

  // Soft-deleting through the audited moderation RPC still fires the Phase 1
  // excerpt-clearing and reply-count triggers now that direct updates are
  // revoked.
  const { error: softDeleteError } = await moderator.client.rpc(
    "moderate_set_post_deleted",
    {
      p_post_id: bobComment.id,
      p_deleted: true,
      p_reason: "Phase 1 notification cleanup test",
    },
  );

  assert.ifError(softDeleteError);

  const { data: clearedNotification } = await alice.client
    .from("notifications")
    .select("excerpt")
    .eq("id", aliceNotification.id)
    .single();

  assert.equal(clearedNotification.excerpt, "");

  const { data: recountedThread } = await alice.client
    .from("threads")
    .select("reply_count")
    .eq("id", created.thread_id)
    .single();

  assert.equal(recountedThread.reply_count, 0);
  pass("soft-deleting a comment clears notification excerpts and decrements reply_count");

  // -------------------------------------------------------------------------
  // Realtime delivery
  // -------------------------------------------------------------------------
  // `supabase db reset` restarts the Realtime container. Retry a few times so
  // a cold tenant boot does not make the whole suite fail.
  await new Promise((resolve) => setTimeout(resolve, 3_000));

  let realtimeComment = null;
  let realtimeError = null;

  for (let attempt = 0; attempt < 3 && !realtimeComment; attempt += 1) {
    const { data: candidate, error: candidateError } = await bob.client
      .from("posts")
      .insert({
        thread_id: created.thread_id,
        author_id: bob.id,
        content: `<p>Realtime comment ${attempt}</p>`,
        is_opening: false,
      })
      .select("id")
      .single();

    assert.ifError(candidateError);

    const delivered = await new Promise((resolve) => {
      let settled = false;
      const channel = alice.client
        .channel(
          `phase1-realtime-${marker}-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${alice.id}`,
          },
          () => {
            finish(true);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void admin
              .from("notifications")
              .insert({
                user_id: alice.id,
                actor_id: bob.id,
                actor_username: bob.username,
                kind: "reply",
                thread_id: created.thread_id,
                thread_title: threadTitle,
                post_id: candidate.id,
                excerpt: `Realtime comment ${attempt}`,
              })
              .then(({ error }) => {
                if (error) {
                  finish(false, error);
                }
              });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            finish(false, new Error(`Realtime channel status: ${status}`));
          }
        });

      const timer = setTimeout(() => {
        finish(false, new Error("Realtime notification was not delivered within 10s"));
      }, 10_000);

      function finish(ok, error) {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        void alice.client.removeChannel(channel);

        if (ok) {
          resolve(true);
          return;
        }

        realtimeError = error;
        resolve(false);
      }
    });

    if (delivered) {
      realtimeComment = candidate;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  assert(
    realtimeComment,
    `Realtime notification was not delivered after retries: ${realtimeError?.message ?? "unknown"}`,
  );
  pass("Realtime delivers a new notification to the recipient");

  // DELETE events are not covered by RLS. The user_id filter must keep other
  // members' deletes out of this channel; replica identity full makes the
  // user_id available on the old row.
  await new Promise((resolve, reject) => {
    let settled = false;
    let sawForeignDelete = false;
    let ownDeleteSeen = false;
    let foreignCheckDone = false;

    const finish = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      void alice.client.removeChannel(channel);

      if (error) {
        reject(error);
        return;
      }

      try {
        assert.equal(
          sawForeignDelete,
          false,
          "Alice received Bob's DELETE event",
        );
        assert.equal(ownDeleteSeen, true, "Alice did not receive her own DELETE");
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    };

    const channel = alice.client
      .channel(`phase1-realtime-delete-${marker}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${alice.id}`,
        },
        (payload) => {
          const deletedId = payload.old?.id;

          if (deletedId === bobNotification.id) {
            sawForeignDelete = true;
          }

          if (deletedId === aliceNotification.id) {
            ownDeleteSeen = true;

            if (foreignCheckDone) {
              finish();
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void admin
            .from("notifications")
            .delete()
            .eq("id", bobNotification.id)
            .then(({ error }) => {
              if (error) {
                finish(error);
                return;
              }

              // Give a broken filter time to leak Bob's delete.
              setTimeout(() => {
                foreignCheckDone = true;

                if (ownDeleteSeen) {
                  finish();
                  return;
                }

                void admin
                  .from("notifications")
                  .delete()
                  .eq("id", aliceNotification.id)
                  .then(({ error: deleteError }) => {
                    if (deleteError) {
                      finish(deleteError);
                    }
                  });
              }, 2_000);
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          finish(new Error(`Realtime DELETE channel status: ${status}`));
        }
      });

    const timer = setTimeout(() => {
      finish(new Error("Realtime DELETE event was not delivered within 10s"));
    }, 10_000);
  });

  pass("Realtime DELETE filter keeps other members' deletes private");

  // -------------------------------------------------------------------------
  // Rate limits: rejection, hint, and window reset
  // -------------------------------------------------------------------------
  const newbieFirst = await newbie.client
    .from("threads")
    .insert({
      board_id: "general",
      author_id: newbie.id,
      title: `Newbie first ${marker}`,
    })
    .select("id")
    .single();

  assert.ifError(newbieFirst.error);

  const newbieSecond = await newbie.client
    .from("threads")
    .insert({
      board_id: "general",
      author_id: newbie.id,
      title: `Newbie second ${marker}`,
    })
    .select("id");

  assert(newbieSecond.error, "the second new-member thread must be rate limited");
  assert.equal(newbieSecond.error.hint, "kaluwo_rate_limited");
  assert(Number(newbieSecond.error.details) > 0);
  pass("new-member thread limit rejects the second insert with a hint");

  runSql(
    `update kaluwo_private.rate_limit_buckets set window_start = now() - interval '1 day' where user_id = '${newbie.id}' and action = 'thread';`,
  );

  const newbieThird = await newbie.client
    .from("threads")
    .insert({
      board_id: "general",
      author_id: newbie.id,
      title: `Newbie third ${marker}`,
    })
    .select("id")
    .single();

  assert.ifError(newbieThird.error);
  pass("rate-limit counter resets when the window expires");

  // -------------------------------------------------------------------------
  // Search wildcard escaping and cursor pagination
  // -------------------------------------------------------------------------
  const percentTitle = `100% ${marker}`;
  const plainTitle = `100 done ${marker}`;

  const { error: percentError } = await bob.client.rpc("create_thread", {
    p_board_id: "general",
    p_title: percentTitle,
    p_content: "<p>Percent</p>",
  });
  assert.ifError(percentError);

  const { error: plainError } = await bob.client.rpc("create_thread", {
    p_board_id: "general",
    p_title: plainTitle,
    p_content: "<p>Plain</p>",
  });
  assert.ifError(plainError);

  const { data: wildcardResults, error: wildcardError } = await alice.client
    .from("threads")
    .select("title")
    .eq("is_deleted", false)
    .ilike("title", "%\\%%");

  assert.ifError(wildcardError);
  assert(
    wildcardResults.some((row) => row.title === percentTitle),
    "literal % should be found",
  );
  assert(
    !wildcardResults.some((row) => row.title === plainTitle),
    "escaped % must not act as a wildcard",
  );
  pass("LIKE wildcards are escaped");

  const { data: pageOne, error: pageOneError } = await alice.client.rpc(
    "list_threads",
    { p_limit: 1, p_sort: "latest", p_pinned: false },
  );
  assert.ifError(pageOneError);
  assert.equal(pageOne.length, 1);

  const { data: pageTwo, error: pageTwoError } = await alice.client.rpc(
    "list_threads",
    {
      p_limit: 1,
      p_sort: "latest",
      p_before_at: pageOne[0].last_post_at,
      p_before_id: pageOne[0].id,
      p_pinned: false,
    },
  );
  assert.ifError(pageTwoError);
  assert.equal(pageTwo.length, 1);
  assert.notEqual(pageTwo[0].id, pageOne[0].id);
  pass("list_threads cursor pagination returns the next row");

  // -------------------------------------------------------------------------
  // Soft-deleting a thread clears its notification excerpts
  // -------------------------------------------------------------------------
  const { data: realtimeNotification } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", alice.id)
    .eq("post_id", realtimeComment.id)
    .single();

  const { error: threadDeleteError } = await moderator.client.rpc(
    "moderate_set_thread_deleted",
    {
      p_thread_id: created.thread_id,
      p_deleted: true,
      p_reason: "Phase 1 thread notification cleanup test",
    },
  );
  assert.ifError(threadDeleteError);

  const { data: clearedThreadNotification } = await alice.client
    .from("notifications")
    .select("excerpt, thread_title")
    .eq("id", realtimeNotification.id)
    .single();

  assert.equal(clearedThreadNotification.excerpt, "");
  assert.equal(clearedThreadNotification.thread_title, "[deleted thread]");
  pass("soft-deleting a thread clears its notification excerpts and title");

  // -------------------------------------------------------------------------
  // Internal helper is not exposed by PostgREST
  // -------------------------------------------------------------------------
  const token = await accessToken(alice.client);
  const helperResponse = await fetch(
    `${url}/rest/v1/rpc/thread_has_no_posts`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_thread_id: created.thread_id }),
    },
  );

  assert.equal(helperResponse.status, 404);
  pass("internal thread_has_no_posts helper is not exposed by PostgREST");

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  await admin.from("threads").delete().like("title", `%${marker}%`);

  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }

  pass("cleanup complete");
}

main().catch(async (error) => {
  console.error("FAIL ", error);
  try {
    await admin.from("threads").delete().like("title", `%${marker}%`);

    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  } catch {
    // Best effort cleanup.
  }

  process.exitCode = 1;
});
