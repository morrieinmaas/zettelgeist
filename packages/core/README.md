# @zettelgeist/core

Pure TypeScript implementation of the [Zettelgeist v0.1 format spec](../../spec/zettelgeist-v0.1.md). No I/O dependencies — the filesystem is injected via an `FsReader` interface so the same code runs against disk, in-memory test fixtures, or future remote backends.

## Install

```bash
npm i @zettelgeist/core
```

## What it provides

```ts
import {
  parseFrontmatter, parseTasks,
  loadSpec, loadAllSpecs,
  deriveStatus, buildGraph,
  validateRepo, regenerateIndex,
  loadConfig, runConformance,
} from '@zettelgeist/core';

import type {
  FsReader, Spec, Status, Task, RepoState, ValidationError, Graph,
  ZettelgeistConfig, LoadConfigResult, ConformanceOutput,
} from '@zettelgeist/core';
```

- `parseFrontmatter(raw)` — split a markdown file into YAML frontmatter + body. See spec §5.
- `parseTasks(body)` — extract checklist tasks from a `tasks.md` body. See spec §6.
- `loadSpec(fs, specsDir, name)` — load a single spec folder into a typed `Spec`.
- `loadAllSpecs(fs, specsDir)` — load every spec in the repo.
- `deriveStatus(spec, repoState)` — compute the priority-ordered status. See spec §7.
- `buildGraph(specs)` — build the dependency graph + cycle detection. See spec §8.
- `validateRepo(fs, specsDir)` — run all validators and return structured errors. See spec §11.
- `regenerateIndex(specs, repoState, existingIndex)` — produce the canonical `INDEX.md`. See spec §10.
- `loadConfig(fs)` — parse `.zettelgeist.yaml`. See spec §3.
- `runConformance(fs)` — top-level orchestrator that returns the shape used by the conformance harness.

## Usage with disk

```ts
import { runConformance } from '@zettelgeist/core';
import { makeDiskFsReader } from '@zettelgeist/fs-adapters';

const fs = makeDiskFsReader('/path/to/your/repo');
const result = await runConformance(fs);
console.log(result.statuses.specs);
console.log(result.validation.errors);
```

## Conformance

Any implementation that passes the fixtures at [`spec/conformance/fixtures/`](../../spec/conformance/fixtures/) is a conformant Zettelgeist implementation. This package is the reference TypeScript implementation; ports in other languages are encouraged.

## License

Apache-2.0
