# Contributing to Charloom

Start with a small issue or pull request describing the input, desired result and current behavior. Keep changes focused and preserve plain-text output compatibility.

1. Fork and clone the repository.
2. Run `uv sync --locked --extra web`.
3. Add focused tests for behavioral changes. Use synthetic images; do not commit personal photos, credentials or private metadata.
4. Run the checks in the README and review desktop/mobile output when changing the playground.
5. Open a pull request explaining what changed, why and how it was verified.

Use English for code, documentation and public UI. Python formatting is managed by Ruff. Preserve trailing spaces in generated text art. New dependencies should solve a concrete need; the offline engine must not depend on the web extra.

Contributions are licensed under MIT. Only submit assets you have permission to redistribute, and include attribution/licenses when applicable.
