# Dead Letter Orbit

Fly a night-mail skiff through eight relay stations. This first release runs entirely in a browser and saves practice records on the device. The design for ranked runs and the public leaderboard is in [the game spec](SPACE_SHOOTER_DESIGN.md).

## Run locally

From the repository root, serve the game directory and open [the local game](http://localhost:8000).

```sh
python3 -m http.server 8000 --directory game
```

Use arrows or WASD to steer and hold Space to fire. On a phone, tap **Launch run** and drag anywhere in the field with one thumb. The mobile gun fires automatically. The pause button, Escape or switching away pauses the wave.

Run the simulation checks with Node 22 or newer.

```sh
node --test tests/simulation.test.mjs
```

## Publish with Firebase Hosting

Push to `space-shooter` to run the simulation tests and deploy to Firebase Hosting. The workflow uses the `FIREBASE_SERVICE_ACCOUNT_SPACE_SHOOTER_6F41C` GitHub Actions secret. For a manual deploy to the configured site, run the following command from the repository root.

```sh
firebase deploy --config firebase.game.json --only hosting:space-shooter --project space-shooter-6f41c
```

Run `firebase login` first if the CLI asks you to sign in. The CLI prints the live URL after deployment. The Hosting target mapping is stored in `.firebaserc`. [Firebase Hosting targets](https://firebase.google.com/docs/cli/targets)
