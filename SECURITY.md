# Security Policy

## Reporting a vulnerability

If you believe you have found a security vulnerability in `@goobits/sitemap`, **please do not open a public GitHub issue**.

Instead, use GitHub's private vulnerability reporting:

1. Open the [Security advisories page](https://github.com/goobits/sitemap/security/advisories) for this repository.
2. Click **Report a vulnerability**.
3. Provide a clear description of the issue, a minimal reproduction, and the package version affected.

You can also email `security@goobits.com` if private GitHub reporting is unavailable to you. Please include "security advisory" in the subject line.

We aim to acknowledge new reports within 5 business days and to ship a fix or mitigation guidance within 30 days, depending on severity.

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 0.x     | :white_check_mark: |

## Scope

In scope:

- Information leakage via the generated `sitemap.xml` (exposing routes that should be `internal` or `hidden`)
- XML-injection risks in `escapeXml` / `buildSitemapXml` / `buildSitemapIndexXml`
- Server-side request forgery (SSRF) in `ops/ping` and `ops/validate` (i.e., bypassing the caller-supplied URL list)
- Path-handling bugs in `toAbsoluteUrl` / `resolveSiteOrigin` that could mis-resolve a URL to an attacker-controlled origin

Out of scope:

- Vulnerabilities in transitive peer dependencies (please report upstream to `@sveltejs/kit`, `typescript`)
- Visibility-policy bugs in consumer code that cause private routes to be tagged `public` in the host's `RouteInventory`
- Issues that require an already-compromised host or already-leaked secret

## Disclosure

After a fix lands, we will publish a GitHub Security Advisory with credit to the reporter (unless anonymity is requested).
