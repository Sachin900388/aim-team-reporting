# Quick Setup Guide

Follow these steps to get the AIM Team Master Board running.

## ⚡ Quick Start (5 minutes)

### 1. Create Master Project (2 min)

1. Visit: https://github.com/orgs/Kochava/projects
2. Click **"New project"**
3. Name: `AIM_Team_Master_Board`
4. Template: **Board**
5. Add Status field with columns:
   - Backlog
   - Ready
   - In Progress
   - Blocked
   - Done
6. Copy project number from URL (e.g., `/projects/42` → number is `42`)

### 2. Get API Tokens (2 min)

**GitHub Token:**
- Go to: https://github.com/settings/tokens?type=beta
- Click "Generate new token"
- Scopes: `Projects (read/write)`, `Issues (read)`, `Pull requests (read)`
- Copy token → Save as `GH_PROJECT_TOKEN`

**Asana Token:**
- Go to: https://app.asana.com/-/developer_console
- Click "Create new token"
- Copy token → Save as `ASANA_TOKEN`

### 3. Configure Repository (1 min)

Add secrets to GitHub:
1. Go to: https://github.com/Kochava/Claude_Reportings/settings/secrets/actions
2. Add three items:

| Type | Name | Value |
|------|------|-------|
| Secret | `GH_PROJECT_TOKEN` | Your GitHub token |
| Secret | `ASANA_TOKEN` | Your Asana token |
| Variable | `MASTER_PROJECT_NUMBER` | Your project number (from step 1) |

### 4. Install & Test

```bash
# Clone and setup
cd Claude_Reportings
npm install

# Create .env file
cp .env.example .env

# Edit .env with your tokens
nano .env

# Test sync (dry run)
npm run fetch-github
npm run fetch-asana

# If successful, run full sync
npm run sync

# Generate first report
npm run generate-standup
```

### 5. Enable Automation

```bash
# Commit and push
git add .
git commit -m "feat: setup AIM Team Master Board"
git push

# The GitHub Actions will now run automatically!
```

## ✅ Verification Checklist

After setup, verify:

- [ ] Master project board exists at https://github.com/orgs/Kochava/projects/XX
- [ ] Project has Status field with 5 columns
- [ ] Both tokens work (test with fetch commands)
- [ ] Secrets are added to GitHub repository
- [ ] `npm run sync` completes without errors
- [ ] Reports appear in `reports/` folder
- [ ] GitHub Actions workflow runs successfully

## 📅 What Happens Next

Once setup is complete:

**Daily (Automatic):**
- 9:00 AM PT: Sync tasks + generate standup report
- 5:00 PM PT: Sync tasks + generate standup report

**Weekly (Automatic):**
- Monday 9:00 AM: Also generate metrics + charts

**Manual:**
- Go to Actions tab → Run workflow anytime

## 🔧 Configuration Files

You may want to customize:

| File | Purpose | When to Edit |
|------|---------|--------------|
| `config/project-config.json` | Project list | Add/remove projects |
| `config/status-mapping.json` | Status names | Fix status mapping |
| `developers aim.csv` | Team members | Add/remove developers |

## 🆘 Quick Troubleshooting

**Nothing synced?**
```bash
# Check if tasks are assigned to team members
npm run fetch-github
cat reports/github-tasks.json | grep -c "primaryAssignee"
```

**Wrong status mapping?**
```bash
# Discover Asana statuses
npm run fetch-asana
cat reports/asana-status-discovery.json

# Then update config/status-mapping.json
```

**Workflow not running?**
- Check if workflows are enabled: Settings → Actions → General
- Verify secrets are set correctly
- Check workflow logs for errors

## 📚 Full Documentation

For detailed information, see [README.md](README.md).

## 🎯 Next Steps

After successful setup:

1. Review first sync report in `reports/sync-report.json`
2. Check daily standup in `reports/daily/`
3. Wait for first weekly metrics (or run manually)
4. Adjust status mappings if needed
5. Customize report frequency in workflows

---

**Setup Time**: ~5 minutes
**First Results**: Immediately after first sync
**Questions**: Check README.md or workflow logs
