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

## Notes

- Navigation automatically highlights the current page
- All forms have client-side validation (backend integration TODO)
