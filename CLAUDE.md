# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when
working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Intex PureSpa** Wi-Fi spas. It talks
directly to the spa's Wi-Fi module on the LAN (TCP 8990, `transports: ["local"]`): no Intex
account, no cloud. Requires Gladys 5.3+. Scene triggers (error detected, temperature reached,
connection lost), scene actions (heat to, read status) and an "Intex spa" widget. Started from
the official template (GladysAssistant/integration-template-js); workflows mirror
prohand/gladys-devmel.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/spa.test.js                # one file
node --test --test-name-pattern "toggle"    # tests whose name matches
LOG_LEVEL=silent npm test                   # without the integration logs
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, the store checks and a Docker build
on pull requests. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, rolls `CHANGELOG.md`, re-runs Prettier, tags, builds, publishes the
GitHub Release).

## Architecture

```
index.js                   creates the SDK client, registerIntegration(), connect()
src/app.js                 every handler, wired to a context { config, spa }
src/config.js              DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                LANGUAGES (en, fr, de, es), pick(), localize()
src/connection.js          connection status messages + "Test the connection"
src/intex/protocol.js      frames, checksum, status decoding (pure functions)
src/intex/client.js        TCP client: one connection, one request at a time, retries
src/intex/spa.js           SpaController: last status, wishes -> toggles, events
src/devices/index.js       blueprint registry, discovery, transports, poller
src/devices/spa.js         the spa device: features, states, onSetValue, transport
src/capabilities/scenes.js scene triggers (from status transitions) and scene actions
src/capabilities/widget.js dashboard widget content and button actions
test/helpers/fakeSpa.js    a fake Wi-Fi module on 127.0.0.1 (real protocol)
```

### Invariants worth knowing

- **Every command but the target temperature is a TOGGLE.** Never send one without reading
  the status first: `SpaController.setFunction` reads, compares, toggles only when needed, all
  under a lock so two orders cannot both read OFF and flip twice.
- **One TCP client, one request at a time, connection kept open.** The module drops off the
  Wi-Fi when hammered; `client.js` queues requests, retries 3 times, reopens the socket after a
  network error. Polling floor: 30 s.
- **Frames:** request `{"data": <hex+checksum>, "sid": <string>, "type": 1|3}` (no newline);
  answer one JSON line, same `sid`, `type` 2 (status) or 3 (info). Checksum = 0xFF − Σ bytes,
  modulo **0xFF**, 0 written 0xFF. Status bits from the end: power 104, filter 105, heater 106,
  jets 107, bubbles 108, sanitizer 109; water byte at 88 (≥ 181 = error `E<value−100>`);
  target byte at 24 (> 40 means Fahrenheit). Test vectors come from real spas
  (mathieu-mp/aio-intex-spa, MIT).
- **Status → everything.** Every read (poll, order, scene action, test) emits `status`;
  `app.js` publishes the changed states, re-publishes the device on a unit change, fires the
  scene events and nudges the widget. Scene events fire on transitions only, never on the first
  read.
- **A refused order** (panel kept the old state) is published with `publishState`, not
  `publishChangedStates`: Gladys already shows the requested value.
- **External ids are forever.** The device platform id is the constant `purespa` (one spa per
  integration), never the IP (DHCP) nor the module uid (unknown before the first answer).
- **Polling:** `poll_frequency` is `EVERY_30_SECONDS` (ms, a Gladys enum); the configured
  interval in seconds is applied by skipping polls (`createPoller`). An unreachable spa is not
  a failed poll (the badge and the connection status say it).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- Trigger, action, widget, config and feature keys are stored by users: never rename them.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` (config defaults, actions,
5.1 capabilities, `keywords`, categories, `transports: ["local"]`, `gladys_version >=5.3.0`,
every text in en/fr/de/es, store length limits) in sync with the code.

## Rules

- **The container rootfs is read-only.** Write only under `/data` (nothing is written today).
  Never log tokens.
- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading.
- **User-facing text** is `{ en, fr, de, es }` (manifest, messages, widget — built with
  `src/i18n.js` when assembled), and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md` are
  kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English. Tests
  never leave 127.0.0.1.
