# Route Enrichments through Vercel AI Gateway

All model requests will go through Vercel AI Gateway rather than a provider-specific integration. The user can choose among gateway models such as Anthropic, OpenAI, Z.ai GLM, and hosted Meta models, and each Enrichment records the exact model used. The gateway standardizes access and preserves provider choice, but the application must still respect each selected model's actual text, image, audio, and video capabilities.
