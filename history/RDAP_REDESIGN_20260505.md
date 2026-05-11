# RDAP Service Redesign History (2026-05-05)

## 1. Project Overview
- **Goal:** Differentiate `rdap.kr` from the original KISA source and establish a unique brand identity.
- **Concept:** "Eco-Tech Modern" (Deep Green & Emerald theme, Card-based UI).

## 2. Key Changes
### UI/UX & Design
- **Unified CSS:** Created `rdap/client/css/rdap-v3.css` for centralized style management.
- **Color Palette:** Transitioned from Purple/Blue to Deep Green (#1b5e20) and Emerald (#10b981).
- **Layout:** Implemented a card-based layout with rounded corners (16px) and subtle shadows.
- **Compactness:** Optimized vertical spacing and paddings for a more streamlined experience.
- **Interactivity:** Fixed cursor styles (pointer) for clickable elements and added hover effects.

### Functional Updates
- **Landing Page:** Changed the default landing page to 'About RDAP' (`rdap-about-ko.html`) via Dockerfile.
- **API Guide:** Added 'Entity' (Contact/Org) query documentation to the About page.
- **Dashboard:** Redesigned the real-time stats dashboard (`rdap-dashboard-v2.html`) to match the new theme.
- **Footer:** Removed the 'Gallery' link to focus on core RDAP services.

### Deployment
- **Git:** All changes committed and pushed to `main` branch.
- **CI/CD:** Deployed to live environment via GitHub Actions.

## 3. Files Modified
- `rdap/client/css/rdap-v3.css` (New)
- `rdap/rdap-about-ko.html`
- `rdap/rdap-about-en.html`
- `rdap/rdap-javascript-ko.html`
- `rdap/rdap-javascript-en.html`
- `rdap/bootstrap_server/rdap-dashboard-v2.html`
- `rdap/Dockerfile`
