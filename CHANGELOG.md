# Changelog

## 2026-11-19

### Fixed

- A new project with a one-word name gets a key from its first three letters, such as PUL for PULSE.
- Ticket pull no longer fails on a task whose stages were saved before the stage order rule.
- Ticket pull accepts epic descriptions longer than 5000 characters.

## 2026-11-18

### Fixed

- Pulling Plane tickets no longer fails on comments, and Plane descriptions are pulled again.

## 2026-11-16

### Changed

- The deploy stage is now violet and the dev stage is now blue, so deploy no longer looks like the green done status.

## 2026-11-04

### Added

- Projects can pull status, title, description and new comments from linked tickets every 5 or 10 minutes.
- The project header shows when tickets were last pulled, with a Pull now button.

### Changed

- Tasks can be created already in progress or done (for example when importing tickets), and epics without specs no longer need spec approval to start tasks.

### Removed

- AI agents can no longer change a project's ticketing settings through MCP.

### Fixed

- An epic without specs no longer shows the spec approval alert or locks its board.

## 2026-11-02

### Changed

- The Docker app keeps its database and uploaded images in the `data/` folder, so removing the container or running `make clean` no longer deletes them.

### Fixed

- The Docker image builds again, and it no longer contains the local database or the `.env` file.

## 2026-10-30

### Changed

- The MCP server is now named `briefline`.
