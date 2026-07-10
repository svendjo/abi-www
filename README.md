# abi-www
Website for Balut Eye.

Upload a photo of a 10×8 score sheet; the app sends it to `abi-server`, which
reads the handwritten numbers and returns a 10×8 grid that is rendered as a table
(and saved server-side as a CSV).

The server URL lives in `src/config.js`, which picks an environment the way
`abi-server`'s `APP_ENV` does: `npm start` selects `local-dev`
(`http://localhost:8080`) and `npm run build` selects `aws-prod` (the App Runner
URL). `src/App.js` derives `READ_URL` / `ACCEPT_URL` / `DECLINE_URL` / `SUBMIT_URL` /
`VERIFY_URL` from that `apiBase`, so there is nothing to edit before a production
build. Set `REACT_APP_ENV` to override (e.g. point a local `npm start` at prod).

## Local
Node / npm is already installed through homebrew. Install the website.

`npm install`

Start the website.

`npm start`

Make sure `abi-server` is running on `http://localhost:8080` so uploads work.

## Deployment to AWS
Full end-to-end guide (incl. backend and the one-time S3 + CloudFront setup):
**[abi-server/DEPLOY.md](../abi-server/DEPLOY.md)**.

Quick update of an already-set-up site — `./deploy.sh` runs all three steps below.
`npm run build` selects the `aws-prod` entry in `src/config.js`, so the bundle
already points at the deployed `abi-server`.

`npm run build`

Copy it to S3 (sign in first).

`aws s3 sync ./build s3://balut-frontend --delete`

Then create a CloudFront invalidation on `/*` to push the update:

`aws cloudfront create-invalidation --distribution-id E2P072IUYX7U7M --paths "/*"`
