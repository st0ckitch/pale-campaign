// Model used for AI grading and the in-exam tutor.
// The user asked for Claude Opus 4.8; the server proxy forwards whatever the
// client sends here, so changing this one constant changes everything.
export const MODEL = 'claude-opus-4-8'

// All AI calls go through the server proxy, which injects the API key.
export const ANTHROPIC_ENDPOINT = '/api/anthropic'
