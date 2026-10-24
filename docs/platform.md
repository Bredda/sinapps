# Platform guide for the agent of an app repository

Written for the coding agent that works **inside an app repository** (not this one) and has to make that app ready to run on the platform. It is generic: replace `<app>` with the app's short name (lowercase letters, digits, `-`). The owner of the platform is also the owner of the app.

Source of truth: the `Bredda/platform` repository (private), mainly `docs/context.md`, `docs/app-contract.md` and the runbooks in `docs/runbooks/`. This guide is a digest of them as of **2026-10-23** (decisions of the same day included). If the owner pastes something newer, it wins. If something is missing here, **ask the owner; do not invent a fact about the platform.**

## 1. How to use this document

- Copy it into the app repository (for example `docs/platform.md`) or keep it open while working. Follow the app repository's own `AGENT.md`/`CLAUDE.md` for everything about the app itself (code style, tests, commits, releases). This guide only covers the interface with the platform.
- The platform is being built at the same time as the apps. Each statement below carries a status: **Verified** (observed on the cluster, with the date), **Designed** (decided and written, never run), or **Not decided**. Do not build on a **Designed** or **Not decided** item without saying so in `deploy/PLATFORM.md` (section 7).
- You have **no access to the cluster** and no credentials, and you must not look for any. Your output is files in the app repository plus a list of questions and requests for the owner.

## 2. What the platform is

Shared services on **one personal server** that hosts demo apps. Infrastructure as code, managed with Flux (GitOps): a merge on the platform's `main` is what applies a change. No SLA: a demo environment.

| Fact | Value |
| --- | --- |
| Server | one bare-metal machine at Scaleway, **x86_64** (Intel Xeon D-1531), 32 GB RAM, public IP `51.15.183.92`. Images must be built for **`linux/amd64`**. |
| Cluster | k3s `v1.36.5`, **single node**: no high availability, a node reboot means downtime. Shared by every app and every platform service, so keep resource requests modest. |
| Ingress | Traefik, ingress class `traefik`, ports 80 and 443. **Verified** 2026-10-11: the real client IP reaches the app in `X-Forwarded-For` and `X-Real-Ip`. |
| TLS | cert-manager with Let's Encrypt, HTTP-01, **one certificate per host**, no wildcard. `ClusterIssuer`s: `letsencrypt-staging` and `letsencrypt-prod`. |
| Domain | apps live at **`<app>.demo.bredda.eu`** (DNS record created by the owner, pointing to the server, before the certificate is requested). Platform services use `bredda.eu`. |
| Postgres | one shared PostgreSQL **18.6** (CloudNativePG), **one database and one login role per app**. Not reachable from outside the cluster. |
| Identity | one shared Keycloak 26.8.0 at **`https://auth.bredda.eu`**, **one realm per app**, named after the app. |
| Storage | `local-path` volumes on the node: **reclaim policy `Delete`** (deleting a PVC or a namespace deletes the data), no expansion, **not backed up**. Only Postgres is backed up. Keep state in Postgres, not on volumes. |
| Not provided | no SMTP (Keycloak and the cluster cannot send e-mail), no metrics or logs stack yet (Grafana is planned), no object storage for apps, no HTTP to HTTPS redirect at Traefik, no wildcard certificate. |

## 3. What is verified and what is not

**Verified on the cluster**

- Traefik routes `Ingress` objects of class `traefik`; real client IP preserved (2026-10-11).
- cert-manager issues certificates from both issuers with HTTP-01 for a host that resolves to the server (a `Certificate` object, 2026-10-12, reported by the owner). `auth.bredda.eu` itself has a valid Let's Encrypt certificate.
- Postgres: a database and a role for `experiments` exist, the login works with the role's password, backups and a restore on a copy work (2026-10-12).
- Keycloak: a realm file with `$(env:NAME)` variables is applied by the platform with keycloak-config-cli, can be re-applied, and the realm's public issuer is `https://auth.bredda.eu/realms/<realm>` (2026-10-12, with a sample realm; **no real app has been onboarded yet**).
- **From inside the cluster** (a throwaway pod in its own namespace, reported by the owner on 2026-10-23): `https://auth.bredda.eu/` answers `404` (the `/` is closed on purpose) from `51.15.183.92` with a **valid TLS certificate** (`curl` verification result 0), so the way back to the node's own public address works; `https://openrouter.ai/` and `https://mcp.tavily.com/` answer `200`. Fetching a real realm's discovery document and keys has not been done yet.
- **NetworkPolicy** (listed by the owner with `kubectl get networkpolicy -A`, 2026-10-23): only Flux's three, in `flux-system`. **Nothing restricts traffic to or from an app namespace.** Outbound traffic is not filtered by the host firewall.

**Designed, never run**

- The path that deploys an **app's** chart: a Flux source pointing at the app repository, then a `HelmRelease` (section 6). `sinapps` is the first test of it.
- The `cert-manager.io/cluster-issuer` annotation on an `Ingress` (the standard way). Only explicit `Certificate` objects have been exercised. If the annotation does not produce a certificate, fall back to an explicit `Certificate` in the chart.
- `DATABASE_URL` with `sslmode=require` from an application. The first one to try it reports a trap, see section 4.4.

**Decided by the owner on 2026-10-23**

- **Images on `ghcr.io` are public.** The cluster pulls anonymously: no pull Secret, nothing to configure on the platform. The owner makes the **package** public in the GitHub package settings (a package's visibility is separate from the repository's, and a new package is private by default). A deployment cannot work until that is done: check it before the first rollout, with `docker pull` from a machine that is not logged in to `ghcr.io`.
- **TLS to Postgres is encrypted but not verified.** See section 4.4. The platform provides no CA.

**Not decided**

- Where the app's **own** Secrets (API keys, session secret) are stored. Today: the owner creates them, encrypted, on the platform side. See section 4.6.
- Metrics and log conventions, and any HTTP to HTTPS redirect.
- Postgres **extensions**. The image is the plain CloudNativePG `18.6-system-trixie` one. `pgvector` is **not** included. If the app needs an extension, ask.

## 4. What your app has to provide

### 4.1 Container images

- One `Dockerfile` per deployable component (for instance `api`, `ui`). Multi-stage, small, **non-root user**, no secret baked in, **`linux/amd64`**.
- Configuration **only through environment variables** (and mounted files if really needed). The same image runs locally and in the cluster.
- Listen on a fixed, documented port. Provide a **liveness** and a **readiness** endpoint (HTTP, no authentication, cheap) and say which.
- Respect `SIGTERM` and shut down cleanly (rollouts and node reboots).
- Log to stdout/stderr, one line per event, **never log secrets or tokens**.
- Traefik's default idle timeout is **180 s**: a long-lived response (Server-Sent Events, streaming) that stays silent longer can be cut. Send a heartbeat well under that. (The platform does not plan to change Traefik's timeouts.)
- Images are named `ghcr.io/bredda/<repo>/<component>` (that is what `experiments` does) and **tagged by release version**. The deployment pins a version (and ideally a digest); `latest` is never deployed.

### 4.2 CI

- Build and push the images on a release or a tag, from GitHub Actions. **CI cannot reach the cluster** (its API is closed) and never gets cluster credentials. Deploying is the job of the platform, which pulls.
- Pin the versions of the actions and tools you use (a commit SHA or an exact version).

### 4.3 A Helm chart in the repository

A chart of its own at `deploy/chart/`. It is installed in the namespace `<app>`, which **the platform creates**.

Rules:

- The chart creates **no `Namespace`, no CRD, no cluster-scoped object, and no `Secret`.** It takes the **names** of Secrets as values.
- Everything that varies is a value: image repository and tag per component, host, ingress class, issuer name, Secret names, resources, replicas.
- `resources.requests` and a memory `limits` on every container. Sensible defaults: small requests (tens of millicores, tens to a few hundred MiB), because the node is shared.
- `securityContext`: `runAsNonRoot`, `allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `seccompProfile: RuntimeDefault`.
- Readiness and liveness probes on the endpoints of 4.1.
- Only components that must be public get an `Ingress`; the others stay `ClusterIP`.
- `replicas: 1` by default (single node, shared Postgres connections).

Suggested `values.yaml` skeleton (names are a convention, keep them stable):

```yaml
host: <app>.demo.bredda.eu
ingress:
  className: traefik
  clusterIssuer: letsencrypt-prod      # or letsencrypt-staging to try
  tlsSecretName: <app>-tls
images:
  api: {repository: ghcr.io/bredda/<repo>/api, tag: ""}   # tag required at install
  ui:  {repository: ghcr.io/bredda/<repo>/ui,  tag: ""}
secrets:
  database: <app>-database             # key DATABASE_URL
  oidc: <app>-oidc                     # keys: see 4.5 and 4.6
  extra: <app>-secrets                 # the app's own keys, listed in deploy/PLATFORM.md
oidc:
  issuer: https://auth.bredda.eu/realms/<app>
  clientId: <app>
```

The public `Ingress`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <app>
  annotations:
    cert-manager.io/cluster-issuer: {{ .Values.ingress.clusterIssuer }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  tls:
    - hosts: [{{ .Values.host }}]
      secretName: {{ .Values.ingress.tlsSecretName }}
  rules:
    - host: {{ .Values.host }}
      http:
        paths:
          - {path: /, pathType: Prefix, backend: {service: {name: <app>-ui, port: {number: 80}}}}
```

Behind Traefik, TLS ends at the proxy: the app sees plain HTTP plus `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-For`. Configure the app (or its framework) to **trust those headers from the proxy** so that redirects, cookies (`Secure`) and OIDC redirect URIs use `https://<app>.demo.bredda.eu`. Traefik is not configured to trust forwarded headers from clients, so it replaces them (this is what the platform relies on; spoofing was not tested).

### 4.4 Using Postgres

- The platform provides a Secret named **`<app>-database`** in the app's namespace with the key `DATABASE_URL`:
  `postgresql://<app>:<password>@pg-rw.postgres.svc.cluster.local:5432/<app>?sslmode=require`. Secrets created from 2026-10-12 also carry `username` and `password`; do not rely on them without checking with the owner.
- The role **owns its database only**. No superuser, no `CREATE DATABASE`, no `CREATE ROLE`. Extensions that need superuser cannot be created (see section 3).
- The Postgres is **shared** (apps and Keycloak): keep the connection pool small (PostgreSQL's default is 100 connections in total for everyone; the platform has not changed it; aim at 10 or fewer per app, and ask the owner if you need more).
- **TLS to Postgres: decided on 2026-10-23, encrypted without verification.** In the Secret, `sslmode=require` has the **libpq meaning**: the connection is encrypted and the server certificate is **not** verified. The server certificate is signed by CloudNativePG's own CA, which the platform does **not** distribute, and does not plan to for a demo: Postgres and the app run on the same node, so the traffic never leaves the machine. **The app must ask its driver for exactly that.** Trap, reported by the agent of `sinapps` and tested on their side: node-postgres (`pg`) treats `sslmode=require` as `verify-full`, so every connection fails against that CA. For `pg`, use `sslmode=no-verify` in the connection URL (the app rewrites the URL it reads from `DATABASE_URL`), or `ssl: { rejectUnauthorized: false }`. Other drivers (libpq-based, JDBC) follow the libpq meaning and need no change. Never switch TLS off, and never disable verification for anything other than this connection. If verification is wanted later, it is a platform change (a CA we control, distributed to the namespaces): ask the owner.
- **Migrations** run as a Helm hook `Job` (`helm.sh/hook: pre-install,pre-upgrade`, `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`), using the same image as the app and the same `DATABASE_URL`. A migration must be safe to run twice and must not drop data without the owner's explicit agreement.
- Postgres has continuous backups. A restore brings the whole shared cluster back to a point in time, not one app: design migrations so that rolling forward is always possible.

### 4.5 Authentication with Keycloak

The platform decided: **the app is an OIDC client of its own realm; its backend runs the Authorization Code flow with PKCE and trusts only an issuer URL.** No proxy that injects identity headers.

- Issuer: **`https://auth.bredda.eu/realms/<app>`**. Use OIDC discovery (`/.well-known/openid-configuration` under the issuer) rather than hard-coded endpoints. The issuer string in tokens is exactly that public URL and never changes.
- A **confidential** client `<app>` (client secret, kept by the backend only). PKCE with `S256`. The front end never sees the client secret.
- The backend validates the tokens: signature (keys from the discovery document), `iss`, `aud`/`azp`, expiry. Authorization uses **realm roles** from the token (for instance `<app>-user`); the app denies access without the role it requires.
- Users and registration: **self-registration is off** and there is **no web admin console** (Keycloak is administered by the owner on the command line). The owner creates the users. Do not assume e-mail verification, password reset by e-mail, or an admin UI: no SMTP is configured.
- Call Keycloak from the pods at its **public address** `https://auth.bredda.eu` (the issuer must match). Reaching it from a pod with a valid certificate is **Verified** (2026-10-23, see section 3); an application fetching a real realm's discovery document is not yet.
- `/admin/` and `/realms/master/` are not reachable from outside. Only `/realms/` (other realms), `/resources/` and `/.well-known/` are.

**The realm file**: `deploy/keycloak/<app>-realm.json`, applied by the platform on request (keycloak-config-cli). Rules:

- Realm named `<app>`, enabled, `sslRequired: external`.
- **`bruteForceProtected: true` and `registrationAllowed: false` must be in the file**: the platform does not enforce them.
- **No secret and no environment-specific value in the file.** The client secret and the redirect URIs are variables written **`$(env:NAME)`** (not `${...}`, which Keycloak uses for its own placeholders). Name them with the app, for example `<APP>_CLIENT_SECRET` and `<APP>_REDIRECT_URI`.
- **No development user, no password** in this file. A separate dev realm file for local work lives elsewhere (4.8).
- Re-applying is safe, and removing an entity from the file removes it from Keycloak (only if the tool created it).

Minimal skeleton:

```json
{
  "realm": "<app>",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "bruteForceProtected": true,
  "failureFactor": 5,
  "roles": { "realm": [ { "name": "<app>-user", "description": "May use <app>" } ] },
  "clients": [
    {
      "clientId": "<app>",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "secret": "$(env:<APP>_CLIENT_SECRET)",
      "standardFlowEnabled": true,
      "implicitFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "redirectUris": ["$(env:<APP>_REDIRECT_URI)"],
      "attributes": { "pkce.code.challenge.method": "S256" }
    }
  ]
}
```

A complete worked example is `docs/examples/realm-sample.json` in the platform repository; ask the owner to paste it if needed.

### 4.6 Secrets

- **Never put a secret in the repository** (not even encrypted, unless the owner agrees on a mechanism): no `.env` with real values, no key in CI logs, no client secret in the realm file.
- Document, in `deploy/PLATFORM.md`, **every Secret the app needs**: its name, its keys, what each key is, and how to generate or obtain it (for instance a random 32-byte value for a session secret, or an API key to be created at a provider). The owner creates them, encrypted with SOPS, on the platform side.
- The client secret exists twice with the same value: in the platform's realm variables Secret and in the app's own Secret. Tell the owner both variable and key names.

### 4.7 Health, resources, state

- Stateless pods. Anything that must survive a restart is in Postgres.
- If the app really needs a volume, say so in `deploy/PLATFORM.md` with size and why; remember it is not backed up and is deleted with its namespace.
- No cluster-wide effects: no host ports, no privileged containers, no `hostPath`.

### 4.8 Local development

- Local work must not depend on the platform. Provide a `docker compose` (or equivalent) with a Postgres and a Keycloak, and a **dev realm file** with a dev user, kept apart from `deploy/keycloak/<app>-realm.json` and clearly named as dev only. Pin the image versions there too (Keycloak 26.x, PostgreSQL 18).
- Document in the README how to run the app locally and how to run its tests.

## 5. What you must not do

- No `kubectl`, `helm install`, or any command against the cluster; you have no access and there is none to look for.
- No secret, token, kubeconfig, or private key in the repository, a log, or a commit message.
- No `latest` tag, no unpinned dependency in a Dockerfile base image that you deploy.
- No change to the platform repository from here; ask the owner for platform-side changes.
- Do not weaken the identity setup (no implicit flow, no password grant, no registration, no admin credentials in the app).
- Do not create a `Namespace`, `Secret`, `ClusterRole` or CRD in the chart.
- Do not assume a hostname other than `<app>.demo.bredda.eu`, or a Keycloak URL other than `https://auth.bredda.eu`. **The hostname of Keycloak is permanent**: it is the issuer in every token.

## 6. How the app reaches the cluster (Designed, never run)

Nothing is pushed to the cluster. The platform **pulls**:

1. The owner registers the app in the platform repository: a Flux source (`GitRepository`) pointing at the app repository. If the repository is private, this needs a read-only deploy key, created by the owner; a **public** repository is read over HTTPS without a key.
2. The app repository carries a `HelmRelease` in **`deploy/flux/`** that installs `deploy/chart/` with its values (image tags, host, Secret names). Shape to start from, to be confirmed at the first deployment:

   ```yaml
   apiVersion: helm.toolkit.fluxcd.io/v2
   kind: HelmRelease
   metadata:
     name: <app>
     namespace: <app>
   spec:
     interval: 10m
     chart:
       spec:
         chart: ./deploy/chart
         sourceRef: {kind: GitRepository, name: <app>, namespace: flux-system}
     install: {remediation: {retries: 3}}
     upgrade: {remediation: {retries: 3}}
     values:
       images:
         api: {tag: "1.2.3"}
   ```

3. A release changes the image tags in that `HelmRelease` (for instance in the release pull request). Merging it on the app's default branch is what Flux sees and deploys.

Because this path has never run, expect to adjust it with the owner during the first deployment, and record what changed in `deploy/PLATFORM.md`.

## 7. The handoff file: `deploy/PLATFORM.md`

Create it, keep it current, and treat it as the interface sheet the owner uses to onboard the app. Template:

```markdown
# <app> on the platform

Platform guide version used: 2026-10-23

## Components
| Component | Image | Port | Public? | Liveness | Readiness |
| --- | --- | --- | --- | --- | --- |

## Host and routes
Host: <app>.demo.bredda.eu. Public paths: ...

## Database
Needs: PostgreSQL (version tested: ...). Extensions: none | list. Pool size: ...
Migration command: ...

## Identity
Realm: <app>. Client: <app> (confidential, PKCE S256). Roles: <app>-user, ...
Redirect URIs (production): https://<app>.demo.bredda.eu/...
Variables of the realm file: <APP>_CLIENT_SECRET, <APP>_REDIRECT_URI, ...

## Secrets the app needs (names and keys only, never values)
| Secret name | Key | What it is | How to generate / obtain |
| --- | --- | --- | --- |

## Resources
Requests / limits per component. Volumes: none | size and reason.

## Assumptions on the platform that are not verified
(list everything from section 3 that this app depends on)

## Questions for the owner
```

## 8. Questions to ask the owner early

1. ~~Public or private images?~~ **Decided: public** (2026-10-23). Check that the package is public before the first rollout.
2. Which Postgres extensions does the app need?
3. Is the repository private? (A deploy key is needed for the platform to read it.)
4. Which parts of the app are public, and under which paths?
5. Which API keys or external services does the app use, and who creates the accounts?
6. How are releases cut (tags, a release bot), and where do the image tags get bumped?
7. Does the app need to send e-mail? (Not available today.)

## 9. Ready to dock: checklist

- [ ] Images build for `linux/amd64`, run as non-root, are configured by environment variables, expose health endpoints, and are pushed by CI with release tags.
- [ ] `deploy/chart/` renders with `helm template` and passes `helm lint`; it creates no Namespace, Secret, CRD or cluster-scoped object; every Secret is referenced by name.
- [ ] Public `Ingress` with class `traefik`, the issuer name and the host as values; the app trusts the proxy headers.
- [ ] The migration runs as a pre-install/pre-upgrade hook and is safe to run twice.
- [ ] OIDC: Authorization Code + PKCE, confidential client, issuer `https://auth.bredda.eu/realms/<app>`, tokens validated, roles enforced.
- [ ] `deploy/keycloak/<app>-realm.json` valid JSON, with brute-force on, registration off, no secret, no dev user, variables as `$(env:NAME)`.
- [ ] A dev setup (compose, dev realm) that works without the platform, and a README that says how to run it.
- [ ] `deploy/PLATFORM.md` complete, with the unverified assumptions and the questions listed.
- [ ] Nothing secret in the repository (check the history of the branch too).

## 10. What the platform side does with it (so you know what to supply)

The owner, on the platform side, in this order: creates the DNS record for `<app>.demo.bredda.eu`; creates the app's namespace; creates the Postgres database, role and the `<app>-database` Secret; creates the realm variables Secret and applies your realm file; creates the app's own Secrets from your `deploy/PLATFORM.md`; registers the Flux source of your repository. Then Flux deploys the chart and cert-manager requests the certificate.

When the first deployment happens, report back **exactly** what failed (the command output the owner pastes), and fix it in the repository: the platform is also being debugged through this first app.
