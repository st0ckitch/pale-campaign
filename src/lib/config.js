// Model used for AI grading, the tutor, paper scanning and question generation.
// 'claude-opus-4-8' is the Claude Opus 4.8 model ID (verified against the
// current model catalog). The server proxy forwards whatever the client sends
// here, so changing this one constant changes every AI feature at once.
export const MODEL = 'claude-opus-4-8'

// All AI calls go through the server proxy, which injects the API key.
export const ANTHROPIC_ENDPOINT = '/api/anthropic'
