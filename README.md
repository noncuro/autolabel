# Email Sorting System

Super simple email sorting system that uses OpenAI to categorize emails into labels: "To Reply", "To Read", "To Archive". WIP so it's written for a single user.

## Features
- Automatically categorizes emails using OpenAI
- Integrates with Gmail via Gmail API
- Provides a minimal web interface to manage categorized emails
- Real-time email processing and categorization

## Configuration
1. Set up Google OAuth 2.0 credentials in Google Cloud Console
2. Enable Gmail API in your Google Cloud Project
3. Configure Redis - e.g. with Upstash
4. Set the `CRON_SECRET` to anything.
5. Set the `ENCRYPTION_KEY` with `openssl rand -hex 32`

## Usage
1. Run `npm run dev`
2. Authenticate with Google via the frontend
3. Press "save creds to Redis"
4. Set up a cron job to run `http://localhost:3000/api/cron/categorize` with the `CRON_SECRET` as the token
5. Profit.