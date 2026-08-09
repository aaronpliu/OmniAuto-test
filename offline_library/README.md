# offline_library

Version-managed **native test dependency binaries** that are not npm packages
(and therefore never land in `node_modules` via `npm install`).

## applesimutils

`applesimutils` is a **Detox iOS runtime dependency** used for simulator
permissions, biometric and location simulation (`device.setPermissions`,
`device.setBiometricEnrollment`, `device.setLocation`, …).

### Important: it is NOT an npm package

- Distributed as a **Homebrew formula** (`brew tap wix/brew && brew install
  applesimutils`), i.e. a **system-level CLI tool**.
- Detox spawns it via `PATH` at runtime. When tests run through an npm script
  (`npm run test:ios`), `node_modules/.bin` is on `PATH`, so the binary placed
  there is resolvable by Detox.

### Binary & version management

The prebuilt binary lives here and is **version-managed in this folder**:

```
offline_library/applesimutils   # prebuilt Mach-O universal executable (x86_64 + arm64)
```

To bump the version, replace this file with the new prebuilt binary. Nothing
else needs to change — the `postinstall` hook picks it up automatically.

### Automatic linking via `postinstall`

`package.json` declares a `postinstall` hook that symlinks the binary into
`node_modules/.bin/applesimutils`:

```text
postinstall → node -e "<symlink offline_library/applesimutils → node_modules/.bin/applesimutils>"
```

This runs automatically after `npm install` (and on a fresh clone), so a user
who pulls the project and runs `npm install` immediately gets a working
`applesimutils` in `node_modules/.bin` — **no manual step required**.

- If the binary is missing from `offline_library/`, the hook skips linking
  (non-fatal) rather than breaking `npm install`.
- The hook only creates a symlink; it never copies or modifies the source binary.

No standalone install script is needed.
