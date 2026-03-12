[![CI](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/ci.yml)

# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/014d9fee-c69a-4f4e-9e5d-5bad87cd70e9

## How can I edit this code?

There are several ways of editing your application.

### Use Lovable

Simply visit the [Lovable Project](https://lovable.dev/projects/014d9fee-c69a-4f4e-9e5d-5bad87cd70e9) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

### Use your preferred IDE

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed.

Install Node using nvm:  
https://github.com/nvm-sh/nvm#installing-and-updating

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm install

# Step 4: Start the development server.
npm run dev
```

### Edit a file directly in GitHub

- Navigate to the desired file(s)
- Click the **Edit (pencil icon)** at the top right
- Commit the changes

### Use GitHub Codespaces

- Go to the repository main page
- Click the **Code** button
- Select the **Codespaces** tab
- Click **New codespace**
- Edit files and push changes when finished

## Technologies used

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

Open the project in Lovable and click:

**Share → Publish**

## Custom domains

To connect a custom domain:

Project → **Settings → Domains → Connect Domain**

Documentation:  
https://docs.lovable.dev/features/custom-domain#custom-domain

## Environment Variables

| Variable | Description | Format |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | JWT string (safe to expose client-side) |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project reference ID | Alphanumeric string |

Create a `.env` file at the project root with these values.

**Never commit real keys to version control.**  
The `.env` file is already included in `.gitignore`.