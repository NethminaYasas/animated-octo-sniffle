# kaluwo Phase 4 — Modmail Manual Test Checklist

## Prerequisites
- Local Supabase stack running (`npx supabase start`)
- All migrations applied (`npx supabase db reset`)
- Test users created: member, moderator, admin, banned member, non-banned member

---

## 1. Anonymous Access (All RPCs Rejected)

| # | Test | Expected |
|---|------|----------|
| 1.1 | Call `open_ticket` as anon | Error: not authenticated |
| 1.2 | Call `staff_open_ticket` as anon | Error: not authenticated |
| 1.3 | Call `reply_to_ticket` as anon | Error: not authenticated |
| 1.4 | Call `add_internal_note` as anon | Error: not authenticated |
| 1.5 | Call `assign_ticket` as anon | Error: not authenticated |
| 1.6 | Call `set_ticket_status` as anon | Error: not authenticated |
| 1.7 | Call `set_ticket_priority` as anon | Error: not authenticated |
| 1.8 | Call `escalate_ticket` as anon | Error: not authenticated |
| 1.9 | Call `mute_member` as anon | Error: not authenticated |
| 1.10 | Call `unmute_member` as anon | Error: not authenticated |
| 1.11 | Call `reopen_my_ticket` as anon | Error: not authenticated |
| 1.12 | Call `expire_modmail_tickets` as anon | Error: not authenticated |

---

## 2. Ticket Opening & Safe Views

| # | Test | Expected |
|---|------|----------|
| 2.1 | Member opens question ticket | Success, ticket created |
| 2.2 | Member opens ban_appeal without ban | Error: ban appeals require ban |
| 2.3 | Banned member opens ban_appeal | Success |
| 2.4 | Banned member opens question ticket | Error: banned members can only open ban appeals |
| 2.5 | Member opens 6th non-appeal ticket (cap=5) | Error: too many open tickets |
| 2.6 | `my_tickets()` returns no staff IDs | No assignee_id, opened_by, closed_by, priority |
| 2.7 | `my_messages()` returns sender_kind, not author_id | sender_kind = "member"/"staff", no author_id |
| 2.8 | Member opens ticket about moderator | admin_only = true |

---

## 3. Message & Status Transitions

| # | Test | Expected |
|---|------|----------|
| 3.1 | Staff replies to open ticket | Status: open → pending |
| 3.2 | Member replies to pending ticket | Status: pending → open |
| 3.3 | Staff resolves ticket | Status: resolved |
| 3.4 | Member replies to resolved ticket | Status: resolved → open, reopen_count +1 |
| 3.5 | Member replies again to resolved ticket | Error: already reopened |
| 3.6 | Staff closes ticket | Status: closed |
| 3.7 | Member replies to closed ticket | Error: ticket is closed |
| 3.8 | Staff reopens closed ticket | Status: closed → open, mod-logged |
| 3.9 | Reply rate limit (rapid fire) | Error: rate limited after N messages |

---

## 4. Conflict Rules

| # | Test | Expected |
|---|------|----------|
| 4.1 | Moderator replies to ticket where they are subject_user_id | Error: cannot access |
| 4.2 | Moderator replies to admin_only ticket | Error: admin only |
| 4.3 | Admin replies to admin_only ticket | Success |
| 4.4 | Member sets status on own ticket | Error: cannot act |
| 4.5 | Member assigns ticket | Error: not staff |

---

## 5. Ban Appeals

| # | Test | Expected |
|---|------|----------|
| 5.1 | Non-banned member opens ban appeal | Error: requires ban |
| 5.2 | Banned member opens ban appeal | Success |
| 5.3 | Banned member opens second ban appeal | Error: rate limited (modmail_appeal: 1 per 24h) |
| 5.4 | Banned member replies to own ban appeal | Success |
| 5.5 | Banned member replies to non-appeal ticket | Error: banned |

---

## 6. Mutes

| # | Test | Expected |
|---|------|----------|
| 6.1 | Moderator mutes non-appeal | Success |
| 6.2 | Moderator mutes appeal | Error: only admins |
| 6.3 | Admin mutes appeal | Success |
| 6.4 | Muted member opens non-appeal ticket | Error: muted |
| 6.5 | Muted member (mute_appeals=true) opens ban appeal | Error: muted |
| 6.6 | Admin unmutes member | Success |
| 6.7 | Moderator unmutes member | Error: admin only |
| 6.8 | Unmuted member opens ticket | Success |

---

## 7. Notifications

| # | Test | Expected |
|---|------|----------|
| 7.1 | Staff replies to ticket | Notification created for member |
| 7.2 | Notification has no staff actor_id | actor_id is NULL |
| 7.3 | Multiple replies collapse to one | One unread per (recipient, ticket) |
| 7.4 | Notification kind = modmail_reply | Correct kind |

---

## 8. Internal Notes

| # | Test | Expected |
|---|------|----------|
| 8.1 | Staff adds internal note | Success |
| 8.2 | Member reads messages | Internal notes not visible |
| 8.3 | Staff adds note to own ticket | Error: conflict |
| 8.4 | Staff adds note to ticket about themselves | Error: conflict |

---

## 9. Assignment & Escalation

| # | Test | Expected |
|---|------|----------|
| 9.1 | Admin assigns ticket to moderator | Success |
| 9.2 | Admin assigns ticket to non-staff | Error: assignee must be staff |
| 9.3 | Admin assigns ticket to member_id | Error: conflict |
| 9.4 | Moderator escalates ticket | Error: admin only |
| 9.5 | Admin escalates ticket | Success: admin_only = true |

---

## 10. Retention Cleanup

| # | Test | Expected |
|---|---|----------|
| 10.1 | Service role runs expire_modmail_tickets | Success, deleted count returned |
| 10.2 | Authenticated runs expire_modmail_tickets | Error: not authorized |
| 10.3 | Backdated resolved ticket (100 days) | Deleted by cleanup |
| 10.4 | Backdated ban appeal (400 days) | Deleted by cleanup |
| 10.5 | Recent resolved ticket (10 days) | Not deleted |

---

## 11. Moderate Control (Duplicate Button Fix)

| # | Test | Expected |
|---|------|----------|
| 11.1 | Staff views opening post with attachments | One "Moderate" button only |
| 11.2 | Staff views comment | One "Moderate" button only |
| 11.3 | Member views post | No "Moderate" button |
| 11.4 | Staff opens Moderate menu on opening post | Thread + post + attachment options |
| 11.5 | Staff selects "post:delete" on opening post | Only post deleted, thread visible |
| 11.6 | Staff selects "thread:delete" on opening post | Only thread deleted |

---

## 12. Staff Inbox

| # | Test | Expected |
|---|---|----------|
| 12.1 | Moderator views inbox | Sees tickets not about them |
| 12.2 | Moderator views ticket about themselves | Not visible |
| 12.3 | Moderator views admin_only ticket | Not visible |
| 12.4 | Admin views admin_only ticket | Visible |
| 12.5 | Staff clicks ticket card | Opens staff ticket page (not member page) |

---

## Test Data Setup

Run against a fresh `npx supabase db reset`. Create test users via the admin client:

```js
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data } = await admin.auth.admin.createUser({
  email: "member@test.test",
  password: "Test-password-123!",
  email_confirm: true,
  user_metadata: { username: "member" },
});
// Upsert profile with desired role
await admin.from("profiles").upsert({
  id: data.user.id,
  username: "member",
  role: "member",
  onboarding_completed: true,
});
```
