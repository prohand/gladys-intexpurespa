# Security policy

## Supported versions

Only the latest release of the Intex PureSpa integration receives security
fixes. Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-intexpurespa](https://github.com/prohand/gladys-intexpurespa/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
the Intex Wi-Fi module and its firmware, and the Intex app and cloud.

## Good practices for users

- The Wi-Fi module of the spa accepts commands from anyone on the local network,
  without authentication: this is how Intex designed it. Keep the spa on a
  trusted network (or an IoT VLAN that Gladys can reach), never exposed on the
  Internet (no port forwarding of TCP 8990).
- Keep Gladys and the integration up to date.
