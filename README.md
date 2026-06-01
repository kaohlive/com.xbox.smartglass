# Xbox console companion

Control your Xbox from Homey. Works locally on your home network — no
cloud detour, no third-party servers.

## What you can do

- Turn your Xbox on.
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

The sign-in opens Microsoft's normal login page in your browser. Two-step
verification works fine.

## Good to know

- For "turn on" to work, your Xbox must be set to **Instant On** under
  *Settings → General → Power options*. In Energy Saving mode the console
  doesn't listen for the wake-up.
- **Turning the console off does not work on Xbox Series X / S.** Microsoft
  changed how remote shutdown works on those consoles and our local
  approach can't reach it anymore. On the original Xbox One it still works.
  *(If you really need remote shutdown on a Series console, you can use
  the official Xbox app on your phone as a workaround.)*
- The **Launch app** flow card is not active yet.

## Support

Questions, bug reports, or ideas? Use the community topic linked from the
Homey app store listing.

Built on the work of the OpenXbox community.
