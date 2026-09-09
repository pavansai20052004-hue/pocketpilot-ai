# Java demo — User Service

## Setup and starting failure

Install Java 17+ and Maven before the event; no server, database, Docker, or network API is used. Run `npm run demo:reset`, select **Java User Service**, then run from `demo/java-broken-app`:

```powershell
mvn -q test
```

The missing repository lookup is dereferenced in `UserService.displayName`. The expected real result contains `NullPointerException`, `UserService.java:12`, `displayName`, and `missingUserUsesFallback`, with one passing test. Photograph those lines.

## Expected repair flow

Expected analysis: the repository may return null and the service does not validate it. The one-file patch returns `"Unknown"` before calling `user.name()`. Real Maven tests must then pass; rollback must restore the exact broken source and the exception.

Reset uses only the registered fixture file. On the release laptop Java 21 and the SHA-512-verified Apache Maven 3.9.16 distribution are installed. The Java scenario completed two deterministic repair/test/rollback cycles with real Maven/JUnit execution and is now `READY`. A real `qwen3-coder:30b` attempt correctly diagnosed the defect and cited the source evidence, but its malformed patch was safely rejected after the one bounded repair attempt; therefore Java remains backup 2 behind the more reliable Python and React flows.
