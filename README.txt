SoundCloudX - SoundCloud app for Windows (v2.1)
===============================================

Build: double-click build.bat  (or in cmd: npm install, then npm run build)
The .exe files appear in the "dist" folder.

Hotkeys
  X + P  - open / close the mini player      (while SoundCloudX or the mini player is active)
  X + O  - show / hide SoundCloudX
  Ctrl + Alt + P / Ctrl + Alt + O - the same, anywhere in Windows
  F11 - full screen, Esc - close the menu

Menu (sections on the left)
  Visual  - Sound Visual (Off / Wave / Ball), colors, sensitivity, Bass glow,
            Next up on the right side, Repost / Like animations
  Player  - Mini Player (Classic / Ball / Wave / Ultra mini), Sound background,
            Player Bar style, Hotkeys
  Sound   - SoundBoost, Download (only when the artist allows it)
  Theme   - 8 animated themes: Dark Wave, Cyberpunk City, Y2K, Liquid Chrome,
            Space / Saturn, Audio Visualizer, Rainy Window, Underground
            Load theme / Save my theme (.scxtheme file with colors + pictures)
            Background: Off / Song cover / Your image / Theme, blur, darkness, glass
            SoundCloudX Menu: color, picture, picture darkness
            App Visual colors
  Discord - Rich Presence, built in (just switch it on)
  Game    - SCX Beat, 3 modes:
              Record    - listen to a song once, SCX writes down every beat, then play it
              Real time - play any song right now, circles follow the beat live
              Make own  - map editor: rewind the song, tap points (F / J / K / Enter),
                          hold SPACE for HOLD circles, snap to beat, undo, test play
            tap circles: A S D W E Q + M1 / M2;  HOLD circles: SPACE only
            beat maps: play / edit / share (.scxmap) / delete / import, auto-record
  Shop    - spend coins: gifts, tags, frames around your profile picture, themes, pictures, GIFs
            Gifts (like Telegram): emoji or picture, 7 rarities - Common, Uncommon, Rare, Epic,
            Legendary, Mythic, Divine; some are limited (#number, "x / 500 left")
            Send to anyone: coins, gifts, tags, frames (+ a message). Pin up to 3 gifts on your profile
            Frames can be a picture / GIF behind or over the profile picture (like Discord)
            Gift packs: open one and get one of the gifts shown on it (chances in %), packs can be sent too
            Gifts and packs you have can be passed to someone else (gifts keep their number)
  Recovery - Online -> Recovery code: save it; on a new PC press "I have a recovery code"
            and your profile (coins, gifts, followers) comes back
            pictures / GIFs: as screen background, menu background or PROFILE background
            frames + profile background are shown in SCX and on your SoundCloud page in SCX
  Admin   - only for SCX ADMIN: add shop items, global / personal messages, give coins
  Online  - SCX Online: profile (nick, SoundCloud picture + link), who is online and
            what they play (Listen too), follow people, leaderboards (coins, SCX Beat), search
  Stats   - coins, today: songs, time in SCX, listening time, likes, reposts,
            top artists, last 7 days, all time

Backgrounds and the menu picture can be GIFs (up to 40 MB).

Coins: song +50, like +50, repost +100, comment +250, follow +500, SCX Beat score / 10,
time in SCX today: 1h +500, 2h +1500, 3h +2500, 4h +3500, 5h +5000, then 5000 + hours x 200.

SCX Online needs the Supabase tables: run supabase-v1.7.sql, supabase-v1.8.sql, supabase-v1.9.sql, supabase-v2.0.sql and supabase-v2.1.sql once (in this order) in Supabase -> SQL Editor.
