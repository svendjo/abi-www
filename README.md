# abi-www
Website for Balut Eye — **https://baluteye.com**.

Upload a photo of an 8×10 score sheet; the app sends it to `abi-server`, which
reads the handwritten numbers and returns an 8×10 grid that is rendered as a table
(and saved server-side as a CSV). Signed-in members also get **settings** in the 👤 dialog
(kept in the browser, one copy per device, and sent with each read — see abi-server's README).

The server URL lives in `src/config.js`, which picks an environment the way
`abi-server`'s `APP_ENV` does: `npm start` selects `local-dev`
(`http://localhost:8080`) and `npm run build` selects `aws-prod` (the App Runner
URL). `src/App.js` derives every endpoint from that `apiBase` — `READ_URL`,
`RETRY_URL`, `ACCEPT_URL`, `DECLINE_URL`, `SUBMIT_URL` (`/feedback`), `VERIFY_URL`, and the
sign-in trio `REQUEST_CODE_URL` / `VERIFY_CODE_URL` / `PROFILE_URL` — so there is nothing to
edit before a production build. Set `REACT_APP_ENV` to override (e.g. point a local `npm start` at prod).

## Local
Node / npm is already installed through homebrew. Install the website.

`npm install`

Start the website.

`npm start`

Make sure `abi-server` is running on `http://localhost:8080` so uploads work.

## Deployment to AWS
Full end-to-end guide (incl. backend, the one-time S3 + CloudFront setup, and the
`baluteye.com` domain): **[abi-server/DEPLOY.md](../abi-server/DEPLOY.md)**.

The site is served by CloudFront `E2P072IUYX7U7M` at `baluteye.com` and
`www.baluteye.com` (both on the same distribution, no redirect between them).
Deploying doesn't touch DNS or the certificate — it's still just build, sync,
invalidate.

Quick update of an already-set-up site — `./deploy.sh` runs all three steps below.
`npm run build` selects the `aws-prod` entry in `src/config.js`, so the bundle
already points at the deployed `abi-server`.

`npm run build`

Copy it to S3 (sign in first).

`aws s3 sync ./build s3://balut-frontend --delete`

Then create a CloudFront invalidation on `/*` to push the update:

`aws cloudfront create-invalidation --distribution-id E2P072IUYX7U7M --paths "/*"`
