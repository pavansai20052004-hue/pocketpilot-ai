# React / TypeScript demo — User Profile

## Setup and starting failure

Run `npm ci --ignore-scripts` once in `demo/react-broken-app` before an offline event. Then run `npm run demo:reset`, select **React User Profile**, and run:

```powershell
npm test
```

The real Vitest result is one pass and one failure. `UserProfile.tsx:12` renders `user.name` when `user` is null, producing `TypeError: Cannot read properties of null (reading 'name')`. Photograph the block containing `TypeError`, `UserProfile.tsx`, `user`, and `null`.

## Expected repair flow

Expected analysis: nullable loading data is rendered without fallback UI. The one-file patch returns `<h1>Guest</h1>` when user is null. Approval must produce two passing tests. Rollback restores exact bytes and the original TypeError. Reset uses the registered source fixture only.

The starting failure measured about 1.5 seconds through the bounded agent runner. This is backup 1; switching from Python is a single registered selection and is comfortably below 30 seconds.
