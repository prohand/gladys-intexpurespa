# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Added

- Local control of Intex PureSpa Wi-Fi spas (TCP 8990, no Intex account, no cloud): power,
  filtration, heater, bubbles, jets and salt sanitizer (per model), target temperature, water
  temperature and the error code of the control panel.
- Orders expressed as wishes: the spa is read before each toggle, nothing is sent when it is
  already as asked, and switching a function on powers the spa on first.
- Celsius / Fahrenheit detected from the spa, the device following when the panel changes.
- Transport badge (`local` / `unreachable`) and connection status on the Configuration screen,
  with a **Test the connection** button.
- Scene triggers: spa error detected, water temperature reached, spa no longer answers.
- Scene actions: heat the spa to a temperature, read the spa status.
- "Intex spa" dashboard widget: live temperatures, functions, error, and buttons (heater,
  bubbles, filtration, target temperature form).
- English, French, German and Spanish (configuration screen, messages, widget, documentation).
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build), multi-arch image
  build, UI-driven Release workflow and GitHub releases.

[Unreleased]: https://github.com/prohand/gladys-intexpurespa/commits/main
