// Reject recognizable credential material before persisting user instructions/results.
// Not a general PII detector. Do not put personal data or credentials into tasks.
export function assertNoCredentials(value:unknown){const text=JSON.stringify(value);if(/(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|Bearer\s+[a-zA-Z0-9_.+\/-]{16,}|-----BEGIN[^-]*PRIVATE KEY-----)/i.test(text))throw new Error('secret_detected');}
