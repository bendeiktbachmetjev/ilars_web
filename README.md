# iLARS Website

Multi-page website for the iLARS application.

## Structure

```
Web/
├── index.html          # Home page
├── about.html          # About Us page
├── project.html        # Our Project page
├── features.html       # Features page
├── contact.html        # Contact page
├── components/         # Reusable components
│   ├── header.html     # Navigation bar
│   └── footer.html     # Footer
├── css/
│   └── style.css       # All styles
├── js/
│   ├── components.js   # Component loader & navbar logic
│   └── main.js         # Form handling & general JS
└── images/             # Assets
```

## Architecture

- **Pages**: Multi-page site (one HTML per page)
- **Navigation**: Shared navbar markup on each page, active state highlighting in `js/main.js`
- **Styling**: Single CSS file with organized sections
- **JavaScript**: `js/main.js` handles navbar + forms

## Run locally

From project root:

```bash
python3 -m http.server 8080
```

Open: http://localhost:8080/Web/

Or from Web folder:

```bash
cd Web
python3 -m http.server 8080
```

Open: http://localhost:8080/

## Pages

- **Home** (`index.html`): Hero section with app showcase
- **About Us** (`about.html`): Team mission and values
- **Our Project** (`project.html`): Problem statement and solution
- **Features** (`features.html`): Detailed feature descriptions
- **Contact** (`contact.html`): Contact form

## Railway Deployment

This project is configured for Railway deployment. The `server.py` file serves the static files.

**Deployment Configuration:**
- Port: 8000 (or Railway's PORT environment variable)
- Start Command: `python3 server.py`
- Build: NIXPACKS (automatic Python detection)

**To deploy:**
1. Create a new Railway project
2. Connect your GitHub repository
3. Set root directory to `web/`
4. Railway will automatically detect `railway.json` and deploy

## Features

- **Patient Login**: Patients can log in with their patient code
- **Doctor Login**: Doctors can sign in with Google authentication (Firebase)
- **Doctor Dashboard**: Full patient management interface with charts and analytics

## Firebase Configuration

The app uses Firebase for Google authentication. Make sure to:
1. Add your Railway domain to Firebase Console → Authentication → Settings → Authorized domains
2. Firebase config is in `js/firebase/config.js`

## Notes

- Navigation automatically highlights the current page
- All forms have client-side validation
- Doctor dashboard requires Google authentication
