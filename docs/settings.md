# Settings

Settings is one module with pages inside it, not a row of modules. The sidebar
carries a single **Settings** entry; the module itself lists its pages beside
the open one, the way a workspace's settings read as a place you work in rather
than a folder you keep opening.

## Where the pieces live

- `frontend/src/navigation.js` — the `settings` rail item, and `settingsPages`:
  the pages inside the module, in menu order. Each entry pairs the label `key`
  (a `dashboard.nav` key) with the `segment` it is served at, so a page cannot
  exist in the menu but not in the router, or be labelled differently in each.
- `frontend/src/pages/Settings.svelte` — the shell. Two columns: the page menu,
  then the open page.
- `frontend/src/pages/Profile.svelte`, `frontend/src/pages/Currencies.svelte`,
  `frontend/src/pages/LeaseContractSettings.svelte` — the pages themselves.
- `frontend/src/layouts/AuthenticatedApp.svelte` — `/settings` and
  `/settings/:page` both render the shell, which reads the page segment from
  its route params.
- `frontend/src/components/Sidebar.svelte` — lifts the Settings entry out of
  the module rail (`isSettingsLocation`) and pins it above the footer.
- `frontend/src/styles/design-system.css` — `.app-page:has(> .settings-shell)`
  makes the page a column, which is what lets the open page scroll inside its
  own half while the menu stays put.

## Pages are routes

A page is addressed, not toggled: `/settings/currencies` is a real route, so a
deep link survives a bookmark, a reload and the back button, and the menu row
and the visible page are always the same page. An address that matches no page
is corrected to the first one instead of rendering a page the URL does not name.

Add a page by adding one entry to `settingsPages` and a branch in the shell's
panel. The label comes from `dashboard.nav` — the same place the rail's labels
come from — so it needs a key in `en.js`, `fa.js` and `ps.js`, and nothing else:
the route, the menu row, the active state and the topbar module name all follow
from that one entry.

## The account behind the workspace

`Profile` is the first page and the only one that edits the signed-in user
rather than the workspace:

- `GET /api/auth/me` — the session user, as before.
- `PATCH /api/auth/me` — display name. The account is taken from the session,
  never from the body, so the endpoint can only ever change the caller's record.
- `POST /api/auth/change-password` — replaces the password after proving the
  current one. A wrong current password is a field error (`400`), not a server
  fault, and a password equal to the current one is rejected before any write.

Both write routes resolve the user inside the session's organization
(`findActiveUser({ id, organizationId })`), so a stray id cannot reach another
workspace's user, and both answer with the same user shape as `GET /auth/me`.
