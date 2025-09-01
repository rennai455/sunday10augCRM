# Security Policy

We take security seriously and appreciate responsible disclosures.

## Reporting a vulnerability

Please report suspected vulnerabilities by opening a private issue or emailing the maintainers.  Provide as much detail as possible so we can reproduce and address the problem quickly.

## Best practices

- Never commit secrets or production data to the repository.
- Rotate credentials regularly and update the values in your Railway environment.
- Run `npm run diagnostics` before deploying to confirm security headers, CORS, and webhook protections are in place.
- Keep dependencies up to date with `npm audit` and periodic upgrades.

Thank you for helping keep the project secure.

