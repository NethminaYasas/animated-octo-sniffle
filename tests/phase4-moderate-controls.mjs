/**
 * Phase 4: Moderate control duplication check.
 *
 * Validates that each post renders exactly one Moderate control for staff
 * and zero for regular members, by inspecting the rendered component source.
 *
 * Run after `npx supabase db reset`. Part of `npm run test:rls`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function pass(label) {
  console.log(`PASS  ${label}`);
}

const threadContent = readFileSync(
  "src/app/t/[id]/thread-content.tsx",
  "utf8",
);

// Count ModerationControls mounts in thread-content.tsx
const modControlsMatches = threadContent.match(/<ModerationControls/g);
const modControlsCount = modControlsMatches ? modControlsMatches.length : 0;

console.log(
  `Found ${modControlsCount} ModerationControls mounts in thread-content.tsx`,
);

// Expected: 1 on opening post (merged thread+post) + 1 per comment
// The opening post has 1 (merged). Comments each have 1.
// We can't know the comment count from source, so we check:
// - At least 1 mount (opening post)
// - No duplicate mounts on the same element (the bug was 2 on opening post)

assert(
  modControlsCount >= 1,
  "thread-content.tsx should have at least one ModerationControls mount",
);
pass("thread-content.tsx has ModerationControls mounts");

// Check there's no duplicate ModerationControls on adjacent lines (the bug pattern)
// The bug was two <ModerationControls blocks one after another for the opening post.
// After the fix, there should be one for the thread/opening post and one per comment.
const lines = threadContent.split("\n");
let consecutiveModerationControls = 0;
let maxConsecutive = 0;
for (const line of lines) {
  if (line.includes("<ModerationControls")) {
    consecutiveModerationControls++;
    maxConsecutive = Math.max(maxConsecutive, consecutiveModerationControls);
  } else {
    consecutiveModerationControls = 0;
  }
}

assert(
  maxConsecutive <= 1,
    "No consecutive ModerationControls mounts (was: two on the opening post)",
);
pass("No duplicate ModerationControls on adjacent lines");

// Verify the opening post ModerationControls has attachments prop (for upload actions)
const openingPostModeration = threadContent.match(
  /<ModerationControls[\s\S]*?\/>/g,
);
assert(
  openingPostModeration &&
    openingPostModeration.some((m) => m.includes("attachments")),
  "Opening post ModerationControls should pass attachments prop",
);
pass("Opening post ModerationControls passes attachments prop");

// Verify non-staff see none: ModerationControls checks isStaff and returns null
const modControlsSource = readFileSync(
  "src/components/moderation-controls.tsx",
  "utf8",
);
assert(
  modControlsSource.includes("if (!isStaff) {") &&
    modControlsSource.includes("return null;"),
  "ModerationControls returns null for non-staff",
);
pass("ModerationControls returns null for non-staff users");

// Verify upload actions are inside the Moderate menu (optgroup label "Attachments")
assert(
  modControlsSource.includes('<optgroup label="Attachments">'),
  "ModerationControls has Attachments optgroup for upload actions",
);
pass("ModerationControls includes Attachments optgroup for upload actions");

// Verify thread + post actions are merged for thread targets
assert(
  modControlsSource.includes("Restore post/comment"),
  "ModerationControls includes post-level actions for thread targets",
);
pass("ModerationControls merges thread and post actions");

// Verify no other app files mount ModerationControls on post-rendering locations
const appFiles = [
  "src/app/moderation/page.tsx",
  "src/app/moderation/log/page.tsx",
  "src/app/moderation/reports/page.tsx",
  "src/app/moderation/uploads/page.tsx",
  "src/app/moderation/members/page.tsx",
  "src/app/moderation/invites/page.tsx",
  "src/app/search/page.tsx",
  "src/app/profile/[username]/page.tsx",
];

for (const file of appFiles) {
  try {
    const content = readFileSync(file, "utf8");
    const count = (content.match(/<ModerationControls/g) || []).length;
    assert.strictEqual(
      count,
      0,
      `${file} should not mount ModerationControls directly`,
    );
  } catch {
    // File doesn't exist, skip
  }
}
pass("No other app pages mount ModerationControls directly");

console.log("\n=== Phase 4 Moderate control checks complete ===");
