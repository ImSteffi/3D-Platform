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
- `/organizations/:organizationId`: admin member, project, and scan management.

`WorkspaceLayout` retrieves the current session and provides user data to its pages. Backend authorization remains authoritative; frontend navigation visibility does not grant access.

## Visual design and motion

The theme uses charcoal surfaces, warm orange actions, subtle borders, and architectural wireframe artwork. The artwork is decorative and is not a generated preview of a client's uploaded scan. Data counts come from the backend; no sample metrics are used in the application.

The workspace shell persists during navigation. Route content fades and moves into place, cards respond to hover, forms enter smoothly, and upload progress animates between completed parts. The operating system's reduced-motion preference disables animations and transitions.

## Publishing

Creating a project saves it immediately. Scan drafts hold browser `File` objects until Publish uploads their contents directly to R2. The backend verifies the files before marking the scan READY. Keep the page open while uploading; resuming an interrupted upload after refreshing is not implemented.

The redesign does not add a 3D renderer. Published scan cards currently display metadata; authorized download links and the viewer are a separate feature.
