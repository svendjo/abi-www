# abi-www
Website for Balut Eye.

Upload a photo of a 10×8 score sheet; the app sends it to `abi-server`, which
reads the handwritten numbers and returns a 10×8 grid that is rendered as a table
(and saved server-side as a CSV).

The server URLs live in `src/App.js` as `READ_URL` / `ACCEPT_URL` / `DECLINE_URL` /
`SUBMIT_URL` (all default to `http://localhost:8080`). Point them at the deployed
`abi-server` before building for production.

## Local
Node / npm is already installed through homebrew. Install the website.

`npm install`

Start the website.

`npm start`

Make sure `abi-server` is running on `http://localhost:8080` so uploads work.

## Deployment to AWS
Full end-to-end guide (incl. backend and the one-time S3 + CloudFront setup):
**[abi-server/DEPLOY.md](../abi-server/DEPLOY.md)**.

Quick update of an already-set-up site — first point the `*_URL`s in `src/App.js`
at the deployed `abi-server`, then:

`npm run build`

Copy it to S3 (sign in first).

`aws s3 sync ./build s3://balut-frontend --delete`

Then create a CloudFront invalidation on `/*` to push the update:

`aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"`
