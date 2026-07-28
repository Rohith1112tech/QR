# QR Content Generator

A dynamic, temporary QR Content sharing application. Users can upload text, photos, or videos, select an expiration time (1 hour, 24 hours, or 7 days), and generate a custom QR code. When scanned, the QR code redirects to a clean glassmorphic viewer. After the expiry window, the content is automatically pruned from both database storage and file CDNs.

---

## Technical Stack
- **Frontend**: React (Vite) + Vanilla CSS (Glassmorphism & animations) — Hosted on **Netlify**
- **Backend API**: Node.js (Express) — Hosted on **Render**
- **Database**: MongoDB Atlas
- **Media Storage**: Cloudinary CDN

---

## Local Development (Quickstart)

Thanks to the **Local Fallback Mode**, you can run and test this application locally out-of-the-box without configuring MongoDB or Cloudinary credentials!

### 1. Run the Backend API
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   *Note: Without a `.env` configuration, the backend boots in local fallback mode, creating a local `database.json` and a `/uploads` folder to handle image/video storage on disk.*

### 2. Run the Frontend App
1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the Vite development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Deployment Instructions

### 1. Backend Deployment (Render)
1. Push the code to a Git repository (GitHub / GitLab).
2. Connect your Git repository to **Render**.
3. Create a new **Web Service** selecting the `backend` subfolder as the base directory (or use Render's Blueprint with the included [render.yaml](file:///d:/QR/backend/render.yaml) file).
4. Add the following **Environment Variables** in the Render settings dashboard:

| Variable Name | Description | Example / Note |
| :--- | :--- | :--- |
| `NODE_ENV` | Production environment flag | `production` |
| `PORT` | Listening port (handled by Render) | `5000` |
| `MONGODB_URI` | MongoDB Atlas Connection string | `mongodb+srv://user:pass@cluster.mongodb.net/...` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Name | Get from Cloudinary Dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | Get from Cloudinary Dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | Get from Cloudinary Dashboard |
| `FRONTEND_URL` | Netlify App URL (for CORS allowance) | `https://your-app-name.netlify.app` |

---

### 2. Frontend Deployment (Netlify)
1. Connect your Git repository to **Netlify**.
2. Create a new site from Git, choosing the `frontend` subfolder as the base directory.
3. Configure build settings:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
   *Note: These settings are pre-configured in [netlify.toml](file:///d:/QR/frontend/netlify.toml), which also handles React Router redirections.*
4. In Netlify's **Site configuration** -> **Environment variables**, set the following key:

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `VITE_API_URL` | URL pointing to your deployed Render API | `https://qr-content-generator-api.onrender.com` |
