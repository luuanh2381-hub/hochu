
## AUTOMATIC GIT COMMIT AND PUSH

After completing every coding task, follow this workflow:

1. Inspect git status and git diff.
2. Run relevant tests, syntax checks and build checks.
3. Fix errors caused by your changes before committing.
4. If checks pass, automatically stage only files modified or created for the current task.
5. Create a descriptive commit message using conventional commit style.
6. Automatically push the commit to origin/main.
7. Verify that the push succeeded.
8. Report the commit hash, changed files, tests and push status.

IMPORTANT RULES:
- Do not wait for the user to request a commit.
- Do not ask for confirmation before normal git add, git commit or git push operations.
- Never stage unrelated user changes.
- Never overwrite or discard existing user changes.
- Never use git reset --hard or git clean -fd.
- Never commit API keys, passwords, tokens, .env files or other secrets.
- Never force push.
- If tests fail, do not commit or push. Report the errors.
- If there are merge conflicts, stop and report them.
- If push fails, diagnose the problem and report it.
- Never claim success unless Git confirms it.
