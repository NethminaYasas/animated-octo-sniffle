-- Phase 3: new enum values for upload moderation and reporting.
--
-- Kept in its own migration so the new values are usable in later files.
-- A new value cannot be referenced in the same transaction that adds it.

alter type public.mod_action add value if not exists 'upload.remove';
alter type public.mod_action add value if not exists 'upload.restore';
alter type public.mod_action add value if not exists 'upload.block_hash';
alter type public.mod_action add value if not exists 'upload.unblock_hash';

alter type public.mod_target_type add value if not exists 'upload';
alter type public.mod_target_type add value if not exists 'upload_hash';

alter type public.report_target_type add value if not exists 'upload';
