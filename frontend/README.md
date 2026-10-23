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

The backend exposes /api/scans/{scanId}/viewer and /api/scans/{scanId}/viewer/file?path=... . Both require a session and a READY scan, and verify organization membership or platform administrator status. File paths must match database records exactly. R2 files are streamed through the backend, keeping credentials and object URLs out of the browser and allowing the voxel loader to resolve its matching binary without changing R2 CORS. This adds backend bandwidth; no public bucket access is required. Starting views now live in R2 at viewer-settings/scans/{scanId}/settings.json. Saving replaces the first camera pose while preserving other settings. An uploaded settings.json is used as the initial template; the managed copy keeps original upload metadata intact and is the file to include as settings.json in a future viewer ZIP. Existing database-saved viewpoints remain a read-only fallback until a settings file is saved. V8 is retained as applied migration history; new saves do not update its camera columns.

PUT /api/scans/{scanId}/viewer/starting-view is restricted to platform administrators and requires a CSRF token. Restart the backend after adding these endpoints. Share, Download and Delete buttons remain placeholders.
