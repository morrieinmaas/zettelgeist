# zettelgeist developer recipes
# run `just` to see available commands

set shell := ["bash", "-cu"]

# Default: show available commands
default:
    @just --list

# Build the toolchain (viewer + cli + mcp-server)
build:
    pnpm install
    pnpm --filter @zettelgeist/viewer build
    pnpm --filter @zettelgeist/cli build
    pnpm --filter @zettelgeist/mcp-server build

# Run all tests + conformance + typecheck
test:
    pnpm -r typecheck
    pnpm -r test
    pnpm conformance

# Launch the demo: builds if needed, serves examples/demo at http://127.0.0.1:7681
demo: build
    cd examples/demo && node ../../packages/cli/dist/bin.js regen
    @echo ""
    @echo "Opening http://127.0.0.1:7681 in your browser..."
    @echo "Press Ctrl+C to stop the server."
    @echo ""
    cd examples/demo && node ../../packages/cli/dist/bin.js serve --port 7681

# Reset the demo to a clean state (clears the regen cache + regenerates INDEX)
demo-reset:
    rm -rf examples/demo/.zettelgeist/regen-cache.json
    rm -f examples/demo/specs/INDEX.md
    cd examples/demo && node ../../packages/cli/dist/bin.js regen
    @echo "demo reset; INDEX.md regenerated"

# Install the pre-commit hook (one-time setup)
install-hook:
    node packages/cli/dist/bin.js install-hook

# Lint and format passthrough
fmt:
    pnpm -r --if-present run fmt

# Generate an HTML export of the architecture + design docs (demo of export-doc)
export-docs:
    @mkdir -p .zettelgeist/exports
    node packages/cli/dist/bin.js export-doc docs/architecture.md
    node packages/cli/dist/bin.js export-doc docs/design.md
    @ls -la .zettelgeist/exports/
