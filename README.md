# AIM Team Master Board

Automated task tracking and reporting system for the AIM team across GitHub and Asana projects.

## Overview

This project automatically syncs tasks from 8 different projects (3 GitHub + 5 Asana) to a centralized GitHub Project Board called **AIM_Team_Master_Board**. It provides daily standup reports, weekly sprint metrics, and burndown/burnup charts.

### Features

✅ **Automated Sync**: Syncs twice daily (9 AM and 5 PM Pacific Time)
✅ **Multi-Platform**: Aggregates from GitHub Projects and Asana
✅ **Team Filtering**: Only tracks tasks assigned to your 11 developers
✅ **Status Mapping**: Intelligently maps different status names to standard columns
✅ **Daily Standup**: Shows tasks updated today and current blockers
✅ **Weekly Metrics**: Velocity, completion rate, and trends
✅ **Burndown/Burnup Charts**: Visual progress tracking

## Project Structure

```
Claude_Reportings/
├── .github/
│   └── workflows/
│       ├── sync-tasks.yml          # Automated twice-daily sync
│       └── manual-reports.yml      # Manual report generation
├── config/
│   ├── project-config.json         # Project definitions and settings
│   └── status-mapping.json         # Status name mappings
├── scripts/
│   ├── fetch-github-tasks.js       # Fetch from GitHub Projects
│   ├── fetch-asana-tasks.js        # Fetch from Asana
│   ├── sync-to-master-board.js     # Sync to master board
│   ├── generate-standup.js         # Daily standup reports
│   ├── generate-metrics.js         # Weekly sprint metrics
│   └── generate-charts.js          # Burndown/burnup charts
├── reports/
│   ├── daily/                      # Daily standup reports
│   └── weekly/                     # Weekly metrics and charts
├── developers aim.csv              # Team member list
├── project.md                      # Project tracking info
└── package.json
```

## Setup Instructions

### Prerequisites

- Node.js 20 or higher
- GitHub Personal Access Token with `project` and `repo` permissions
- Asana Personal Access Token

### Step 1: Create Master Project Board

1. Go to https://github.com/orgs/Kochava/projects
2. Click "New project"
3. Name it: **AIM_Team_Master_Board**
4. Choose "Board" template
5. Add columns: `Backlog`, `Ready`, `In Progress`, `Blocked`, `Done`
6. Note the project number (from the URL: `/projects/XX`)

### Step 2: Generate API Tokens

**GitHub Token:**
1. Go to Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Select permissions:
   - Repository access: All repositories (or specific repos)
   - Permissions: `Projects` (Read and write), `Pull requests` (Read), `Issues` (Read)
4. Copy the token

**Asana Token:**
1. Go to Asana → My Settings → Apps → Personal Access Tokens
2. Click "Create new token"
3. Give it a name (e.g., "AIM Board Sync")
4. Copy the token

### Step 3: Configure Repository Secrets

Add these secrets to your GitHub repository:

```
Settings → Secrets and variables → Actions → New repository secret
```

Add:
- `GH_PROJECT_TOKEN`: Your GitHub Personal Access Token
- `ASANA_TOKEN`: Your Asana Personal Access Token

Add this variable:
- `MASTER_PROJECT_NUMBER`: The project number from Step 1

### Step 4: Install Dependencies

```bash
cd Claude_Reportings
npm install
```

### Step 5: Create Environment File

```bash
cp .env.example .env
```

Edit `.env` and fill in:
```env
GITHUB_TOKEN=your_github_token_here
GITHUB_ORG=Kochava
MASTER_PROJECT_NUMBER=XX  # From Step 1

ASANA_TOKEN=your_asana_token_here
ASANA_WORKSPACE_GID=8559678460204

TIMEZONE=America/Los_Angeles
DEVELOPERS_FILE=developers aim.csv
```

### Step 6: Test Locally

Run each script individually to test:

```bash
# Fetch GitHub tasks
npm run fetch-github

# Fetch Asana tasks
npm run fetch-asana

# Sync to master board
npm run sync

# Generate reports
npm run generate-standup
npm run generate-metrics
npm run generate-charts
```

### Step 7: Enable GitHub Actions

1. Push your code to the repository
2. Go to Actions tab
3. Enable workflows
4. The sync will run automatically at 9 AM and 5 PM Pacific Time

## Usage

### Automated Sync

The system automatically runs twice daily:
- **9:00 AM PT**: Morning sync + daily standup
- **5:00 PM PT**: Evening sync + daily standup
- **Mondays at 9 AM**: Also generates weekly metrics and charts

### Manual Sync

Trigger manually from GitHub Actions:

1. Go to Actions tab
2. Select "Sync Tasks to Master Board"
3. Click "Run workflow"

### Manual Reports

Generate specific reports:

1. Go to Actions tab
2. Select "Generate Reports Manually"
3. Choose report type:
   - Daily standup
   - Weekly metrics
   - Charts
   - All
4. Click "Run workflow"

### Viewing Reports

Reports are committed to the `reports/` folder:

- **Daily Reports**: `reports/daily/standup-YYYY-MM-DD.md`
- **Weekly Metrics**: `reports/weekly/metrics-YYYY-MM-DD.md`
- **Charts**: `reports/weekly/charts-YYYY-MM-DD.md`

## Configuration

### Adding/Removing Projects

Edit [config/project-config.json](config/project-config.json):

```json
{
  "projects": {
    "github": [
      {
        "id": 1,
        "name": "Project Name",
        "projectNumber": 19,
        "url": "..."
      }
    ],
    "asana": [
      {
        "id": 4,
        "name": "Project Name",
        "projectGid": "1234567890",
        "url": "..."
      }
    ]
  }
}
```

### Status Mapping

Edit [config/status-mapping.json](config/status-mapping.json) to customize how statuses map:

```json
{
  "mappings": {
    "github": {
      "Todo": "Ready",
      "In Progress": "In Progress"
    },
    "asana": {
      "default": {
        "Not Started": "Ready"
      }
    }
  }
}
```

### Team Members

Edit [developers aim.csv](developers%20aim.csv) to add/remove team members:

```csv
name,gid,email,github_user,team
John Doe,1234567890,john@example.com,johndoe,core
```

## Reports Explained

### Daily Standup Report

Shows:
- Overview metrics (total tasks, updated today, blocked)
- Tasks by status
- Tasks updated today (grouped by developer)
- Blocked tasks with details
- Team activity summary table

### Weekly Sprint Metrics

Shows:
- Key metrics (completion rate, velocity)
- Trend analysis
- Developer breakdown table
- Project breakdown table
- Top performers

### Burndown/Burnup Charts

Shows:
- Burndown chart (remaining work vs. ideal)
- Burnup chart (completed work over 8 weeks)
- Velocity trend
- Status distribution

## Troubleshooting

### Common Issues

**Sync fails with "Project not found"**
- Check that `MASTER_PROJECT_NUMBER` is correct
- Verify GitHub token has project permissions

**No tasks synced**
- Check that tasks are assigned to developers in `developers aim.csv`
- Verify GitHub usernames and Asana GIDs match exactly

**Asana rate limiting**
- The script includes 500ms delays between API calls
- If still hitting limits, increase delay in sync script

**Status not mapping correctly**
- Run Asana fetch first to discover status names
- Check `reports/asana-status-discovery.json`
- Update `config/status-mapping.json` accordingly

### Debug Mode

Run scripts with verbose output:

```bash
NODE_ENV=development npm run sync
```

## API Documentation

- [GitHub Projects GraphQL API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
- [Asana API Tasks Reference](https://developers.asana.com/reference/tasks)

## Contributing

To modify or extend the system:

1. Test locally first
2. Update configuration files as needed
3. Run all scripts to verify
4. Commit and push changes
5. Monitor first automated run

## Support

For questions or issues:
- Check the troubleshooting section
- Review workflow logs in GitHub Actions
- Check `reports/sync-report.json` for sync statistics

---

**Last Updated**: 2026-03-12
**Version**: 1.0.0
