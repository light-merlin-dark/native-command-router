SHELL := /bin/bash
BENCH_PATH ?= .
BENCH_GREP_QUERY ?= TODO
BENCH_FILE_QUERY ?= ts
BENCH_RUNS ?= 5
BENCH_WARMUP ?= 1

.PHONY: help bootstrap install uninstall reinstall doctor bench bench-session bench-mcp test-conformance plugins bench-perf bench-fast

help:
	@echo "native-command-router (ncr)"
	@echo "  make bootstrap        # install bun deps"
	@echo "  make install          # install managed wrappers to ~/.local/bin"
	@echo "  make uninstall        # remove managed wrappers and restore backups"
	@echo "  make reinstall        # uninstall then install"
	@echo "  make doctor           # print router status"
	@echo "  make bench            # run native vs bridge vs fff benchmark"
	@echo "  make bench-session    # run backend warm/cold session benchmark"
	@echo "  make test-conformance # run conformance test suite"
	@echo "  make plugins          # list registered plugins"
	@echo "  make bench-perf       # run stable profile overhead benchmarks"
	@echo "  make bench-fast       # run fast profile speedup benchmarks"

bootstrap:
	bun install

install:
	bun run src/cli/install.ts

uninstall:
	bun run src/cli/uninstall.ts

reinstall: uninstall install

doctor:
	bun run src/cli/doctor.ts

bench:
	bun run test/bench.ts --path "$(BENCH_PATH)" --grep-query "$(BENCH_GREP_QUERY)" --file-query "$(BENCH_FILE_QUERY)" --runs "$(BENCH_RUNS)" --warmup "$(BENCH_WARMUP)"

bench-session:
	bun run test/bench/session.ts --path "$(BENCH_PATH)" --tool grep --query "$(BENCH_GREP_QUERY)" --mode warm --iters 20 --max-results 200

bench-mcp: bench-session

test-conformance:
	bun run test/conformance.ts

plugins:
	bun run src/cli/plugins.ts list

bench-perf:
	bun run test/bench/perf.ts

bench-fast:
	bun run test/bench/fast-profile.ts
