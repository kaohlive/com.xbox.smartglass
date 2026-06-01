# Xbox console companion

Control your Xbox from Homey. Works locally on your home network — no
cloud detour, no third-party servers.

## What you can do

- Turn your Xbox on.
- Turn it off (Xbox One locally; Xbox Series X / S via cloud once signed in).
- Launch an app or game by name (requires Microsoft sign-in).
- Press controller buttons (A, B, X, Y, View, Menu, Nexus, dpad).
- Press media buttons (play, pause, stop, next, previous).
- See which app or game is running, complete with box art.
- Use flow triggers when the console turns on or off, when the playing
  app changes, or when a game starts.

## Getting started

1. Add a new device in Homey and pick "Xbox console". The app finds
   your console on the network automatically. If it doesn't show up,
   you can enter the IP address by hand.
2. Add as many consoles as you want.

## Microsoft sign-in (optional)

Open the app settings and click **Sign in with Microsoft** to link your
Xbox account. This is optional — buttons and media work without it. What
it adds:

- Real game and app names in the device tile.
- Box art that matches whatever you're playing.
- A working **Launch app or game** flow action with a searchable list
  of what's actually installed on the chosen console.
- Remote power off on Xbox Series X / S consoles.
- Cloud fallback when the wake-on-LAN packet can't reach the console
  (different VLAN, changed IP, etc.).

The sign-in opens Microsoft's normal login page in your browser. Two-step
verification works fine.

## Optional: Xbox Live profile tracking

After signing in, the settings page shows a second toggle:
**"Track Xbox Live profile (background polling)"**. Turn it on and the
app starts polling your Xbox Live profile about once a minute, which
unlocks:

- A **Gamerscore** tile on every Xbox device.
- A flow trigger **"Achievement unlocked"** with the game name,
  achievement name, gamerscore awarded, and the achievement art URL.
- A flow trigger **"Friend came online"** with your friend's gamertag,
  display name, and what they're playing.

These two triggers are intentionally not per-device — they fire once for
an event on your account, regardless of how many consoles you've added.

Leave the toggle off and nothing extra runs in the background.

## Good to know

- For "turn on" to work, your Xbox must be set to **Instant On** under
  *Settings → General → Power options*. In Energy Saving mode the console
  doesn't listen for the wake-up.
- Turning the console off on Xbox Series X / S only works when you are
  signed in with Microsoft. Microsoft changed how remote shutdown works
  on those consoles, so the app routes the off command through Xbox Live
  (the same path the official Xbox phone app uses). On the original Xbox
  One the local network still does the job and sign-in is not required.
- **Launching an app or game** also only works after Microsoft sign-in.
  Without it, the dropdown of installed apps is empty.

## Support

Questions, bug reports, or ideas? Use the community topic linked from the
Homey app store listing.

Built on the work of the OpenXbox community.
