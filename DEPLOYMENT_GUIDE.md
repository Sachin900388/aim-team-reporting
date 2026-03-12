# Deployment Checklist

Follow these steps in order to deploy the AIM Team Master Board.

## Step 1: Create Master Project Board ⏱️ 2 minutes

1. **Open GitHub Projects**
   - Go to: https://github.com/orgs/Kochava/projects
   - Click the green **"New project"** button

2. **Configure the Project**
   - Name: `AIM_Team_Master_Board`
   - Description: `Automated task tracking for AIM team across GitHub and Asana`
   - Template: Select **"Board"**
   - Click **"Create"**

3. **Setup Status Field**
   - You should see a "Status" field by default
   - Click on "Status" to edit it
   - Make sure it has these exact options (in this order):
     - `Backlog`
     - `Ready`
     - `In Progress`
     - `Blocked`
     - `Done`

4. **Get the Project Number**
   - Look at the URL in your browser
   - It will be: `https://github.com/orgs/Kochava/projects/XX`
   - Copy the number `XX` (e.g., if URL ends with `/projects/42`, the number is `42`)
   - **Write it down**: ___________

---

## Step 2: Create GitHub Personal Access Token ⏱️ 2 minutes

1. **Open Token Settings**
   - Go to: https://github.com/settings/tokens?type=beta
   - Click **"Generate new token"**

2. **Configure Token**
   - Token name: `AIM Master Board Sync`
   - Expiration: `90 days` (or custom)
   - Description: `Sync tasks to AIM Team Master Board`

3. **Set Permissions**
   Under "Repository access":
   - Select: **"All repositories"** (or just Kochava repos)

   Under "Permissions":
   - **Repository permissions**:
     - Issues: `Read-only`
     - Pull requests: `Read-only`
   - **Organization permissions**:
     - Projects: `Read and write` ✅ **IMPORTANT**

4. **Generate and Save**
   - Click **"Generate token"**
   - Copy the token (starts with `github_pat_...`)
   - **SAVE IT NOW** - you won't see it again!
   - Paste it here temporarily: ___________

---

## Step 3: Create Asana Personal Access Token ⏱️ 2 minutes

1. **Open Asana Settings**
   - Go to: https://app.asana.com/0/my-apps
   - Or: Asana → Click your photo → My Settings → Apps → Manage Developer Apps

2. **Create New Token**
   - Click **"Create new token"**
   - Token name: `AIM Master Board Sync`
   - Click **"Create token"**

3. **Save Token**
   - Copy the token (long string of characters)
   - **SAVE IT NOW** - you won't see it again!
   - Paste it here temporarily: ___________

---

## Step 4: Create Local .env File ⏱️ 1 minute

Run this command to create your .env file:

\`\`\`bash
cat > .env << 'EOF'
# GitHub Configuration
GITHUB_TOKEN=PASTE_YOUR_GITHUB_TOKEN_HERE
GITHUB_ORG=Kochava
MASTER_PROJECT_NUMBER=PASTE_PROJECT_NUMBER_HERE

# Asana Configuration
ASANA_TOKEN=PASTE_YOUR_ASANA_TOKEN_HERE
ASANA_WORKSPACE_GID=8559678460204

# Timezone for sync scheduling
TIMEZONE=America/Los_Angeles

# Developer team CSV file
DEVELOPERS_FILE=developers aim.csv
EOF
\`\`\`

Then edit the file and replace:
- `PASTE_YOUR_GITHUB_TOKEN_HERE` with your GitHub token from Step 2
- `PASTE_PROJECT_NUMBER_HERE` with your project number from Step 1
- `PASTE_YOUR_ASANA_TOKEN_HERE` with your Asana token from Step 3

---

## Step 5: Test Locally ⏱️ 3 minutes

Run these commands to test the sync:

\`\`\`bash
# Test GitHub fetch
npm run fetch-github

# Expected output: "Found X team members with GitHub accounts"
# Expected output: "Saved X GitHub tasks to ..."

# Test Asana fetch
npm run fetch-asana

# Expected output: "Found X team members with Asana accounts"
# Expected output: "Saved X Asana tasks to ..."

# Check the data
cat reports/github-tasks.json | grep -c "title"
cat reports/asana-tasks.json | grep -c "title"
\`\`\`

If you see tasks being fetched, you're good!

**⚠️ IMPORTANT**: Don't run `npm run sync` yet - it will try to create items in the master board. We'll do that after deploying to GitHub.

---

## Step 6: Configure GitHub Repository Secrets ⏱️ 2 minutes

1. **Open Repository Settings**
   - Go to: https://github.com/Kochava/Claude_Reportings/settings/secrets/actions
   - (Or: Your repo → Settings → Secrets and variables → Actions)

2. **Add Repository Secrets**
   Click **"New repository secret"** for each:

   **Secret 1:**
   - Name: `GH_PROJECT_TOKEN`
   - Value: [Paste your GitHub token from Step 2]
   - Click "Add secret"

   **Secret 2:**
   - Name: `ASANA_TOKEN`
   - Value: [Paste your Asana token from Step 3]
   - Click "Add secret"

3. **Add Repository Variable**
   - Click the **"Variables"** tab
   - Click **"New repository variable"**
   - Name: `MASTER_PROJECT_NUMBER`
   - Value: [Paste your project number from Step 1]
   - Click "Add variable"

---

## Step 7: Deploy to GitHub ⏱️ 1 minute

\`\`\`bash
# Add all files
git add .

# Commit (but NOT the .env file - it's in .gitignore)
git commit -m "feat: deploy AIM Team Master Board automation"

# Push to GitHub
git push origin main
\`\`\`

---

## Step 8: Enable GitHub Actions ⏱️ 1 minute

1. **Check Actions Tab**
   - Go to: https://github.com/Kochava/Claude_Reportings/actions
   - You should see the workflow "Sync Tasks to Master Board"

2. **Trigger First Run (Manual)**
   - Click on "Sync Tasks to Master Board"
   - Click **"Run workflow"** dropdown
   - Click the green **"Run workflow"** button
   - This will run the first sync manually

3. **Monitor the Run**
   - Watch the workflow run in real-time
   - It should:
     - ✅ Fetch GitHub tasks
     - ✅ Fetch Asana tasks
     - ✅ Sync to master board
     - ✅ Generate reports
     - ✅ Commit reports

---

## Step 9: Verify Everything Works ⏱️ 2 minutes

1. **Check Master Board**
   - Go to: https://github.com/orgs/Kochava/projects/[YOUR_NUMBER]
   - You should see tasks from all 8 projects!

2. **Check Reports**
   - Go to: https://github.com/Kochava/Claude_Reportings/tree/main/reports
   - You should see:
     - `reports/daily/standup-YYYY-MM-DD.md`
     - `reports/sync-report.json`

3. **Check Workflow Schedule**
   - Go to Actions tab
   - The workflow will now run automatically:
     - Every day at 9:00 AM Pacific
     - Every day at 5:00 PM Pacific

---

## ✅ Deployment Complete!

Your AIM Team Master Board is now:
- ✅ Syncing automatically twice per day
- ✅ Tracking all 8 projects
- ✅ Filtering to 11 team members
- ✅ Generating daily standup reports
- ✅ Generating weekly metrics (every Monday)

### What Happens Next?

**Daily (Automatic):**
- 9:00 AM PT: Sync + Daily standup report
- 5:00 PM PT: Sync + Daily standup report

**Weekly (Automatic):**
- Monday 9:00 AM PT: Also generates metrics + charts

**Manual:**
- You can trigger sync anytime from Actions tab

### View Your Reports

Reports are in the `reports/` folder:
- Daily: `reports/daily/standup-YYYY-MM-DD.md`
- Weekly: `reports/weekly/metrics-YYYY-MM-DD.md`
- Charts: `reports/weekly/charts-YYYY-MM-DD.md`

---

## 🆘 Troubleshooting

**Workflow failed?**
- Check the error in Actions tab
- Verify secrets are set correctly
- Check token permissions

**No tasks synced?**
- Verify developers in CSV have correct GitHub usernames and Asana GIDs
- Check that tasks are actually assigned to team members

**Status mapping wrong?**
- Check `reports/asana-status-discovery.json` for actual status names
- Update `config/status-mapping.json` accordingly

**Need help?**
- Check [README.md](README.md) for full documentation
- Review workflow logs in Actions tab
- Check `reports/sync-report.json` for sync details

---

**Deployment Date**: 2026-03-12
**Estimated Total Time**: 15 minutes
