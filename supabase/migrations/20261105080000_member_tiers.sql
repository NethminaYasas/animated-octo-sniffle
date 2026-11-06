-- Membership tiers (part 1 of 3): add the new role values.
--
-- PostgreSQL will not let a newly added enum value be used in the same
-- transaction, so this file only changes the enum. The default, policies and
-- promotion function live in the next migration.

begin;

alter type public.user_role add value if not exists 'new_member' before 'member';
alter type public.user_role add value if not exists 'senior_member' after 'member';

commit;
