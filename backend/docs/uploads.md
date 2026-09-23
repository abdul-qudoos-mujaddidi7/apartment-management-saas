# Uploaded documents

Photographs and identity cards are the only files the app stores today, but the
route and the storage are written to take more.

## Where a file lives

Files are written to `backend/uploads/<folder>/<name>.<ext>`, beside the API and
outside the database. A row keeps only the file's **path**:

```text
Tenant.photoUrl        = /uploads/tenants/photo-mf3k2a-9f21c4d8.jpg
Tenant.idCardFrontUrl  = /uploads/tenants/id-front-mf3k2b-4c7a91e0.png
Tenant.idCardBackUrl   = /uploads/tenants/id-back-mf3k2c-1b0d55ad.webp
```

A path is **always relative to the API's own origin**, never an absolute URL.
The client turns it into a full address with `mediaUrl()` (`src/utils/media.js`),
which is the only place that knows where the API is. That is what lets the same
row stay valid when the app moves from `localhost:3001` to a real host, and it
is why the API refuses to store anything but its own paths:

```js
photoUrl: 'https://somewhere-else.example/x.jpg'   // 422 — not ours
photoUrl: '/uploads/../.env'                       // 422 — not a stored file
```

`Tenant.photoUrl` is `VARCHAR(500)`, so a path that somehow grew past that is
rejected by the database rather than silently truncated.

## The endpoints

| request | does |
| --- | --- |
| `POST /api/uploads?kind=<kind>` | stores one image, field name `file`, answers `{ upload: { url, kind, size, mimeType, maxSize } }` |
| `DELETE /api/uploads` | removes a file by `{ url }` — used to undo an upload that was never attached to a record |
| `GET /uploads/<folder>/<file>` | serves a stored file; long-lived caching, since names are never reused |

Kinds are an allowlist, not a path from the request:

| kind | folder | file prefix |
| --- | --- | --- |
| `tenant-photo` | `tenants` | `photo-` |
| `tenant-id-front` | `tenants` | `id-front-` |
| `tenant-id-back` | `tenants` | `id-back-` |

Rules the API enforces: JPEG, PNG or WebP only; **5 MB** maximum; one file per
request; the stored filename is generated (`prefix-<time36>-<random>.jpg`) and
the extension comes from the mime type, never from the client's filename. The
image is stored as it arrived — there is no resizing or re-encoding, so what a
person uploads is what they get back.

## Lifecycle

* **Uploading** happens when a file is picked, not when the form is saved, so the
  picture is visible immediately. The form only carries the returned path, and
  it will not save while an upload is in flight.
* **Replacing** a document deletes the file it moved away from, once the row no
  longer points at it (`discardReplacedDocuments`). Re-sending an unchanged path
  is safe: the stored value is compared first.
* **Removing** a document in a form deletes the file only if that file was
  uploaded in the same session and therefore belongs to nothing. A file the row
  already pointed at is retired by the save.
* **Deleting a record** is a soft delete, so its files are kept and the deletion
  can be undone.

Files are data, not source: `backend/.gitignore` ignores `/uploads`. A database
dump carries the paths, not the pictures, so restoring a dump onto a machine
without the uploads folder brings every row back with a broken image.

## Auditing

```bash
npm run check:documents
```

Reads the database and the uploads folder and reports both directions: records
pointing at files that are not there, and files nothing points at. It exits
non-zero when a referenced file is missing, so it can sit in a deploy check.

Two things it accounts for, and anything else that touches these files should
too:

1. **Soft-deleted records keep their documents.** A file held by a deleted
   tenant is reported as retained, not as an orphan.
2. **Every organization is scanned.** A record in another organization — even
   one the logged-in account cannot see — still owns its files. Never empty
   `uploads/` to "clean up": delete only the files the audit lists as referenced
   by nothing at all.

The UI degrades rather than breaking when a file has gone missing: a vanished
photograph falls back to the person icon in the list and the profile header, and
a missing identity card says so in the record instead of showing a broken image.
