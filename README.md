# abi-www
Website for Balut Eye.

Upload a photo of a 10×8 score sheet; the app sends it to `abi-server`, which
reads the handwritten numbers and returns a 10×8 grid that is rendered as a table
(and saved server-side as a CSV).

The server URL lives in `src/App.js` as `PREDICT_URL` (defaults to
`http://localhost:8080/predict`). Point it at the deployed server before building
for production.

## Local
Node / npm is already installed through homebrew. Install the website.

`npm install`

Start the website.

`npm start`

Make sure `abi-server` is running on `http://localhost:8080` so uploads work.

## Deployment to AWS S3
Build it.

`npm run build`

Copy it to S3. Sign in first.

`aws s3 sync ./build s3://balut-frontend`

Go to CloudFront and create a new invalidation on /* to force it to update the
distribution.
