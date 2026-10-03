// Per-environment frontend config, mirroring abi-server's APP_ENV (local-dev /
// aws-prod) pattern. CRA bakes this in at build time: `npm start` runs with
// NODE_ENV=development (-> local-dev, hits the local server on :8080) and
// `npm run build` runs with NODE_ENV=production (-> aws-prod, hits the ECS Express service).
// Set REACT_APP_ENV to override (e.g. point a local `npm start` at prod).
const ENV =
  process.env.REACT_APP_ENV ||
  (process.env.NODE_ENV === 'production' ? 'aws-prod' : 'local-dev');

const CONFIG = {
  'local-dev': { apiBase: 'http://localhost:8080' },
  // api.baluteye.com is a Route 53 alias to the ECS Express load balancer
  // (abi-server/terraform/domain.tf), so moving the backend again won't touch this.
  'aws-prod': { apiBase: 'https://api.baluteye.com' },
};

if (!CONFIG[ENV]) {
  throw new Error(`Unknown REACT_APP_ENV "${ENV}" (expected local-dev or aws-prod)`);
}

export const APP_ENV = ENV;
export const { apiBase } = CONFIG[ENV];
