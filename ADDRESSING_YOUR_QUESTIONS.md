# Addressing Your Questions

## Question 1: Why are assignee names not showing in Asana?

### Issue
Tasks in the master dashboard don't show who's responsible.

### Root Cause
The sync script was creating tasks without assigning them to team members.

### Solution Implemented
✅ **Updated** `scripts/sync-to-asana-master.js` to include assignee information:
- For Asana source tasks: Assigns using the original assignee's GID
- Assignee name still appears in task description as backup

### Next Steps to See Assignees
**Option 1: Clear and Re-sync (Recommended)**
```bash
# This will delete all tasks and re-create them with assignees
npm run sync
```

**Option 2: Manually Update Existing Tasks**
- Go to the master dashboard
- Manually assign each task to the appropriate team member
- Future syncs will have assignees automatically

---

## Question 2: Why aren't GitHub projects imported?

### Issue
GitHub projects (AIM Incrementality #19, SlingTV #33, Atlas MCP #28) are not being imported.

### Root Cause
**GitHub token lacks permissions** to access Kochava organization projects.

### Current Status
```
✗ AIM Incrementality (#19): Not accessible
✗ SlingTV (#33): Not accessible
✗ Atlas MCP (#28): Not accessible
```

### Why This Happens
The GitHub token needs:
1. **Organization-level approval** from Kochava admins
2. **Projects (Read/Write)** permission for organization projects
3. Projects might not exist at those numbers, OR
4. Projects are private and token doesn't have access

### Solutions

#### Option 1: Get Organization Admin Approval (Recommended for Org Projects)

1. Contact Kochava GitHub organization admin
2. Ask them to:
   - Go to: https://github.com/organizations/Kochava/settings/personal-access-tokens/active
   - Find your token request
   - Approve it with Projects access

3. Once approved, add projects back to config:
```json
{
  "projects": {
    "github": [
      {
        "id": 1,
        "name": "AIM Incrementality",
        "projectNumber": 19,
        "url": "https://github.com/orgs/Kochava/projects/19/views/3"
      },
      {
        "id": 2,
        "name": "SlingTV",
        "projectNumber": 33,
        "url": "https://github.com/orgs/Kochava/projects/33"
      },
      {
        "id": 3,
        "name": "Atlas MCP",
        "projectNumber": 28,
        "url": "https://github.com/orgs/Kochava/projects/28"
      }
    ]
  }
}
```

#### Option 2: Verify Project Numbers

The projects might be at different numbers. To find them:

1. Go to: https://github.com/orgs/Kochava/projects
2. Find each project and note the number from the URL
3. Update `config/project-config.json` with correct numbers

#### Option 3: Use GitHub Issues Instead

If projects aren't accessible, we could fetch from GitHub repositories directly:
- Fetch issues/PRs from specific repositories
- Filter by team member assignments
- Sync those to Asana master dashboard

#### Option 4: Accept Asana-Only Solution (Current State)

Continue with just Asana projects:
- ✅ 207 tasks from 4 Asana projects
- ✅ All automation working
- ✅ Reports generating correctly
- Add GitHub projects later when permissions are resolved

---

## Immediate Actions

### Fix 1: Update Assignees in Master Dashboard

I've already updated the sync script. To apply it:

**Method A: Delete and Re-sync Everything**
```bash
# 1. Go to Asana master dashboard
# 2. Select all tasks (Ctrl+A or Cmd+A)
# 3. Delete them
# 4. Run sync again
npm run sync
```

**Method B: Keep Existing, Only New Tasks Will Have Assignees**
- Existing 207 tasks: No assignee (manual assignment needed)
- New tasks from next sync: Will have assignees automatically

### Fix 2: GitHub Projects

**Immediate:** Contact Kochava GitHub org admin for token approval

**Alternative:** Verify correct project numbers:
1. Visit each project URL from [project.md](project.md)
2. Check if they exist
3. Note the actual project numbers
4. Update config file

---

## Summary

| Issue | Status | Action Required |
|-------|--------|----------------|
| Assignees missing | ✅ Fixed in code | Re-sync or manual assignment |
| GitHub projects not imported | ⚠️ Token permissions | Contact org admin OR verify project numbers |

---

## Testing the Fixes

### Test Assignee Fix
```bash
# Delete one task from master dashboard manually
# Then run sync - it should recreate with assignee
npm run sync
```

### Test GitHub Access (once permissions fixed)
```bash
npm run fetch-github
# Should show: "Saved X GitHub tasks to ..."
```

---

**Updated**: 2026-03-13
**Next Steps**: Choose how to handle assignees (re-sync vs manual) and resolve GitHub access
