# 🔒 Security Fix Guide: Remove Exposed Credentials

## ⚠️ Critical Issue

Your `.env` file containing **Supabase credentials** was accidentally committed to the public repository on **July 5, 2026** (commit `8d3ec2c`).

### Exposed Data
- `VITE_SUPABASE_PROJECT_ID`: `nrmsagzrtmofjoblurjp`
- `VITE_SUPABASE_PUBLISHABLE_KEY`: (JWT token)
- `VITE_SUPABASE_URL`: `https://nrmsagzrtmofjoblurjp.supabase.co`

## ✅ What We've Already Done

1. ✅ Sanitized the current `.env` file (credentials removed)
2. ✅ Created `.env.example` template for developers
3. ✅ Updated `.gitignore` to prevent future commits

## 🔴 What Still Needs to Be Done

### Step 1: Rotate Your Supabase Credentials (URGENT)

Your old credentials are compromised and visible in git history. **Do this first:**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `nrmsagzrtmofjoblurjp`
3. Navigate to **Settings → API Keys**
4. **Regenerate the Anon Key** (Publishable Key)
5. Copy the new key and update your local `.env`

```bash
# Update your local .env with new credentials
nano .env
# Or use your preferred editor
```

### Step 2: Clean Git History (Remove Credentials)

This step rewrites the entire git history to remove `.env` from all commits.

#### Option A: Using BFG Repo-Cleaner (Recommended - Faster)

**Prerequisites:**
- Java installed on your machine
- Git installed

**Steps:**

```bash
# 1. Install BFG (macOS)
brew install bfg

# 2. Clone a fresh copy of your repo as a mirror
git clone --mirror https://github.com/dangducdung78057-code/stage-plan-workbench.git
cd stage-plan-workbench.git

# 3. Delete the .env file from all commits
bfg --delete-files .env

# 4. Clean and repack the repository
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force push the cleaned history back
git push --force --all
git push --force --tags

# 6. Clean up
cd ..
rm -rf stage-plan-workbench.git
```

#### Option B: Using git-filter-branch (Built-in but Slower)

```bash
# Clone your repo (not as mirror)
git clone https://github.com/dangducdung78057-code/stage-plan-workbench.git
cd stage-plan-workbench

# Remove .env from all commits
git filter-branch --tree-filter 'rm -f .env' HEAD

# Clean
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force-with-lease origin main
```

### Step 3: Verify the Cleanup

After pushing, verify the `.env` file is completely removed from history:

```bash
# Clone a fresh copy and check
cd /tmp
git clone https://github.com/dangducdung78057-code/stage-plan-workbench.git
cd stage-plan-workbench

# This should show NO .env files in history
git log --all --full-history -- .env

# This should be empty
git show HEAD:.env 2>&1 | head -5
```

### Step 4: Notify Collaborators

⚠️ **Everyone must re-clone the repository** after this force push:

```bash
# Collaborators should do this:
cd ~/stage-plan-workbench
git fetch origin
git reset --hard origin/main
# Or simply re-clone
rm -rf ~/stage-plan-workbench
git clone https://github.com/dangducdung78057-code/stage-plan-workbench.git
```

---

## 📋 Checklist

- [ ] **URGENT**: Rotate Supabase credentials
- [ ] Choose cleanup method (BFG or git-filter-branch)
- [ ] Run cleanup script
- [ ] Force push cleaned history
- [ ] Verify cleanup with git log checks
- [ ] Notify all collaborators to re-clone
- [ ] Document incident in team chat

---

## 🛡️ Future Prevention

To prevent this from happening again:

1. **Use `.env.local` during development** (already in `.gitignore`)
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your real credentials (local only)
   ```

2. **Use GitHub Secrets for CI/CD**
   - Set `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` etc. as repository secrets
   - Reference them in your workflow files

3. **Pre-commit hooks to catch secrets**
   ```bash
   npm install --save-dev husky lint-staged
   npx husky install
   ```

4. **Automated scanning with git-secrets**
   ```bash
   brew install git-secrets
   git secrets --install
   git secrets --register-aws
   ```

---

## 📚 References

- [BFG Repo-Cleaner Official Guide](https://rtyley.github.io/bfg-repo-cleaner/)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)

---

**Last Updated:** 2026-07-11  
**Status:** ⚠️ Pending manual cleanup (Steps 1-4)
