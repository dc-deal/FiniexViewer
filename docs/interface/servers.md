# Servers

The API can stand on more than one installation, and each browser window shows one of them. A
**server** is an address and a token that come as a pair. The word is FiniexTestingIDE's: its document
`server` means exactly this, and `installation` stays its word for what stands behind one.

## The switch

`ServerSwitch.vue` stands in the menu bar, always visible, because which server is on screen must never
be a guess. Its menu lists the servers and leads to the settings.

- **One server per window.** The choice is kept per browser tab (`src/active_server.ts`, on
  `tab_storage.ts`), so a second window is how two servers are compared. A new window starts on the last
  one chosen.
- **Switching reloads the page.** Every store then starts empty, and nothing of one server can stand beside
  the other. A run id means something only on its own system.
- **The contract is per window, by itself.** The window reads one server, so the stamp on its answers is
  that server's, and the existing notice says where it differs from what this viewer mirrors.

## What stays, and what belongs to the server

| Stays across a switch | Belongs to the server |
|---|---|
| `dock` · `places` · the bundle column's layout | `links` · `bars` · `chart` · `runChart` · `panelViews` |

The default server's part stands in `arrangement.v1`, where it always did. Any other's stands under
`arrangement.v1:<host_id>`, in the same shape. `host_id` is the server's own identity from `GET /health`,
and it survives a restart, a redeploy and a new address. A server not identified yet has the id of its
entry instead. FiniexTestingIDE names `/activities` as the way to identify a server that does not answer
contract 48 yet.

An address that answers as another installation than it did starts the window again under the identity
it has now, and the switch says so: the selection kept for the earlier one is not shown as this one's.

## Settings › Servers

`ServersSettings.vue` manages them as a list with a detail.

- **A token can be set and never read back.** It goes straight to the dev server and the browser keeps
  nothing of it. An empty field leaves the token as it is.
- **The default server** comes from the environment: only its name can change, and it cannot be removed.
- **A server's first name** is what its first health check said: `host_name` where it has one, otherwise its
  address and version. The reader can rename it.
- **A tunnel** takes an account, a host, two ports and two files from `.secrets/`. How it runs is in
  [Container Topology](../architecture/container_topology.md).
- **Check connection** reads `/health`, `/caller` and the contract of that server, and shows the grants.

## When there is no connection

The dev proxy answers `502` with `no_connection`, and the client turns it into one error with one sentence:
*No connection to this server: tunnel or host*. From here the two cannot be told apart, so it names neither
as the cause, and it says nothing about what runs behind them.
