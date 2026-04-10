SHELL := /bin/bash

.PHONY: help bootstrap install uninstall reinstall doctor bench bench-mcp

help:
	@echo "cmd-bridge"
	@echo "  make bootstrap   # install bun deps"
	@echo "  make install     # install managed wrappers to ~/.local/bin"
	@echo "  make uninstall   # remove managed wrappers and restore backups"
	@echo "  make reinstall   # uninstall then install"
	@echo "  make doctor      # print bridge status"
	@echo "  make bench       # run native vs bridge vs fff benchmark"
	@echo "  make bench-mcp   # run fff warm/cold session benchmark"

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
	bun run scripts/bench.ts --path /Users/merlin/_dev/devh --grep-query TODO --file-query ts --runs 5 --warmup 1

bench-mcp:
	bun run scripts/bench-mcp.ts --path /Users/merlin/_dev/devh --tool grep --query TODO --mode warm --iters 20 --max-results 200
