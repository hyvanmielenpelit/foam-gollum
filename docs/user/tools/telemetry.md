# Telemetry

Foam for Gollum sends **error reports only**. It sends no usage data: nothing about which commands you run, which panels you open or how big your workspace is.

## What an error report contains

When something goes wrong inside the extension, Foam for Gollum sends a report to [Sentry](https://sentry.io/). A report contains:

- the type of error, for example `TypeError`;
- the error message and the stack trace, with file and folder paths removed;
- the version of Foam for Gollum;
- the VS Code version, the operating system and the type of VS Code installation (for example desktop, or a remote connection).

The same error is reported once per session, and at most 20 reports are sent per session. A session lasts until you close or reload the VS Code window.

## What is never sent

- Your notes, their titles or any text you typed
- File names, folder paths or wikilink targets
- Your user ID, VS Code's machine ID or session ID, or your IP address
- The messages Foam writes to its own **Foam** output channel
- Anything about how you use Foam

VS Code for the Web sends no reports at all.

## Where reports go

Reports go to Sentry's servers in the European Union, to a project operated by Hyvän mielen pelit ry, the maintainers of Foam for Gollum. Only the maintainers can read them, and they use them only to find and fix bugs.

## Seeing what is sent

VS Code shows the reports for errors it passes to the extension in the **Extension Telemetry** output channel. Errors the extension catches and reports itself are not shown there; they appear in the **Foam** output channel, before paths are removed.

## How to turn it off

Foam for Gollum follows VS Code's telemetry setting. Open Settings, search for `telemetry.telemetryLevel`, and choose:

- `all` or `error`: error reports are sent;
- `crash` or `off`: nothing is sent.

There is no separate Foam setting.

## The command-line tool

The Foam command-line tool (CLI) and its MCP server send nothing.
