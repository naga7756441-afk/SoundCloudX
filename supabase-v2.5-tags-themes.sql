-- SoundCloudX: 5 more tags + 5 themes
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.

-- tags
insert into public.shop_items (kind, name, price, data)
select v.kind, v.name, v.price, v.data
from (values
  ('tag', '☠️ No Skip',      8000::bigint, '{"text":"☠️ NO SKIP","color":"#e5e7eb"}'::jsonb),
  ('tag', '🌌 Astral',       15000, '{"text":"🌌 ASTRAL","color":"#818cf8"}'),
  ('tag', '🩸 Underground',  20000, '{"text":"🩸 UNDERGROUND","color":"#dc2626"}'),
  ('tag', '🧠 Big Brain',    25000, '{"text":"🧠 BIG BRAIN","color":"#f472b6"}'),
  ('tag', '🐐 GOAT',         75000, '{"text":"🐐 GOAT","color":"#fbbf24"}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items s where s.kind = 'tag' and s.name = v.name);

-- themes (colors for the app + a moving background)
insert into public.shop_items (kind, name, price, data)
select v.kind, v.name, v.price, v.data
from (values
  ('theme', 'Sunset Drive',  9000::bigint, '{"accent":"#ff6b35","slider":"#ffb347","menu":"#140608","panel":"#1a0a0c","cycle":["#ff6b35","#ff2e63","#ffb347"],"scene":"darkwave"}'::jsonb),
  ('theme', 'Matrix',        10000, '{"accent":"#00ff66","slider":"#00ff66","menu":"#010a03","panel":"#020d05","cycle":["#00ff66","#00b347","#b3ffcc"],"scene":"visualizer"}'),
  ('theme', 'Frozen',        12000, '{"accent":"#7dd3fc","slider":"#e0f2fe","menu":"#06101a","panel":"#081521","cycle":["#e0f2fe","#7dd3fc","#38bdf8"],"scene":"liquid"}'),
  ('theme', 'Vaporwave',     15000, '{"accent":"#ff71ce","slider":"#01cdfe","menu":"#120a1f","panel":"#160d26","cycle":["#ff71ce","#01cdfe","#b967ff"],"scene":"y2k"}'),
  ('theme', 'Royal Purple',  25000, '{"accent":"#a855f7","slider":"#facc15","menu":"#0d0518","panel":"#12081f","cycle":["#a855f7","#7c3aed","#facc15"],"scene":"space"}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items s where s.kind = 'theme' and s.name = v.name);
