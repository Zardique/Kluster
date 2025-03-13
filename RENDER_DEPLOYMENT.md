# Deploying Kluster to Render

This guide will help you deploy the Kluster game to Render.

## Prerequisites

- A Render account (sign up at [render.com](https://render.com))
- Your Kluster code in a Git repository (GitHub, GitLab, or Bitbucket)

## Deployment Steps

1. **Create a new Web Service on Render**

   - Log in to your Render dashboard
   - Click on "New" and select "Web Service"
   - Connect your Git repository
   - Select the repository containing your Kluster game

2. **Configure the Web Service**

   - Name: `kluster` (or any name you prefer)
   - Environment: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `node server.js`
   - Select the appropriate instance type (Free tier is fine for testing)

3. **Set Environment Variables (if needed)**

   - Click on "Environment" tab
   - Add any required environment variables

4. **Deploy**

   - Click "Create Web Service"
   - Render will automatically build and deploy your application

5. **Access Your Deployed Application**

   - Once deployment is complete, you can access your application at the URL provided by Render
   - The URL will be in the format: `https://kluster.onrender.com` (if you named your service "kluster")

## Manual Deployment

If you prefer to deploy manually without connecting a Git repository:

1. Create a new Web Service on Render
2. Choose "Deploy from .zip file"
3. Upload a .zip file containing your Kluster code
4. Configure as described above

## Troubleshooting

- If you encounter any issues, check the logs in the Render dashboard
- Make sure your `package.json` includes all necessary dependencies
- Verify that your `server.js` file is correctly configured to serve your application 