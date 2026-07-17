# Use the Focus.AI Vercel application stack

The PWA and authenticated API will use TypeScript and Next.js on Vercel, Neon Postgres for synchronized Thread and processing metadata, private Vercel Blob storage for original media, Clerk for authentication, and Vercel AI Gateway for model access. Device-local data remains authoritative for offline capture until synchronization succeeds. Environment separation, secrets, deployment tasks, and private-blob access will follow `/Users/wschenk/The-Focus-AI/standards/best-practices`.
