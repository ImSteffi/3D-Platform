# 3D Platform frontend

React + TypeScript + Vite. The frontend uses the Java backend through `/api`; Vite proxies those requests to `localhost:8080` during development.

## Run

```bash
npm install
npm run dev
```

Validation:

```bash
npm run build
npm run lint
```

## Source structure

```text
src/
  main.tsx                  # Browser entry point
  app/
    App.tsx                 # Route definitions
  features/
    auth/
      api/auth.ts           # Login, logout, CSRF, current user
      pages/LoginPage/
    dashboard/
      pages/DashboardPage/
      components/AdminOverview/
    organizations/
      api/                  # Organization and member requests
      pages/                # Organization list and details
    projects/
      api/                  # Admin and client project requests
      pages/                # Client project library and detail view
      components/           # Project galleries and admin project creation
    scans/
      api/scans.ts          # Publish orchestration and scan requests
      types.ts              # Shared scan draft type
      utils/sceneFiles.ts   # File paths, directory reading, sizes
      components/           # Scan forms, lists, draft cards, file metadata
  shared/
    layout/WorkspaceLayout/ # Persistent sidebar, header, current-user context
    pages/NotFoundPage/
    ui/                     # Reusable UI components
    styles/
      tokens.css            # Colors, typography, motion timing
      global.css            # Resets, shared utilities, reduced-motion rule
```

Each styled component or page has its own folder and adjacent CSS file. Components import their own CSS. Only shared design tokens, resets, and layout utilities live in the global stylesheets. API modules contain HTTP requests, not JSX; pages compose the feature components.

## Routes

- `/login`: sign in.
- `/dashboard`: admin overview or client overview, based on the current user.
- `/projects`: client project gallery; `?q=` filters project and organization names.
- `/projects/:projectId`: published scans in an authorized client project.
- `/organizations`: admin organization list; `?q=` filters organization names.
- `/organizations/:organizationId`: admin member management and project cards.
- `/organizations/:organizationId/projects/:projectId`: admin project detail, scans, and publishing.

`WorkspaceLayout` retrieves the current session and provides user data to its pages. Backend authorization remains authoritative; frontend navigation visibility does not grant access.

## Visual design and motion

The theme uses charcoal surfaces, warm orange actions, subtle borders, and architectural wireframe artwork. The artwork is decorative and is not a generated preview of a client's uploaded scan. Data counts come from the backend; no sample metrics are used in the application.

The workspace shell persists during navigation. Route content fades and moves into place, cards respond to hover, forms enter smoothly, and upload progress animates between completed parts. The operating system's reduced-motion preference disables animations and transitions.

## Publishing

Creating a project saves it immediately. Scan drafts hold browser `File` objects until Publish uploads their contents directly to R2. The backend verifies the files before marking the scan READY. Keep the page open while uploading; resuming an interrupted upload after refreshing is not implemented.

## 3D viewer

Play opens the shared SuperSplat Viewer for admin and client scan cards in a smaller panel with the shared corner radius. The renderer is loaded on demand and destroyed on close. X or Escape closes the panel and restores the project page.

The SuperSplat Viewer and its PlayCanvas peer are pinned in package.json. Each scan currently supports one SOG or PLY scene and an optional matching voxel JSON/binary pair. Walk is selected after loading whenever collision data and scene dimensions allow it; otherwise the viewer uses fly mode and explains why. Administrators can move to a viewpoint and click Set starting view at the top right. The saved position, target and field of view are applied on the next open for every authorized user. Scans without a saved viewpoint use the viewer environment defaults.

The backend exposes /api/scans/{scanId}/viewer and /api/scans/{scanId}/viewer/file?path=... . Both require a session and a READY scan, and verify organization membership or platform administrator status. File paths must match database records exactly. The manifest signs the scene object
for one hour, and the browser fetches scene bytes directly from private R2 without
sending platform cookies. The voxel loader derives the binary URL from the metadata
URL, so collisionUrl remains a same-origin resolver. Each JSON/BIN request checks
access and responds with a no-store 307 redirect to its independently signed R2 URL;
neither collision file's bytes pass through Java. This keeps the pinned viewer
package unchanged and works for authenticated and public shared viewers.

R2 CORS must allow each frontend origin (scheme, hostname and port), GET/HEAD
and any requested headers; retain PUT for uploads. Expose ETag, Content-Length,
Content-Range and Accept-Ranges. For embeds the origin is the hosted viewer's
origin, not the client website surrounding its iframe. Signed file responses use
private, no-store. Turning sharing/hosting off blocks new manifests and collision
resolutions immediately, but already-issued R2 links can work until their one-hour
expiry and already-loaded data cannot be revoked. The bucket stays private and
R2 credentials stay on the server. Starting views overwrite the scan's own uploaded settings.json in R2. When no settings file was uploaded, the first save creates projects/{projectId}/scans/{scanId}/settings.json and records it in scan_files. Saves preserve other settings and update the file byte count. Legacy viewer-settings overrides remain readable and are deleted after the next successful admin save into the scan folder. Existing database-saved viewpoints remain a fallback. V11 grants only UPDATE(size_bytes); no new tables or columns are added.

PUT /api/scans/{scanId}/viewer/starting-view is restricted to platform administrators and requires a CSRF token. Restart the backend after adding these endpoints. Share supports public URL/IFRAME links and a Shareable switch; Delete is administrator-only with a confirmation dialog.


## Hosted public sharing

The Shareable switch enables or disables public access using a permanent per-scan share token.
URL and IFRAME copy the existing link without enabling sharing. GET /api/scans/{id}/share
reads the saved switch state without modifying it.
Anonymous viewers use /view/{token} and /api/public/views/{token}; they do not
need a login session. Scan data remains in the private R2 bucket.

Set PUBLIC_ORIGIN on the backend to the externally reachable HTTPS origin
of the frontend (for example https://tours.example.com). Without it, local
development uses the browser's current origin. A localhost URL is only usable
on that same computer.

Production hosting must serve the frontend entry point for /view/* and proxy
/api/* to the backend on the same origin. Allow framing on /view/*: do not add
X-Frame-Options DENY/SAMEORIGIN or a restrictive CSP frame-ancestors there.
Keep frame restrictions on authenticated management pages. Serve public viewer
pages with Referrer-Policy: no-referrer and X-Robots-Tag: noindex, nofollow, noarchive.
Do not cache public manifests or scene responses across entitlement changes.

POST /api/scans/{id}/share requires an authenticated scan owner/member or
platform administrator and CSRF. It returns the same link on repeated calls.
DELETE on that endpoint disables sharing without changing its token.
The manifest and every collision resolver request require share_enabled, hosting_enabled
and READY status before issuing one-hour R2 links. Already-issued links remain valid until expiry. hosting_enabled is reserved for trusted administration/billing;
the public and member-facing share endpoints cannot change it. It defaults to
true during the pre-billing phase. A future billing service can suspend and
restore it without replacing the URL. Bytes already received by a visitor
cannot be revoked.
## Scan deletion

DELETE /api/scans/{id} requires a platform administrator and CSRF.
The card asks for confirmation before calling it. Deletion first commits
FAILED status and disables sharing, preventing new viewer/download/upload
requests. It then aborts recorded multipart uploads, deletes recorded R2
objects and managed viewer settings, and finally deletes file and scan rows.
A storage failure retains database keys for retry; missing objects and a
previously deleted scan are safe to retry. There is no automatic retry worker:
an administrator retries Delete after a failure.
Migration V10 grants the backend role DELETE on scans and scan_files.
## Scan previews

Platform admins can use Set preview below Set starting view to capture the
current 3D scene without viewer overlays. The capture is converted from raw
RGBA into an 800x600 PNG and saved to the private R2 object
viewer-previews/scans/{id}/preview.png. Saving replaces the previous preview
and refreshes the shared scan card immediately. There is no file picker.
GET /api/scans/{id}/preview requires scan access; PUT requires an administrator
and CSRF. Missing previews return 204. Inputs are limited to 4 MiB and 2048x2048,
decoded and normalized as PNG. Scan deletion removes the preview as well.
No database migration is needed.