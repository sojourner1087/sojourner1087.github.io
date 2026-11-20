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

The game has its own Hosting config, `firebase.game.json`, and serves files directly from `game/`. From the repository root, log in to the Firebase CLI and set the two variables below to your Firebase project ID and the Hosting site ID intended for the game. The site must exist in that project. To create a new site, run `firebase hosting:sites:create "$GAME_SITE" --project "$GAME_PROJECT"` after setting the variables.

```sh
GAME_PROJECT="your-project-id"
GAME_SITE="your-game-site-id"
firebase login
firebase target:apply hosting space-shooter "$GAME_SITE" --project "$GAME_PROJECT"
firebase deploy --config firebase.game.json --only hosting:space-shooter --project "$GAME_PROJECT"
```

The CLI prints the live URL after deployment. The target mapping is stored in `.firebaserc`. This release uses static Hosting and requires no Functions, Firestore database or billing upgrade. [Firebase Hosting targets](https://firebase.google.com/docs/cli/targets)
