-- SoundCloudX v2.3 update: things you bought stay yours even when SCX ADMIN hides them in the Shop
-- Supabase → SQL Editor → New query → paste everything → Run   (needs v1.7 … v2.2 first). Safe to run again.

drop policy if exists "shop: read" on public.shop_items;
create policy "shop: read" on public.shop_items for select using (
  active
  or public.scx_is_admin()
  or exists (select 1 from public.purchases b where b.item_id = shop_items.id and b.user_id = auth.uid())
);
