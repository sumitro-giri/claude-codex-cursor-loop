// argv[2] === 'clean' emits NO_BLOCKERS, anything else emits an ISSUES review.
// Emits the real cursor-agent --output-format stream-json shape: a nested
// assistant message (message.content is an array of {type:"text"} parts)
// followed by a final result event.
const mode = process.argv[2] ?? 'dirty';
const verdict = mode === 'clean' ? 'NO_BLOCKERS' : 'ISSUES: a bug on line 4';
process.stdout.write(JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: `Review complete. ${verdict}` }] } }) + '\n');
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: `Review complete. ${verdict}` }) + '\n');
