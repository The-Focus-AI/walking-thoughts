# Use Clerk for single-user authentication

The application will use its own Clerk application following `/Users/wschenk/The-Focus-AI/standards/best-practices/clerk.md`. Local and preview deployments use a Clerk development instance; production uses live keys, a custom subdomain, origin-locked `authorizedParties`, and an allowlist restricting access to the single intended user. We will not use Clerk Organizations or satellite domains.
