SHELL := /bin/bash
BENCH_PATH ?= .
BENCH_GREP_QUERY ?= TODO
BENCH_FILE_QUERY ?= ts
BENCH_RUNS ?= 5
BENCH_WARMUP ?= 1

.PHONY: help bootstrap install uninstall reinstall doctor bench bench-session bench-mcp

help:
	@echo "native-command-router (ncr)"
	@echo "  make bootstrap   # install bun deps"
	@echo "  make install     # install managed wrappers to ~/.local/bin"
	@echo "  make uninstall   # remove managed wrappers and restore backups"
	@echo "  make reinstall   # uninstall then install"
	@echo "  make doctor      # print router status"
	@echo "  make bench       # run native vs bridge vs fff benchmark"
	@echo "  make bench-session # run backend warm/cold session benchmark"

bootstrap:
	bun install

install:
	bun run scripts/install.ts

uninstall:
	bun run scripts/uninstall.ts

reinstall: uninstall install

doctor:
	bun run scripts/doctor.ts

bench:
	bun run scripts/bench.ts --path "$(BENCH_PATH)" --grep-query "$(BENCH_GREP_QUERY)" --file-query "$(BENCH_FILE_QUERY)" --runs "$(BENCH_RUNS)" --warmup "$(BENCH_WARMUP)"

bench-session:
	bun run scripts/bench-session.ts --path "$(BENCH_PATH)" --tool grep --query "$(BENCH_GREP_QUERY)" --mode warm --iters 20 --max-results 200

bench-mcp: bench-session
