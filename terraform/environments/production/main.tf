# =============================================================================
# Open-Inspect - Production Environment
# =============================================================================
# This root module is intentionally split across multiple files to keep each
# concern isolated while preserving stable Terraform addresses.
#
# Files in this directory:
# - locals.tf                    Shared naming/URL/script path locals
# - kv.tf                        Cloudflare KV namespaces
# - d1.tf                        Cloudflare D1 database and migrations
# - workers-*.tf                 Worker builds and deployments by service
# - modal.tf                     Modal infrastructure
