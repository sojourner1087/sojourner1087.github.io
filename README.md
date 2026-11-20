# Maswany websites

Each site has its own branch and publishing target. Edit and push the site's branch to update it. The Firebase workflows deploy directly from those branches.

| Site | Source branch | Hosting | Address |
| --- | --- | --- | --- |
| Main site | `main` | GitHub Pages | [maswany.com](https://maswany.com) |
| Baa Humbug | `sheep-website` | Firebase project `maswany-sheep` | [sheep.maswany.com](https://sheep.maswany.com) · [Firebase URL](https://maswany-sheep.web.app) |
| Vortex Field | `vortex-flow` | Firebase project `maswany-vortex` | [vortex.maswany.com](https://vortex.maswany.com) · [Firebase URL](https://maswany-vortex.web.app) |
| Little Leap | `jumping-game` | Saved branch | — |

## Update a Firebase site

Switch to the site's branch and pull its latest changes. For example, to update Baa Humbug:

```bash
git switch sheep-website && git pull --ff-only origin sheep-website
```

Edit the site files and preview the same files Firebase will publish. The staging script rebuilds `firebase-public/` from the files listed in `scripts/stage-firebase.sh`. If you add an image, stylesheet, or script, include it there too.

```bash
sh scripts/stage-firebase.sh && python3 -m http.server 8765 --bind 127.0.0.1 --directory firebase-public
```

Open [localhost:8765](http://127.0.0.1:8765/) and use `Ctrl+C` to stop the server. For Vortex, run `node --test tests/vortex-flow.test.cjs` before pushing. Its workflow also runs those tests before deploying.

Stage your changes, commit, and push. For an HTML-only change to the sheep site:

```bash
git add index.html && git commit -m "Update Baa Humbug" && git push origin sheep-website
```

Check the latest run for that branch in [GitHub Actions](https://github.com/sojourner1087/sojourner1087.github.io/actions). A push to `sheep-website` deploys to `maswany-sheep`; a push to `vortex-flow` deploys to `maswany-vortex`. Each site publishes as soon as its own run succeeds.

### Deploy manually

With the Firebase CLI installed and `firebase login` completed, use the line for the site you intend to publish. This deploys your current local files, including any uncommitted edits.

```bash
git switch sheep-website && firebase deploy --only hosting --project maswany-sheep
git switch vortex-flow && firebase deploy --only hosting --project maswany-vortex
```

## Add another site

1. Create a branch from `main` and put the new site's files on it. Choose a branch name, Firebase project ID, and subdomain. Once the site deploys, add it to the table on `main`.
2. Create a Firebase project and use standard Firebase Hosting. Use `firebase.json` and `scripts/stage-firebase.sh` from one of the existing site branches as a starting point. List only the files this site needs in its staging script.
3. Preview locally, then run `firebase deploy --only hosting --project YOUR_PROJECT_ID` from the new branch. Check the project's `web.app` URL.
4. In Firebase Hosting, add the custom domain. In Namecheap's **Advanced DNS** settings for `maswany.com`, add the records Firebase supplies for that subdomain. Quick setup is usually simpler for a new subdomain. Advanced setup supports migrating a live site with minimal downtime. Keep the root domain records in place. [Firebase custom domain guide](https://firebase.google.com/docs/hosting/custom-domain)
5. Use one of the existing `.github/workflows/deploy-*.yml` files as a template. Set the exact branch under `on.push.branches`, the new Firebase project under `projectId`, a matching project-specific concurrency group, and that project's own GitHub Actions secret. To create the secret, run `firebase init hosting:github --project YOUR_PROJECT_ID` in a temporary folder containing a copy of `firebase.json`. Use this GitHub repository and decline the build script and generated live workflow. The CLI saves the credential in GitHub Actions Secrets. Its secret name starts with `FIREBASE_SERVICE_ACCOUNT_`, followed by the project ID in uppercase with hyphens replaced by underscores. [Firebase GitHub integration](https://firebase.google.com/docs/hosting/github-integration)
6. Push the new branch and verify the workflow run and the `web.app` URL. Check the custom domain over HTTPS once Firebase shows it as connected. Custom domain verification can run in parallel with workflow setup.

For a failed deploy, open the failed step in GitHub Actions. If the run succeeds and the `web.app` URL serves the right site, check Firebase's custom domain status and the corresponding Namecheap DNS records.
