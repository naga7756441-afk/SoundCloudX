// SCX Online — talks to the SoundCloudX Supabase project from the app (main process).
// Every SCX gets its own anonymous account (no e-mail, no password); the database rules
// only let you change your own profile, presence, follows and scores.
const fs = require('fs');

const SUPABASE_URL = process.env.SCX_SUPABASE_URL || 'https://xaaerusswxqldslsoxgu.supabase.co';
const SUPABASE_KEY = process.env.SCX_SUPABASE_KEY || 'sb_publishable_F45j6bCJTurqdoHJmvJgrw_tx493Xsl'; // public key, safe to ship

const NICK_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const okUrl = (v, re) => (typeof v === 'string' && re.test(v) ? v : null);

class ScxOnline {
  constructor(sessionFile) {
    this.file = sessionFile;
    this.s = null;
    this.pending = null;
    try { this.s = JSON.parse(fs.readFileSync(sessionFile, 'utf8')); } catch {}
  }

  saveSession() {
    try { fs.writeFileSync(this.file, JSON.stringify(this.s)); } catch {}
  }

  async auth(path, body) {
    const r = await fetch(SUPABASE_URL + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.msg || j.error_description || j.message || 'Sign-in failed (' + r.status + ')');
      e.status = r.status;
      e.code = j.error_code || j.code;
      throw e;
    }
    return j;
  }

  useSession(j) {
    this.s = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      uid: (j.user && j.user.id) || (this.s && this.s.uid),
    };
    this.saveSession();
  }

  async session() {
    if (this.s && this.s.access_token && this.s.expires_at - 60 > Date.now() / 1000) return this.s;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (this.s && this.s.refresh_token) {
        try {
          this.useSession(await this.auth('token?grant_type=refresh_token', { refresh_token: this.s.refresh_token }));
          return this.s;
        } catch (e) {
          // only start over when the server says the old login is gone — never on a network hiccup
          if (!(e.status >= 400 && e.status < 500)) throw e;
        }
      }
      try {
        this.useSession(await this.auth('signup', { data: {} }));
      } catch (e) {
        if (/anonymous/i.test(e.message)) throw new Error('Turn on "Allow anonymous sign-ins" in Supabase → Authentication');
        throw e;
      }
      return this.s;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  }

  async rest(method, query, body, prefer) {
    const s = await this.session();
    const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + query, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch {}
    if (!r.ok) {
      const e = new Error((j && (j.message || j.hint)) || 'Server error ' + r.status);
      e.code = j && j.code;
      e.status = r.status;
      throw e;
    }
    return j;
  }

  // a SCX nick or a SoundCloud link → profile
  async findUser(who) {
    who = String(who || '').trim();
    let q;
    if (/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i.test(who)) {
      const name = who.replace(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i, '').split(/[/?#]/)[0].toLowerCase();
      if (!/^[a-z0-9_-]{1,60}$/.test(name)) throw new Error('That SoundCloud link looks wrong');
      q = `sc_url=eq.${encodeURIComponent('https://soundcloud.com/' + name)}`;
    } else if (NICK_RE.test(who)) q = `nick=eq.${encodeURIComponent(who)}`;
    else throw new Error('Write a SCX nick or a SoundCloud profile link');
    const r = await this.rest('GET', `profiles?${q}&select=id,nick,balance`);
    if (!r || !r[0]) throw new Error('No SCX user with that nick / link');
    return r[0];
  }

  // ------------------------------------------------------------ requests from the app
  async handle(req) {
    const me = (await this.session()).uid;
    const id = typeof req.id === 'string' && UUID_RE.test(req.id) ? req.id : null;
    const sinceIso = () => new Date(Date.now() - 150 * 1000).toISOString();

    switch (req.op) {
      case 'init': {
        const rows = await this.rest('GET', `profiles?id=eq.${me}&select=*`);
        return { uid: me, profile: (rows && rows[0]) || null };
      }

      case 'saveProfile': {
        const nick = String(req.nick || '').trim();
        if (!NICK_RE.test(nick)) throw new Error('Nick: 3–20 letters, numbers, _ . -');
        const row = {
          id: me,
          nick,
          avatar: okUrl(req.avatar, /^https:\/\/[a-z0-9.-]*sndcdn\.com\/[^\s"'<>]{1,400}$/i),
          sc_url: okUrl(String(req.sc_url || '').toLowerCase(), /^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,60}$/),
          bio: clip(req.bio, 120),
          scx_version: clip(req.version, 20),
        };
        try {
          const r = await this.rest('POST', 'profiles?on_conflict=id', [row], 'resolution=merge-duplicates,return=representation');
          return r && r[0];
        } catch (e) {
          if (e.code === '23505') throw new Error(/sc_url/.test(e.message) ? 'This SoundCloud link is already used by another SCX profile' : 'This nick is already taken');
          throw e;
        }
      }

      case 'sync': {
        const body = {
          coins: Math.max(0, Math.floor(Number(req.coins) || 0)),
          stats: req.stats && typeof req.stats === 'object' ? req.stats : {},
          scx_version: clip(req.version, 20),
        };
        if (JSON.stringify(body.stats).length > 3000) body.stats = {};
        const r = await this.rest('PATCH', `profiles?id=eq.${me}`, body, 'return=representation');
        return r && r[0];
      }

      case 'presence': {
        if (!req.show) {
          await this.rest('DELETE', `presence?user_id=eq.${me}`);
          return true;
        }
        const t = req.track || {};
        const row = {
          user_id: me,
          title: clip(t.title, 200),
          artist: clip(t.artist, 120),
          url: okUrl(t.url, /^https:\/\/soundcloud\.com\/[^\s"'<>]{1,300}$/),
          art: okUrl(t.art, /^https:\/\/[a-z0-9.-]*sndcdn\.com\/[^\s"'<>]{1,400}$/i),
          playing: !!t.playing,
          updated_at: new Date().toISOString(),
        };
        await this.rest('POST', 'presence?on_conflict=user_id', [row], 'resolution=merge-duplicates,return=minimal');
        return true;
      }

      case 'online':
        return this.rest('GET', `presence?select=user_id,title,artist,url,art,playing,updated_at,profiles(id,nick,avatar,balance,tag_text,tag_color,frame)&updated_at=gte.${encodeURIComponent(sinceIso())}&order=updated_at.desc&limit=60`);

      case 'profile': {
        if (!id) throw new Error('Unknown user');
        const [p, st, sc, pr, fo, gi] = await Promise.all([
          this.rest('GET', `profiles?id=eq.${id}&select=*`),
          this.rest('GET', `profile_stats?id=eq.${id}&select=followers,following`),
          this.rest('GET', `scores?user_id=eq.${id}&select=diff,best`),
          this.rest('GET', `presence?user_id=eq.${id}&select=*&updated_at=gte.${encodeURIComponent(sinceIso())}`),
          this.rest('GET', `follows?follower=eq.${me}&following=eq.${id}&select=following`),
          this.rest('GET', `gifts?to_user=eq.${id}&pinned=not.is.null&select=id,name,data,num,pinned,from:profiles!gifts_from_user_fkey(nick)&order=pinned.asc`).catch(() => []),
        ]);
        if (!p || !p[0]) throw new Error('This profile does not exist anymore');
        return {
          profile: p[0],
          followers: (st && st[0] && st[0].followers) || 0,
          following: (st && st[0] && st[0].following) || 0,
          scores: sc || [],
          presence: (pr && pr[0]) || null,
          iFollow: !!(fo && fo.length),
          isMe: id === me,
          gifts: gi || [],
        };
      }

      case 'follow':
        if (!id || id === me) throw new Error('Can\'t follow this user');
        await this.rest('POST', 'follows', [{ follower: me, following: id }], 'resolution=ignore-duplicates,return=minimal');
        return true;

      case 'unfollow':
        if (!id) throw new Error('Unknown user');
        await this.rest('DELETE', `follows?follower=eq.${me}&following=eq.${id}`);
        return true;

      case 'following': {
        const rows = await this.rest('GET', `follows?follower=eq.${me}&select=following,profiles!follows_following_fkey(id,nick,avatar,balance,tag_text,tag_color,frame)&order=created_at.desc&limit=100`);
        const ids = (rows || []).map((r) => r.following).filter((x) => UUID_RE.test(x));
        let pres = [];
        if (ids.length) pres = await this.rest('GET', `presence?user_id=in.(${ids.join(',')})&updated_at=gte.${encodeURIComponent(sinceIso())}&select=user_id,title,artist,playing`);
        const on = new Map((pres || []).map((p) => [p.user_id, p]));
        return (rows || []).filter((r) => r.profiles).map((r) => Object.assign({}, r.profiles, { presence: on.get(r.following) || null }));
      }

      case 'counts': {
        const st = await this.rest('GET', `profile_stats?id=eq.${me}&select=followers,following`);
        return (st && st[0]) || { followers: 0, following: 0 };
      }

      case 'top': {
        if (req.kind === 'coins') return this.rest('GET', 'profiles?select=id,nick,avatar,balance,tag_text,tag_color,frame&order=balance.desc&limit=15');
        const diff = ['easy', 'normal', 'hard'].includes(req.kind) ? req.kind : 'normal';
        const rows = await this.rest('GET', `scores?diff=eq.${diff}&select=best,profiles(id,nick,avatar,balance,tag_text,tag_color,frame)&order=best.desc&limit=15`);
        return (rows || []).filter((r) => r.profiles).map((r) => Object.assign({}, r.profiles, { best: r.best }));
      }

      case 'search': {
        const q = String(req.q || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20);
        if (!q) return [];
        return this.rest('GET', `profiles?nick=ilike.*${q}*&select=id,nick,avatar,balance,tag_text,tag_color,frame&order=balance.desc&limit=20`);
      }

      case 'score': {
        const diff = ['easy', 'normal', 'hard'].includes(req.diff) ? req.diff : null;
        const best = Math.max(0, Math.min(10000000, Math.floor(Number(req.best) || 0)));
        if (!diff || !best) return false;
        await this.rest('POST', 'scores?on_conflict=user_id,diff', [{ user_id: me, diff, best, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal');
        return true;
      }

      // ---------------- SCX badge on SoundCloud profiles
      case 'bySoundCloud': {
        const url = String(req.url || '').toLowerCase();
        if (!/^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,60}$/.test(url)) return null;
        const rows = await this.rest('GET', `profiles?sc_url=eq.${encodeURIComponent(url)}&select=id,nick,avatar,balance,tag_text,tag_color,frame,profile_bg,scx_version,stats`);
        const p = rows && rows[0];
        if (!p) return null;
        const [st, pr, sc, gi] = await Promise.all([
          this.rest('GET', `profile_stats?id=eq.${p.id}&select=followers,following`),
          this.rest('GET', `presence?user_id=eq.${p.id}&select=title,artist,url,art,playing&updated_at=gte.${encodeURIComponent(sinceIso())}`),
          this.rest('GET', `scores?user_id=eq.${p.id}&select=diff,best`),
          this.rest('GET', `gifts?to_user=eq.${p.id}&pinned=not.is.null&select=id,name,data,num,pinned,from:profiles!gifts_from_user_fkey(nick)&order=pinned.asc`).catch(() => []),
        ]);
        return Object.assign(p, {
          gifts: gi || [],
          followers: (st && st[0] && st[0].followers) || 0,
          presence: (pr && pr[0]) || null,
          scores: sc || [],
          isMe: p.id === me,
        });
      }

      // ---------------- shop
      case 'shop': {
        const [items, mine] = await Promise.all([
          this.rest('GET', 'shop_items?select=id,kind,name,price,data,active,supply,sold&order=kind.asc,price.asc'),
          this.rest('GET', `purchases?user_id=eq.${me}&select=item_id`),
        ]);
        return { items: items || [], owned: (mine || []).map((r) => r.item_id) };
      }
      case 'buy':
        return this.rest('POST', 'rpc/scx_buy', { item: Number(req.item) });
      case 'equip':
        await this.rest('POST', 'rpc/scx_equip_tag', { item: req.item == null ? null : Number(req.item) });
        return true;
      case 'equipFrame':
        await this.rest('POST', 'rpc/scx_equip_frame', { item: req.item == null ? null : Number(req.item) });
        return true;
      // ---------------- gifts
      case 'gift':
        if (!id) throw new Error('Pick who gets it');
        return this.rest('POST', 'rpc/scx_gift', { item: Number(req.item), target: id, note: clip(req.note, 200) });
      case 'sendCoins':
        if (!id) throw new Error('Pick who gets it');
        return this.rest('POST', 'rpc/scx_send_coins', { target: id, amount: Math.floor(Number(req.amount) || 0), note: clip(req.note, 200) });
      case 'pinGift':
        await this.rest('POST', 'rpc/scx_pin_gift', { gift: Number(req.gift), slot: req.slot == null ? null : Number(req.slot) });
        return true;
      case 'myGifts':
        return this.rest('GET', `gifts?to_user=eq.${me}&select=id,kind,name,data,num,amount,note,pinned,created_at,from:profiles!gifts_from_user_fkey(id,nick)&order=created_at.desc&limit=100`);
      case 'equipBg':
        await this.rest('POST', 'rpc/scx_equip_profile_bg', { item: req.item == null ? null : Number(req.item) });
        return true;

      // ---------------- messages (global + personal)
      case 'messages': {
        const since = Math.max(0, Math.floor(Number(req.since) || 0));
        return this.rest('GET', `messages?id=gt.${since}&or=(to_user.is.null,to_user.eq.${me})&select=id,to_user,text,kind,created_at&order=id.desc&limit=30`);
      }

      // ---------------- SCX ADMIN (the database checks that you really are admin)
      case 'adminItems':
        return this.rest('GET', 'shop_items?select=*&order=created_at.desc');
      case 'adminAdd': {
        const kind = ['tag', 'image', 'gif', 'theme', 'frame', 'gift'].includes(req.kind) ? req.kind : null;
        if (!kind) throw new Error('Pick a type');
        const name = String(req.name || '').trim().slice(0, 40);
        if (!name) throw new Error('Give it a name');
        const price = Math.max(0, Math.min(100000000, Math.floor(Number(req.price) || 0)));
        const row = { kind, name, price, data: req.data || {} };
        const sup = Math.floor(Number(req.supply) || 0);
        if (kind === 'gift' && sup > 0) row.supply = Math.min(1000000, sup);
        const r = await this.rest('POST', 'shop_items', [row], 'return=representation');
        return r && r[0];
      }
      case 'adminToggle':
        await this.rest('PATCH', `shop_items?id=eq.${Number(req.item)}`, { active: !!req.active });
        return true;
      case 'adminDelete':
        await this.rest('DELETE', `shop_items?id=eq.${Number(req.item)}`);
        return true;
      case 'adminUpload': {
        const mime = String(req.mime || '');
        if (!/^image\/(png|jpe?g|gif|webp)$/.test(mime)) throw new Error('Only pictures and GIFs');
        const buf = Buffer.from(String(req.base64 || ''), 'base64');
        if (buf.length > 25 * 1024 * 1024) throw new Error('Max 25 MB');
        const ext = mime.split('/')[1].replace('jpeg', 'jpg');
        const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
        const s = await this.session();
        const r = await fetch(SUPABASE_URL + '/storage/v1/object/shop/' + name, {
          method: 'POST',
          // file names never repeat → can be cached for a year (saves Supabase traffic)
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': mime, 'x-upsert': 'false', 'cache-control': 'max-age=31536000' },
          body: buf,
        });
        if (!r.ok) throw new Error('Upload failed (' + r.status + ') — are you SCX ADMIN?');
        return SUPABASE_URL + '/storage/v1/object/public/shop/' + name;
      }
      case 'adminFind':
        return this.findUser(req.who);
      case 'adminMessage': {
        const text = String(req.text || '').trim().slice(0, 500);
        if (!text) throw new Error('Write a message');
        let to = null;
        if (req.who) to = (await this.findUser(req.who)).id;
        await this.rest('POST', 'messages', [{ to_user: to, text, from_admin: me }], 'return=minimal');
        return true;
      }
      case 'adminGive': {
        const u = await this.findUser(req.who);
        await this.rest('POST', 'rpc/scx_give', { target: u.id, amount: Math.floor(Number(req.amount) || 0), note: String(req.note || '').slice(0, 500) || null });
        return u;
      }

      default:
        throw new Error('Unknown request');
    }
  }
}

module.exports = { ScxOnline, SUPABASE_URL };
