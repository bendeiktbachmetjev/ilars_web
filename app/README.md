# iLARS Patient Web App

Web version of the patient flow: same endpoints and behaviour as the mobile app.

## Flow

1. User opens the main site and clicks **Log in**.
2. On the login page, **patient code** is shown first (no extra “I’m a patient” step).
3. User enters their patient code and clicks **Continue**.
4. Code is validated via `GET /getNextQuestionnaire` with `X-Patient-Code`; on success the code is stored in `sessionStorage` and the user is redirected to **app/index.html**.
5. In the app: **Dashboard** shows “Today’s questionnaire” (from `getNextQuestionnaire`) and a simple LARS chart (from `getLarsData`). User clicks **Fill it now** to open the relevant form (Daily / Weekly / Monthly / EQ-5D-5L).
6. Forms submit to `sendDaily`, `sendWeekly`, `sendMonthly`, `sendEq5d5l` with the same payloads as the mobile app and `X-Patient-Code` header.

## Structure

- **index.html** – Shell: header, dashboard screen, placeholders for form screens.
- **js/config.js** – API base URL and storage keys (same as main site).
- **js/api.js** – API client: `getNextQuestionnaire`, `getLarsData`, `sendDaily`, `sendWeekly`, `sendMonthly`, `sendEq5d5l` (all use `X-Patient-Code`).
- **js/app.js** – Auth check (redirect to `../login.html` if no patient code), logout, screen switching, and calling each view’s `show()` when opening a form screen.
- **js/views/dashboard.js** – Loads next questionnaire and LARS data; “Fill it now” opens the correct form screen.
- **js/views/daily.js**, **weekly.js**, **monthly.js**, **eq5d5l.js** – Form UI and submit logic, matching mobile app fields and payloads.

## Entry

- From main site: **Log in** → enter patient code → redirect to **app/index.html**.
- Direct: opening **app/index.html** without a stored patient code redirects to **../login.html**.
