# zettelgeist developer recipes
# run `just` to see available commands

set shell := ["bash", "-cu"]

# ---------------------------------------------------------------------------
# Default
# ---------------------------------------------------------------------------

# Show available commands
default:
    @just --list

# ---------------------------------------------------------------------------
# Build & test
# ---------------------------------------------------------------------------

# Install deps + build the entire toolchain (viewer, cli, mcp, extension)
build:
    pnpm install
    pnpm --filter @zettelgeist/viewer build
    pnpm --filter @zettelgeist/cli build
    pnpm --filter @zettelgeist/mcp-server build
    pnpm --filter @zettelgeist/vscode-extension build

# Build only the runtime toolchain (skips the extension — fastest path to `just demo`)
build-cli:
    pnpm install
    pnpm --filter @zettelgeist/viewer build
    pnpm --filter @zettelgeist/cli build
    pnpm --filter @zettelgeist/mcp-server build

# Run all checks: typecheck + unit/integration tests + conformance fixtures
test:
    pnpm -r typecheck
    pnpm -r test
    pnpm conformance

# Lint / format passthrough (each package's `fmt` script if present)
fmt:
    pnpm -r --if-present run fmt

# ---------------------------------------------------------------------------
# Demo (examples/demo)
# ---------------------------------------------------------------------------

# Build + serve the bundled demo repo at http://127.0.0.1:7681
demo: build-cli
    cd examples/demo && node ../../packages/cli/dist/bin.js regen
    @echo ""
    @echo "→ Opening http://127.0.0.1:7681"
    @echo "→ Ctrl+C to stop"
    @echo ""
    cd examples/demo && node ../../packages/cli/dist/bin.js serve --port 7681

# Reset the demo to a clean state (clears regen cache + regenerates INDEX)
demo-reset:
    rm -rf examples/demo/.zettelgeist/regen-cache.json
    rm -f examples/demo/specs/INDEX.md
    cd examples/demo && node ../../packages/cli/dist/bin.js regen
    @echo "demo reset; INDEX.md regenerated"

# ---------------------------------------------------------------------------
# VSCode extension
# ---------------------------------------------------------------------------

# Build the VSCode extension (bundles + copies viewer bundle into dist/)
ext:
    pnpm --filter @zettelgeist/viewer build
    pnpm --filter @zettelgeist/vscode-extension build
    @echo ""
    @echo "→ Extension built to packages/vscode-extension/dist/"

# Build the extension and open it in VSCode (press F5 there to launch the Extension Development Host)
ext-dev: ext
    @echo "→ Opening VSCode at packages/vscode-extension/"
    @echo "→ Press F5 in the opened window to launch the Extension Development Host."
    code packages/vscode-extension

# Watch the extension and re-bundle on save (re-press F5 to reload the dev host)
ext-watch:
    @echo "→ Watching extension source. Re-press F5 in the dev host to reload."
    @echo "→ If you change viewer/ code, run \`just ext\` once to refresh the bundle."
    pnpm --filter @zettelgeist/vscode-extension exec node scripts/build.mjs --watch

# Package the extension as a .vsix file (installable with `code --install-extension`)
ext-package: ext
    cd packages/vscode-extension && pnpm exec vsce package --no-dependencies
    @ls -la packages/vscode-extension/*.vsix

# ---------------------------------------------------------------------------
# Repo plumbing
# ---------------------------------------------------------------------------

# Install the pre-commit hook that keeps specs/INDEX.md current on each commit
install-hook:
    node packages/cli/dist/bin.js install-hook

# Render the architecture + design docs to standalone HTML (demo of export-doc)
export-docs:
    @mkdir -p .zettelgeist/exports
    node packages/cli/dist/bin.js export-doc docs/architecture.md
    node packages/cli/dist/bin.js export-doc docs/design.md
    @ls -la .zettelgeist/exports/
