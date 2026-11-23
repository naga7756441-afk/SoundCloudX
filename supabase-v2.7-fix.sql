-- SoundCloudX fix: "Could not embed because more than one relationship was found for 'gifts' and 'shop_items'"
-- Supabase → SQL Editor → paste → Run. Safe to run again.
alter table public.gifts drop constraint if exists gifts_variant_fkey;
notify pgrst, 'reload schema';
